import type { MockScenario, StepKind } from "@/lib/contracts/api";

/** Per-call hints. Only the mock adapter reads them; live and replay ignore them. */
export type CallMeta = { mockScenario?: MockScenario };

export type YouCamTemplate = { id: string; thumb: string; title: string; category: string; keepUsersColour: boolean };

/**
 * The only way server code talks to YouCam:
 * - live:   real HTTP (15 s timeouts, retries with jitter where safe, schema-checked responses)
 * - mock:   deterministic fake with simulated latency; results carry a visible "MOCK" watermark
 * - replay: serves tests/fixtures/youcam by request signature (CI, engine tests)
 */
export interface YouCamAdapter {
  readonly mode: "live" | "mock" | "replay";

  /** POST /s2s/v2.0/file then PUT the bytes. Uploads are free. */
  uploadImage(bytes: Uint8Array, opts: { fileName: string; contentType: "image/jpeg" | "image/png" }, meta?: CallMeta): Promise<{ fileId: string }>;

  /** POST the task. `body` comes from lib/catalog/pipeline with placeholders already filled. */
  createTask(kind: StepKind, body: Record<string, unknown>, meta?: CallMeta): Promise<{ taskId: string }>;

  /** GET the task once (the caller owns polling cadence, locks and the call budget). */
  getTask(kind: StepKind, taskId: string): Promise<TaskState>;

  /** Remaining units: sum of results[].amount from GET /s2s/v1.0/client/credit. */
  getBalance(): Promise<number>;

  /** Units per SKU description from GET /s2s/v2.0/credit/feature-cost. */
  getFeatureCosts(): Promise<Record<string, number>>;

  /** All hair-transfer templates (paged upstream, page_size < 50). */
  listTemplates(): Promise<YouCamTemplate[]>;

  /** Fetch a result URL (valid ~2 h) as bytes, for streaming to the client. */
  fetchResult(url: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; contentType: string }>;
}

export type TaskState =
  | { status: "running" }
  | { status: "success"; resultUrl: string }
  | { status: "error"; youcamCode: string; message?: string };

/** Transport-level failures (HTTP 4xx/5xx, timeouts, schema drift). Task errors are TaskState, not this. */
export class YouCamHttpError extends Error {
  constructor(
    readonly httpStatus: number | "timeout" | "network" | "schema",
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "YouCamHttpError";
  }

  get retryable() {
    return this.httpStatus === 429 || this.httpStatus === "timeout" || this.httpStatus === "network" || (typeof this.httpStatus === "number" && this.httpStatus >= 500);
  }
}
