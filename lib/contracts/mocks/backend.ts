// A contract-faithful fake of the whole /api surface, written against fetch's Request/Response so the
// same code serves MSW (browser + Node tests) and the B1 route stubs. Every response it produces is
// parsed by the contract schemas in tests. Job progress is derived from elapsed time, so state can be
// persisted and resumed (the browser worker keeps it in localStorage across reloads).
import { catalog as defaultCatalog, planSteps, UnknownCatalogIdError, type CatalogLookup, type PlannedStep } from "@/lib/catalog";
import {
  CreateJobRequest,
  CreateShareMeta,
  CreateVoteRequest,
  MOCK_SCENARIO_HEADER,
  MockScenario,
  type Capabilities,
  type CreateBaselineResponse,
  type Job,
  type JobSpec,
  type JobStep,
  type PrivacyReceipt,
  type ShareManifest,
  type ShareResults,
  type StatusResponse,
} from "../api";
import { canonicalJson } from "../canonical";
import { errorBody, fromYoucamCode, HTTP_STATUS, type ErrorBody, type ErrorCode } from "../errors";
import { pickResultImage } from "./fixtures";
import { normalisedSize, sha256Hex, sniffImage, toBase64 } from "./image";

export type MockBackendOptions = {
  /** Default scenario; a request's x-cm-mock-scenario header overrides it. */
  scenario?: MockScenario;
  /** 1 = realistic latency (hair-transfer ≈ 7 s), 0 = instant. */
  latencyScale?: number;
  now?: () => number;
  /** Loads a public path such as /mock/results/x.jpg. */
  loadImage: (publicPath: string) => Promise<ArrayBuffer>;
  sessionUnitCap?: number;
  catalog?: CatalogLookup;
  version?: string;
  /** Called after every state change (used by the browser worker to persist). */
  onChange?: (state: MockState) => void;
  /**
   * false: accept jobs for baselines this backend didn't create (the B1 stub sits behind the real
   * /api/baselines route until B3 replaces the jobs routes). Default true.
   */
  requireKnownBaseline?: boolean;
};

type StoredBaseline = { id: string; fileId: string; width: number; height: number; createdAt: number };
type StoredJob = {
  id: string;
  baselineId: string;
  clientRequestId: string;
  spec: JobSpec;
  idemKey: string;
  scenario: MockScenario;
  /** Index of the step that fails, with the error it fails with. */
  failure?: { step: number; error: ErrorBody };
  hangs?: boolean;
  createdAt: number;
};
type StoredShare = {
  token: string;
  ownerKey: string;
  items: { key: string; label: string; image: Uint8Array; contentType: string }[];
  votes: { itemKey: string; note?: string; createdAt: number }[];
  expiresAt: number;
};
export type MockState = {
  baselines: StoredBaseline[];
  jobs: StoredJob[];
  failedOnce: string[];
};

export const MOCK_CAPABILITIES: Capabilities = {
  hairStyle: true,
  hairColour: true,
  brows: true,
  headwear: false,
  scarf: false,
  regrowth: true,
  shares: true,
};
export const MOCK_LIMITS = { uploadMaxBytes: 4_000_000, uploadMaxLongSide: 1600, uploadMinShortSide: 512 };

const STEP_MS: Record<PlannedStep["kind"], number> = { "hair-transfer": 7000, "hair-color": 6000, "makeup-vto": 6000 };
const QUEUED_MS = 400;
const JOB_TIMEOUT_MS = 180_000;
const RESULT_TTL_MS = 110 * 60_000;
const RECORD_TTL_MS = 24 * 3600_000;
const VOTES_PER_SHARE = 5;

const iso = (ms: number) => new Date(ms).toISOString();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

function fail(code: ErrorCode, extra: Partial<Omit<ErrorBody, "code">> = {}, headers: Record<string, string> = {}) {
  return json({ error: errorBody(code, extra) }, HTTP_STATUS[code], headers);
}

function randomToken(bytes = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function zodDetails(issues: readonly { path: PropertyKey[]; message: string }[]) {
  return issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

export class MockBackend {
  private baselines = new Map<string, StoredBaseline>();
  private jobs = new Map<string, StoredJob>();
  private shares = new Map<string, StoredShare>();
  private failedOnce = new Set<string>();
  private votesLeft = new Map<string, number>();
  private opts: Required<Omit<MockBackendOptions, "onChange" | "catalog">> & Pick<MockBackendOptions, "onChange">;
  private catalog: CatalogLookup;

  constructor(options: MockBackendOptions) {
    this.opts = {
      scenario: "ok",
      latencyScale: 1,
      now: () => Date.now(),
      sessionUnitCap: 24,
      version: "mock",
      requireKnownBaseline: true,
      ...options,
    };
    this.catalog = options.catalog ?? defaultCatalog;
  }

  setScenario(scenario: MockScenario) {
    this.opts.scenario = scenario;
  }

  setLatencyScale(scale: number) {
    this.opts.latencyScale = scale;
  }

  reset() {
    this.baselines.clear();
    this.jobs.clear();
    this.shares.clear();
    this.failedOnce.clear();
    this.votesLeft.clear();
    this.changed();
  }

  exportState(): MockState {
    return { baselines: [...this.baselines.values()], jobs: [...this.jobs.values()], failedOnce: [...this.failedOnce] };
  }

  importState(state: MockState) {
    const now = this.opts.now();
    this.baselines = new Map(state.baselines.filter((b) => now - b.createdAt < RECORD_TTL_MS).map((b) => [b.id, b]));
    this.jobs = new Map(state.jobs.filter((j) => now - j.createdAt < RECORD_TTL_MS).map((j) => [j.id, j]));
    this.failedOnce = new Set(state.failedOnce);
  }

  /** Returns undefined for paths outside the mocked API (MSW then passes the request through). */
  async handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").slice(1); // ["api", ...]
    if (parts[0] !== "api") return undefined;
    const method = request.method.toUpperCase();
    const scenario = this.scenarioFor(request);
    const [, a, b, c, d] = parts;

    try {
      if (a === "status" && !b && method === "GET") return this.status(scenario);
      if (a === "baselines" && !b && method === "POST") return await this.createBaseline(request, scenario);
      if (a === "baselines" && b && !c && method === "DELETE") return this.deleteBaseline(b);
      if (a === "jobs" && !b && method === "POST") return await this.createJob(request, scenario);
      if (a === "jobs" && b && !c && method === "GET") return this.getJob(b);
      if (a === "jobs" && b && c === "result" && method === "GET") return await this.getResult(b);
      if (a === "privacy" && b === "receipt" && method === "GET") return this.receipt();
      if (a === "shares" && !b && method === "POST") return await this.createShare(request, url);
      if (a === "shares" && b && !c && method === "GET") return this.getShare(b);
      if (a === "shares" && b && !c && method === "DELETE") return this.deleteShare(request, b);
      if (a === "shares" && b && c === "votes" && method === "POST") return await this.vote(request, b);
      if (a === "shares" && b && c === "results" && method === "GET") return this.shareResults(request, b);
      if (a === "shares" && b && c === "items" && d && method === "GET") return this.shareImage(b, d);
    } catch (err) {
      return fail("INTERNAL", { details: String(err) });
    }
    return fail("NOT_FOUND");
  }

  /* ---------------------------------------------------------------- helpers */

  private scenarioFor(request: Request): MockScenario {
    const parsed = MockScenario.safeParse(request.headers.get(MOCK_SCENARIO_HEADER));
    return parsed.success ? parsed.data : this.opts.scenario;
  }

  private changed() {
    this.opts.onChange?.(this.exportState());
  }

  private ms(base: number, scenario: MockScenario) {
    return base * this.opts.latencyScale * (scenario === "slow" ? 4 : 1);
  }

  private plan(job: StoredJob) {
    return planSteps(job.spec, this.catalog);
  }

  private unitsUsed(): number {
    let used = 0;
    for (const job of this.jobs.values()) {
      if (this.view(job).status !== "failed") used += this.plan(job).reduce((s, p) => s + p.units, 0);
    }
    return used;
  }

  private blocked(scenario: MockScenario): Response | undefined {
    if (scenario === "rate_limited") return fail("RATE_LIMITED", {}, { "retry-after": "5" });
    if (scenario === "live_disabled") return fail("LIVE_DISABLED");
    return undefined;
  }

  /* ----------------------------------------------------------------- status */

  private status(scenario: MockScenario): Response {
    const used = this.unitsUsed();
    const body: StatusResponse = {
      live: scenario !== "live_disabled",
      ...(scenario === "live_disabled" ? { reason: "disabled" as const } : {}),
      mode: "mock",
      session: { unitsUsed: scenario === "budget_exhausted" ? this.opts.sessionUnitCap : used, unitsCap: this.opts.sessionUnitCap },
      capabilities: MOCK_CAPABILITIES,
      limits: MOCK_LIMITS,
      version: this.opts.version,
      serverTime: iso(this.opts.now()),
    };
    return json(body);
  }

  /* -------------------------------------------------------------- baselines */

  private async createBaseline(request: Request, scenario: MockScenario): Promise<Response> {
    const blocked = this.blocked(scenario);
    if (blocked) return blocked;
    let file: FormDataEntryValue | null = null;
    try {
      file = (await request.formData()).get("image");
    } catch {
      return fail("VALIDATION_FAILED", { details: "expected multipart/form-data with an `image` field" });
    }
    if (!file || typeof file === "string") return fail("VALIDATION_FAILED", { details: "missing `image` file" });
    if (file.size > MOCK_LIMITS.uploadMaxBytes) return fail("PAYLOAD_TOO_LARGE");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const img = sniffImage(bytes);
    if (img.type === "heic") return fail("IMAGE_FORMAT", { details: { hint: "heic" } });
    if (img.type === "unknown") return fail("IMAGE_FORMAT");
    if (Math.min(img.width, img.height) < MOCK_LIMITS.uploadMinShortSide) return fail("IMAGE_TOO_SMALL");

    const id = await sha256Hex(bytes);
    const now = this.opts.now();
    const existing = this.baselines.get(id);
    const size = normalisedSize(img.width, img.height);
    const baseline = existing ?? { id, fileId: `mock-file-${id.slice(0, 16)}`, ...size, createdAt: now };
    this.baselines.set(id, baseline);
    this.changed();
    const body: CreateBaselineResponse = {
      baselineId: id,
      width: baseline.width,
      height: baseline.height,
      // Mock returns the original bytes; the real server returns its normalised JPEG.
      normalisedImage: `data:image/${img.type};base64,${toBase64(bytes)}`,
      reused: Boolean(existing),
      expiresAt: iso(baseline.createdAt + RECORD_TTL_MS),
    };
    return json(body, existing ? 200 : 201);
  }

  private deleteBaseline(id: string): Response {
    this.baselines.delete(id);
    for (const [jobId, job] of this.jobs) if (job.baselineId === id) this.jobs.delete(jobId);
    this.changed();
    return json({ deleted: true, upstreamRetentionDays: 30 });
  }

  /* ------------------------------------------------------------------- jobs */

  private async createJob(request: Request, scenario: MockScenario): Promise<Response> {
    const blocked = this.blocked(scenario);
    if (blocked) return blocked;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", { details: "body must be JSON" });
    }
    const parsed = CreateJobRequest.safeParse(raw);
    if (!parsed.success) return fail("VALIDATION_FAILED", { details: zodDetails(parsed.error.issues) });
    const { baselineId, clientRequestId, spec } = parsed.data;

    if (!this.baselines.has(baselineId)) {
      if (this.opts.requireKnownBaseline) return fail("NOT_FOUND", { details: "baseline expired or unknown; upload it again" });
      this.baselines.set(baselineId, { id: baselineId, fileId: "external", width: 768, height: 1024, createdAt: this.opts.now() });
    }

    let steps: PlannedStep[];
    try {
      steps = planSteps(spec, this.catalog);
    } catch (err) {
      if (err instanceof UnknownCatalogIdError) return fail("VALIDATION_FAILED", { details: [{ path: `spec.${err.field}`, message: err.message }] });
      throw err;
    }

    if (spec.kind === "repair" && !this.jobs.has(spec.fromJobId)) return fail("NOT_FOUND", { details: "the job to repair is unknown or expired" });

    const byRequest = [...this.jobs.values()].find((j) => j.clientRequestId === clientRequestId);
    if (byRequest) return json({ job: this.view(byRequest) }, 200);

    const idemKey = `${baselineId}:${canonicalJson(spec)}`;
    const same = [...this.jobs.values()].find((j) => j.idemKey === idemKey);
    if (same && this.view(same).status !== "failed") return json({ job: this.view(same) }, 200);

    const units = steps.reduce((s, p) => s + p.units, 0);
    if (scenario === "budget_exhausted" || this.unitsUsed() + units > this.opts.sessionUnitCap) {
      return fail("SESSION_BUDGET_EXHAUSTED", { details: { unitsCap: this.opts.sessionUnitCap } });
    }

    const job: StoredJob = {
      id: `job_${randomToken(12)}`,
      baselineId,
      clientRequestId,
      spec,
      idemKey,
      scenario,
      createdAt: this.opts.now(),
      ...this.failureFor(scenario, spec, idemKey),
    };
    this.jobs.set(job.id, job);
    this.changed();
    return json({ job: this.view(job) }, 202);
  }

  /** A repair job shows the image of the job it repairs (the mock can't recolour). */
  private sourceSpec(spec: JobSpec): JobSpec {
    for (let hops = 0; spec.kind === "repair" && hops < 4; hops++) {
      const source = this.jobs.get(spec.fromJobId);
      if (!source) break;
      spec = source.spec;
    }
    return spec;
  }

  private failureFor(scenario: MockScenario, spec: JobSpec, idemKey: string): Pick<StoredJob, "failure" | "hangs"> {
    const rejected: Partial<Record<MockScenario, string>> = {
      no_shoulder: "error_no_shoulder",
      hair_too_short: "error_hair_too_short",
      face_pose: "error_face_pose",
    };
    const code = rejected[scenario];
    if (code) return { failure: { step: 0, error: fromYoucamCode(code) } };
    if (scenario === "unavailable") return { failure: { step: 0, error: fromYoucamCode("error_inference") } };
    if (scenario === "timeout") return { hangs: true };
    // partial_failure: the New chapter route fails once (retryable), then succeeds on retry.
    if (scenario === "partial_failure" && spec.kind === "route" && spec.routeId === "new-chapter" && !this.failedOnce.has(idemKey)) {
      this.failedOnce.add(idemKey);
      return { failure: { step: 0, error: fromYoucamCode("error_inference") } };
    }
    return {};
  }

  /** Derive the public Job from elapsed time. */
  private view(job: StoredJob): Job {
    const now = this.opts.now();
    const elapsed = now - job.createdAt;
    const plan = this.plan(job);
    const queuedMs = this.ms(QUEUED_MS, job.scenario);
    const steps: JobStep[] = plan.map((p) => ({ kind: p.kind, status: "pending", units: p.units }));
    let status: Job["status"] = elapsed < queuedMs ? "queued" : "running";
    let error: ErrorBody | undefined;
    let finishedAt = 0;

    if (status === "running") {
      let t = queuedMs;
      for (let i = 0; i < plan.length; i++) {
        const step = steps[i]!;
        const end = t + this.ms(STEP_MS[plan[i]!.kind], job.scenario);
        step.youcamTaskId = `mock-task-${job.id.slice(4)}-${i + 1}`;
        step.startedAt = iso(job.createdAt + t);
        if (job.hangs) {
          const timeoutAt = this.ms(JOB_TIMEOUT_MS, "ok");
          if (elapsed >= timeoutAt) {
            step.status = "failed";
            step.finishedAt = iso(job.createdAt + timeoutAt);
            status = "failed";
            error = errorBody("YOUCAM_TIMEOUT");
          } else step.status = "running";
          break;
        }
        if (elapsed < end) {
          step.status = "running";
          break;
        }
        step.finishedAt = iso(job.createdAt + end);
        if (job.failure?.step === i) {
          step.status = "failed";
          status = "failed";
          error = job.failure.error;
          break;
        }
        step.status = "succeeded";
        finishedAt = job.createdAt + end;
        t = end;
        if (i === plan.length - 1) status = "succeeded";
      }
    }

    const terminal = status === "succeeded" || status === "failed";
    const lastChange = Math.max(job.createdAt, ...steps.flatMap((s) => [s.startedAt, s.finishedAt]).filter(Boolean).map((s) => Date.parse(s!)));
    return {
      id: job.id,
      baselineId: job.baselineId,
      clientRequestId: job.clientRequestId,
      spec: job.spec,
      status,
      steps,
      ...(error ? { error } : {}),
      resultReady: status === "succeeded",
      ...(status === "succeeded" ? { resultExpiresAt: iso(finishedAt + RESULT_TTL_MS) } : {}),
      provenance: {
        mode: "mock",
        steps: plan.map((p, i) => ({
          kind: p.kind,
          endpoint: p.endpoint,
          apiVersion: p.apiVersion,
          params: p.body,
          ...(steps[i]!.youcamTaskId ? { youcamTaskId: steps[i]!.youcamTaskId } : {}),
          ...(steps[i]!.finishedAt ? { finishedAt: steps[i]!.finishedAt } : {}),
        })),
      },
      retryAfterMs: terminal ? 0 : job.scenario === "slow" ? 4000 : 2000,
      createdAt: iso(job.createdAt),
      updatedAt: iso(Math.min(lastChange, now)),
    };
  }

  private getJob(id: string): Response {
    const job = this.jobs.get(id);
    if (!job) return fail("NOT_FOUND");
    return json({ job: this.view(job) });
  }

  private async getResult(id: string): Promise<Response> {
    const job = this.jobs.get(id);
    if (!job) return fail("NOT_FOUND");
    const view = this.view(job);
    if (view.status === "failed") return fail("NOT_FOUND", { details: "job failed; there is no result" });
    if (!view.resultReady) return fail("NOT_READY");
    if (job.scenario === "expired" || this.opts.now() > Date.parse(view.resultExpiresAt!)) return fail("EXPIRED");
    const image = await this.opts.loadImage(pickResultImage(this.sourceSpec(job.spec)));
    return new Response(image, { status: 200, headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } });
  }

  /* ---------------------------------------------------------------- privacy */

  private receipt(): Response {
    const body: PrivacyReceipt = {
      baselines: [...this.baselines.values()].map((b) => ({
        baselineId: b.id,
        youcamFileId: b.fileId,
        createdAt: iso(b.createdAt),
        expiresAt: iso(b.createdAt + RECORD_TTL_MS),
      })),
      jobs: [...this.jobs.values()].map((j) => {
        const view = this.view(j);
        return {
          id: j.id,
          baselineId: j.baselineId,
          kind: j.spec.kind,
          endpoints: view.provenance.steps.map((s) => s.endpoint),
          youcamTaskIds: view.steps.flatMap((s) => (s.youcamTaskId ? [s.youcamTaskId] : [])),
          createdAt: iso(j.createdAt),
          expiresAt: iso(j.createdAt + RECORD_TTL_MS),
        };
      }),
      shares: [...this.shares.values()].map((s) => ({ tokenPrefix: s.token.slice(0, 6), itemCount: s.items.length, expiresAt: iso(s.expiresAt) })),
      serverStoresImages: this.shares.size > 0,
      upstream: { provider: "Perfect Corp YouCam API", retentionDays: 30 },
    };
    return json(body);
  }

  /* ----------------------------------------------------------------- shares */

  private liveShare(token: string): StoredShare | undefined {
    const share = this.shares.get(token);
    if (share && this.opts.now() > share.expiresAt) {
      this.shares.delete(token);
      return undefined;
    }
    return share;
  }

  private async createShare(request: Request, url: URL): Promise<Response> {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("VALIDATION_FAILED", { details: "expected multipart/form-data" });
    }
    let metaRaw: unknown;
    try {
      metaRaw = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      return fail("VALIDATION_FAILED", { details: "`meta` must be JSON" });
    }
    const meta = CreateShareMeta.safeParse(metaRaw);
    if (!meta.success) return fail("VALIDATION_FAILED", { details: zodDetails(meta.error.issues) });
    const files = form.getAll("images").filter((f): f is File => typeof f !== "string");
    if (files.length !== meta.data.items.length) return fail("VALIDATION_FAILED", { details: "one image per item" });

    const items = await Promise.all(
      files.map(async (f, i) => ({ key: `i${i + 1}`, label: meta.data.items[i]!.label, image: new Uint8Array(await f.arrayBuffer()), contentType: f.type || "image/jpeg" })),
    );
    const token = randomToken(16);
    const share: StoredShare = { token, ownerKey: randomToken(24), items, votes: [], expiresAt: this.opts.now() + meta.data.expiresInDays * 86_400_000 };
    this.shares.set(token, share);
    return json({ token, ownerKey: share.ownerKey, url: `${url.origin}/share/${token}`, expiresAt: iso(share.expiresAt) }, 201);
  }

  private getShare(token: string): Response {
    const share = this.liveShare(token);
    if (!share) return fail("EXPIRED");
    const body: ShareManifest = {
      items: share.items.map((i) => ({ key: i.key, label: i.label, imageUrl: `/api/shares/${token}/items/${i.key}` })),
      expiresAt: iso(share.expiresAt),
    };
    return json(body);
  }

  private shareImage(token: string, key: string): Response {
    const item = this.liveShare(token)?.items.find((i) => i.key === key);
    if (!item) return fail("NOT_FOUND");
    return new Response(item.image as Uint8Array<ArrayBuffer>, { headers: { "content-type": item.contentType, "cache-control": "private, no-store" } });
  }

  private async vote(request: Request, token: string): Promise<Response> {
    const share = this.liveShare(token);
    if (!share) return fail("EXPIRED");
    const parsed = CreateVoteRequest.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return fail("VALIDATION_FAILED", { details: zodDetails(parsed.error.issues) });
    if (!share.items.some((i) => i.key === parsed.data.itemKey)) return fail("VALIDATION_FAILED", { details: "unknown itemKey" });
    const left = this.votesLeft.get(token) ?? VOTES_PER_SHARE;
    if (left <= 0) return fail("RATE_LIMITED", {}, { "retry-after": "3600" });
    this.votesLeft.set(token, left - 1);
    share.votes.push({ ...parsed.data, createdAt: this.opts.now() });
    return json({ accepted: true, votesLeft: left - 1 }, 201);
  }

  private owned(request: Request, token: string): StoredShare | Response {
    const share = this.liveShare(token);
    if (!share) return fail("EXPIRED");
    if (request.headers.get("x-owner-key") !== share.ownerKey) return fail("UNAUTHORISED");
    return share;
  }

  private shareResults(request: Request, token: string): Response {
    const share = this.owned(request, token);
    if (share instanceof Response) return share;
    const body: ShareResults = {
      items: share.items.map((i) => ({ key: i.key, label: i.label, votes: share.votes.filter((v) => v.itemKey === i.key).length })),
      notes: share.votes.filter((v) => v.note).map((v) => ({ itemKey: v.itemKey, note: v.note!, createdAt: iso(v.createdAt) })),
      expiresAt: iso(share.expiresAt),
    };
    return json(body);
  }

  private deleteShare(request: Request, token: string): Response {
    const share = this.owned(request, token);
    if (share instanceof Response) return share;
    this.shares.delete(token);
    return json({ deleted: true });
  }
}
