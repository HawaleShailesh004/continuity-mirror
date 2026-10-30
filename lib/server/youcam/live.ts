import "server-only";
import type { z } from "zod";
import type { StepKind } from "@/lib/contracts/api";
import { sniffImage } from "@/lib/contracts/mocks/image";
import { log } from "../log";
import { YouCamHttpError, type TaskState, type YouCamAdapter, type YouCamTemplate } from "./adapter";
import { ENDPOINTS, TEMPLATE_PAGE_SIZE } from "./endpoints";
import { CreditResponse, FeatureCostResponse, FileInitResponse, TaskCreateResponse, TaskPollResponse, TemplatesResponse } from "./schemas";

export type LiveOptions = {
  base: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Backoff before retry n (ms); jitter ×0.5–1.5 is applied. */
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

type Retry = "safe" | "only-429";

export class LiveYouCamAdapter implements YouCamAdapter {
  readonly mode = "live" as const;
  private base: string;
  private fetch: typeof fetch;
  private timeoutMs: number;
  private backoffMs: number[];
  private sleep: (ms: number) => Promise<void>;
  private random: () => number;

  constructor(private opts: LiveOptions) {
    this.base = opts.base.replace(/\/$/, "");
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.backoffMs = opts.backoffMs ?? [1000, 3000, 7000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  /** One HTTP call with timeout. Throws YouCamHttpError; never includes headers in messages. */
  private async once(url: string, init: RequestInit, label: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new YouCamHttpError(timedOut ? "timeout" : "network", `${label}: ${timedOut ? "timed out" : "network error"}`);
    }
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const text = await res.text().catch(() => "");
      throw new YouCamHttpError(res.status, `${label}: HTTP ${res.status} ${text.slice(0, 200)}`, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
    }
    return res;
  }

  /**
   * Retries with backoff + jitter. "safe" calls (reads, free uploads) retry on 429/5xx/timeout/network.
   * Task creation retries only on 429: after a 5xx or timeout the task may exist and be charged.
   */
  private async withRetry<T>(label: string, retry: Retry, call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (err) {
        const e = err as YouCamHttpError;
        const may = e instanceof YouCamHttpError && (retry === "safe" ? e.retryable : e.httpStatus === 429);
        if (!may || attempt >= this.backoffMs.length) throw err;
        const wait = Math.max(e.retryAfterMs ?? 0, this.backoffMs[attempt]! * (0.5 + this.random()));
        log.warn("youcam.retry", { label, attempt: attempt + 1, status: String(e.httpStatus), waitMs: Math.round(wait) });
        await this.sleep(wait);
      }
    }
  }

  private async api<S extends z.ZodType>(method: "GET" | "POST", path: string, schema: S, body: unknown, retry: Retry): Promise<z.infer<S>> {
    const label = `${method} ${path.split("?")[0]}`;
    return this.withRetry(label, retry, async () => {
      const res = await this.once(
        this.base + path,
        {
          method,
          headers: { Authorization: `Bearer ${this.opts.apiKey}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        label,
      );
      const json = await res.json().catch(() => undefined);
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new YouCamHttpError("schema", `${label}: response drift: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ").slice(0, 300)}`);
      }
      return parsed.data;
    });
  }

  async uploadImage(bytes: Uint8Array, opts: { fileName: string; contentType: "image/jpeg" | "image/png" }) {
    const init = await this.api(
      "POST",
      ENDPOINTS.fileUpload,
      FileInitResponse,
      { files: [{ content_type: opts.contentType, file_name: opts.fileName, file_size: bytes.byteLength }] },
      "safe",
    );
    const file = init.data.files[0]!;
    const put = file.requests[0]!;
    // The signed storage URL is not YouCam's API: never send our Authorization header there.
    await this.withRetry("PUT upload", "safe", () =>
      this.once(put.url, { method: put.method || "PUT", headers: { ...put.headers, "Content-Length": String(bytes.byteLength) }, body: bytes as Uint8Array<ArrayBuffer> }, "PUT upload"),
    );
    return { fileId: file.file_id };
  }

  async createTask(kind: StepKind, body: Record<string, unknown>) {
    const res = await this.api("POST", ENDPOINTS.task(kind), TaskCreateResponse, body, "only-429");
    return { taskId: res.data.task_id };
  }

  async getTask(kind: StepKind, taskId: string): Promise<TaskState> {
    const res = await this.api("GET", ENDPOINTS.taskStatus(kind, taskId), TaskPollResponse, undefined, "safe");
    const d = res.data;
    if (d.task_status === "running") return { status: "running" };
    if (d.task_status === "success") {
      if (!d.results?.url) throw new YouCamHttpError("schema", `GET task: success without results.url`);
      return { status: "success", resultUrl: d.results.url };
    }
    return { status: "error", youcamCode: d.error ?? "unknown_internal_error", ...(d.error_message ? { message: d.error_message } : {}) };
  }

  async getBalance() {
    const res = await this.api("GET", ENDPOINTS.credit, CreditResponse, undefined, "safe");
    return res.results.reduce((sum, r) => sum + r.amount, 0);
  }

  async getFeatureCosts() {
    const res = await this.api("GET", ENDPOINTS.featureCost, FeatureCostResponse, undefined, "safe");
    return Object.fromEntries(res.result.skus.map((s) => [s.description, s.amount]));
  }

  async listTemplates(): Promise<YouCamTemplate[]> {
    const out: YouCamTemplate[] = [];
    let token: string | null | undefined;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ page_size: String(TEMPLATE_PAGE_SIZE), ...(token ? { starting_token: token } : {}) });
      const res = await this.api("GET", `${ENDPOINTS.templates}?${qs}`, TemplatesResponse, undefined, "safe");
      out.push(...res.data.templates.map((t) => ({ id: t.id, thumb: t.thumb, title: t.title, category: t.category_name, keepUsersColour: t.keep_users_color })));
      token = res.data.next_token;
      if (!token || res.data.templates.length === 0) break;
    }
    return out;
  }

  async fetchResult(url: string) {
    const res = await this.withRetry("GET result", "safe", () => this.once(url, { method: "GET" }, "GET result"));
    if (!res.body) throw new YouCamHttpError("schema", "GET result: empty body");
    const declared = res.headers.get("content-type") ?? "";
    // Colour-step results are PNG, the others JPEG. If storage doesn't say so (e.g. octet-stream), read the bytes.
    if (/^image\/(jpeg|png|webp)\b/.test(declared)) return { body: res.body, contentType: declared };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sniffed = sniffImage(bytes);
    if (sniffed.type === "unknown" || sniffed.type === "heic") throw new YouCamHttpError("schema", "GET result: not an image");
    return { body: bytes, contentType: `image/${sniffed.type}` };
  }
}
