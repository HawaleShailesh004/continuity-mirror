import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { STEP_META } from "@/lib/catalog/pipeline";
import templates from "@/lib/catalog/youcam-templates.json";
import { MockScenario, StepKind } from "@/lib/contracts/api";
import { YouCamHttpError, type CallMeta, type TaskState, type YouCamAdapter, type YouCamTemplate } from "./adapter";

/**
 * Everything about a mock task lives in its id, so polling works on any serverless instance.
 * `src` is the uploaded file id, or the previous mock task id when chained by URL.
 */
type MockTask = { k: StepKind; t: number; d: number; s: MockScenario; l: string; src?: string; prev?: string };

const TASK_ERRORS: Partial<Record<MockScenario, string>> = {
  no_shoulder: "error_no_shoulder",
  hair_too_short: "error_hair_too_short",
  face_pose: "error_face_pose",
  unavailable: "error_inference",
};

const TASK_PREFIX = "mock-task.";
const RESULT_PREFIX = "mock://result/";

function hashInt(s: string) {
  return createHash("sha256").update(s).digest().readUInt32BE(0);
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function label(kind: StepKind, b: Record<string, unknown>): string {
  if (typeof b.template_id === "string") return b.template_id;
  if (b.ref_file_id) return "custom style";
  if (Array.isArray(b.palettes)) return (b.palettes as { color?: string }[]).map((p) => p.color).join("→");
  if (kind === "makeup-vto") return "brows";
  return kind;
}

/**
 * Deterministic fake YouCam for YOUCAM_MODE=mock. Behaves like the real API where it matters to the
 * engine: uploads, task lifecycle with 3–8 s latency, free errors, results chained by URL, unit balance.
 * Every result is the source image with a visible MOCK watermark, so it can't pass for a real one.
 * Uploaded bytes are held per instance; if a poll lands elsewhere the result is a placeholder card.
 */
export class MockYouCamAdapter implements YouCamAdapter {
  readonly mode = "mock" as const;
  private files = new Map<string, Uint8Array>();
  private charged = new Set<string>();
  private rendered = new Map<string, Buffer>();
  private balance: number;
  private now: () => number;
  private latencyScale: number;

  constructor(opts: { now?: () => number; latencyScale?: number; balance?: number } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.latencyScale = opts.latencyScale ?? 1;
    this.balance = opts.balance ?? 1000;
  }

  private throttle(meta?: CallMeta) {
    if (meta?.mockScenario === "rate_limited") throw new YouCamHttpError(429, "mock: rate limited", 5000);
  }

  private decode(taskId: string): MockTask {
    if (!taskId.startsWith(TASK_PREFIX)) throw new YouCamHttpError(404, "mock: unknown task");
    try {
      const t = JSON.parse(Buffer.from(taskId.slice(TASK_PREFIX.length), "base64url").toString("utf8")) as MockTask;
      StepKind.parse(t.k);
      MockScenario.parse(t.s);
      return t;
    } catch {
      throw new YouCamHttpError(404, "mock: unknown task");
    }
  }

  async uploadImage(bytes: Uint8Array, _opts: { fileName: string; contentType: "image/jpeg" | "image/png" }, meta?: CallMeta) {
    this.throttle(meta);
    const fileId = `mock-file-${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`;
    this.files.set(fileId, bytes);
    return { fileId };
  }

  async createTask(kind: StepKind, body: Record<string, unknown>, meta?: CallMeta) {
    this.throttle(meta);
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" && /^<.*>$/.test(value)) throw new YouCamHttpError(400, `mock: unfilled placeholder in ${key}`);
    }
    const srcUrl = typeof body.src_file_url === "string" ? body.src_file_url : undefined;
    if (srcUrl && !srcUrl.startsWith(RESULT_PREFIX)) throw new YouCamHttpError(400, "mock: src_file_url is not a mock result");
    const createdAt = this.now();
    const seed = hashInt(`${JSON.stringify(body)}:${createdAt}:${Math.random()}`);
    const task: MockTask = {
      k: kind,
      t: createdAt,
      d: Math.round((3000 + (seed % 5000)) * this.latencyScale * (meta?.mockScenario === "slow" ? 4 : 1)),
      s: meta?.mockScenario ?? "ok",
      l: label(kind, body),
      ...(srcUrl ? { prev: srcUrl.slice(RESULT_PREFIX.length) } : { src: String(body.src_file_id ?? "") }),
    };
    return { taskId: TASK_PREFIX + Buffer.from(JSON.stringify(task)).toString("base64url") };
  }

  async getTask(_kind: StepKind, taskId: string): Promise<TaskState> {
    const task = this.decode(taskId);
    if (task.s === "timeout" || this.now() - task.t < task.d) return { status: "running" };
    const code = TASK_ERRORS[task.s];
    if (code) return { status: "error", youcamCode: code, message: "mock error" };
    if (!this.charged.has(taskId)) {
      this.charged.add(taskId);
      this.balance -= STEP_META[task.k].units;
    }
    return { status: "success", resultUrl: `${RESULT_PREFIX}${taskId}` };
  }

  async getBalance() {
    return this.balance;
  }

  async getFeatureCosts() {
    // Labels as YouCam returns them (Hair Color and Makeup VTO aren't listed upstream; measured as 1 each).
    return { "AI Hair Style Virtual Try-On V2.0 (Preset)": 2, "AI Hair Style Virtual Try-On V2.0 (Custom)": 2 };
  }

  async listTemplates(): Promise<YouCamTemplate[]> {
    return templates;
  }

  async fetchResult(url: string) {
    if (!url.startsWith(RESULT_PREFIX)) throw new YouCamHttpError(404, "mock: not a mock result url");
    return { body: new Uint8Array(await this.render(url.slice(RESULT_PREFIX.length))), contentType: "image/jpeg" };
  }

  /** Walk a result chain back to the uploaded file: one watermark for the whole chain. */
  private chain(taskId: string): { source?: Uint8Array; labels: string[] } {
    const task = this.decode(taskId);
    if (task.prev) {
      const prev = this.chain(task.prev);
      return { source: prev.source, labels: [...prev.labels, task.l] };
    }
    return { source: task.src ? this.files.get(task.src) : undefined, labels: [task.l] };
  }

  private async render(taskId: string): Promise<Buffer> {
    const cached = this.rendered.get(taskId);
    if (cached) return cached;
    const { source, labels } = this.chain(taskId);
    const base = source ? sharp(source) : sharp({ create: { width: 768, height: 1024, channels: 3, background: "#C9D3E0" } });
    const { width, height } = source ? await sharp(source).metadata() : { width: 768, height: 1024 };
    const band = Math.round(height * 0.07);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${Math.round(width / 4)}" fill="#ffffff" fill-opacity="0.35" stroke="#000000" stroke-opacity="0.25" transform="rotate(-20 ${width / 2} ${height / 2})">MOCK</text>
      <rect x="0" y="${height - band}" width="${width}" height="${band}" fill="#16202E" fill-opacity="0.78"/>
      <text x="16" y="${Math.round(height - band / 2 + band * 0.13)}" font-family="sans-serif" font-size="${Math.round(band * 0.36)}" fill="#ffffff">MOCK · ${escapeXml(labels.join(" + ").slice(0, 48))}</text>
    </svg>`;
    const out = await base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer();
    this.rendered.set(taskId, out);
    return out;
  }
}
