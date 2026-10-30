import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Test/CI only. Paths are marked turbopackIgnore so fixtures are never traced into the deploy.
import { STEP_META } from "@/lib/catalog/pipeline";
import type { StepKind } from "@/lib/contracts/api";
import { YouCamHttpError, type TaskState, type YouCamAdapter, type YouCamTemplate } from "./adapter";
import { CreditResponse, FeatureCostResponse, TaskPollResponse, TemplatesResponse } from "./schemas";

type Recorded = { fixture: string; endpoint: string; signature: string; outcome: TaskState };
type Exchange = { step: string; path?: string; request?: Record<string, unknown>; body?: unknown };

const SOURCE_KEYS = new Set(["src_file_id", "src_file_url", "ref_file_id", "ref_file_url"]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${SOURCE_KEYS.has(k) ? '"<src>"' : canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Request signature: endpoint + body with source ids/urls blanked (they differ every run). */
export function signature(endpoint: string, body: Record<string, unknown>) {
  return `${endpoint} ${canonical(body)}`;
}

/**
 * Serves recorded live responses (tests/fixtures/youcam) by request signature. Exact match first;
 * with `strict: false` an unmatched task falls back to a recorded success on the same endpoint.
 * Each task reports `running` for `pollsUntilDone` polls before its recorded outcome.
 */
export class ReplayYouCamAdapter implements YouCamAdapter {
  readonly mode = "replay" as const;
  private recorded: Recorded[] = [];
  private tasks = new Map<string, { rec: Recorded; polls: number }>();
  private uploads = 0;

  constructor(private opts: { fixturesDir: string; publicDir: string; strict?: boolean; pollsUntilDone?: number }) {
    for (const group of ["hair-transfer", "hair-color", "makeup-vto"]) {
      const dir = join(/*turbopackIgnore: true*/ opts.fixturesDir, group);
      if (!existsSync(/*turbopackIgnore: true*/ dir)) continue;
      for (const file of readdirSync(/*turbopackIgnore: true*/ dir)) {
        const exchanges = this.load(group, file.replace(/\.json$/, "")) as Exchange[];
        exchanges.forEach((ex, i) => {
          if (ex.step !== "task-create" || !ex.path || !ex.request) return;
          const final = exchanges.slice(i + 1).find((e) => e.step === "task-final");
          const poll = TaskPollResponse.safeParse(final?.body);
          if (!poll.success) return;
          const d = poll.data.data;
          const name = file.replace(/\.json$/, "");
          const outcome: TaskState =
            d.task_status === "success" ? { status: "success", resultUrl: `replay://result/${name}` } : { status: "error", youcamCode: d.error ?? "unknown_internal_error" };
          this.recorded.push({ fixture: name, endpoint: ex.path, signature: signature(ex.path, ex.request), outcome });
        });
      }
    }
  }

  private load(group: string, name: string): unknown {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ this.opts.fixturesDir, group, `${name}.json`), "utf8")).data;
  }

  /** Signatures available, for debugging unmatched requests. */
  get signatures() {
    return this.recorded.map((r) => r.signature);
  }

  async uploadImage() {
    return { fileId: `replay-file-${++this.uploads}` };
  }

  async createTask(kind: StepKind, body: Record<string, unknown>) {
    const endpoint = STEP_META[kind].endpoint;
    const sig = signature(endpoint, body);
    // The image isn't in the signature, so the same request can have a success and an error recorded
    // (B0's bad-input tests reused all_short_bob). Prefer the success.
    const exact = this.recorded.filter((r) => r.signature === sig);
    const rec =
      exact.find((r) => r.outcome.status === "success") ??
      exact[0] ??
      (this.opts.strict === false ? this.recorded.find((r) => r.endpoint === endpoint && r.outcome.status === "success") : undefined);
    if (!rec) throw new YouCamHttpError(400, `replay: no fixture for ${sig}`);
    const taskId = `replay-task-${this.tasks.size + 1}`;
    this.tasks.set(taskId, { rec, polls: 0 });
    return { taskId };
  }

  async getTask(_kind: StepKind, taskId: string): Promise<TaskState> {
    const task = this.tasks.get(taskId);
    if (!task) throw new YouCamHttpError(404, "replay: unknown task");
    return task.polls++ < (this.opts.pollsUntilDone ?? 1) ? { status: "running" } : task.rec.outcome;
  }

  async getBalance() {
    return CreditResponse.parse((this.load("account", "credit") as { body: unknown }).body).results.reduce((s, r) => s + r.amount, 0);
  }

  async getFeatureCosts() {
    const res = FeatureCostResponse.parse((this.load("account", "feature-cost") as { body: unknown }).body);
    return Object.fromEntries(res.result.skus.map((s) => [s.description, s.amount]));
  }

  async listTemplates(): Promise<YouCamTemplate[]> {
    return Array.from({ length: 6 }, (_, i) => TemplatesResponse.parse((this.load("templates", `page-${i}`) as { body: unknown }).body).data.templates)
      .flat()
      .map((t) => ({ id: t.id, thumb: t.thumb, title: t.title, category: t.category_name, keepUsersColour: t.keep_users_color }));
  }

  /** Maps a recorded case to the genuine result image kept in public/mock/results, if there is one. */
  async fetchResult(url: string) {
    const name = url.replace("replay://result/", "").replace(/^persona-[a-d]-/, "");
    const candidates = [name, name.replace(/^colour-chain-url-amara$/, "amara__bobcut_curly__colour-1C1714"), name.replace(/^colour-fileid-grace$/, "grace__pixie__colour-BEBDB8")];
    const file = candidates.map((c) => join(/*turbopackIgnore: true*/ this.opts.publicDir, "mock", "results", `${c}.jpg`)).find((p) => existsSync(/*turbopackIgnore: true*/ p)) ?? join(/*turbopackIgnore: true*/ this.opts.publicDir, "mock", "results", "meera__all_short_bob.jpg");
    return { body: new Uint8Array(readFileSync(/*turbopackIgnore: true*/ file)), contentType: "image/jpeg" };
  }
}
