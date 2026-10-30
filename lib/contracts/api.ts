// Request/response schemas for every /api endpoint. Both sides parse with these.
// Requests are strict (unknown keys rejected: the server maps specs to YouCam bodies via an allowlist).
import { z } from "zod";
import { CatalogId, Hex, RouteId } from "./domain";
import { ErrorBody } from "./errors";

const IsoDate = z.iso.datetime();

/* ------------------------------------------------------------------ status */

export const Capabilities = z
  .object({
    hairStyle: z.boolean(),
    hairColour: z.boolean(),
    brows: z.boolean(),
    /** Off since B0: YouCam Hat/Scarf generate a whole new scene, not a try-on. */
    headwear: z.boolean(),
    scarf: z.boolean(),
    regrowth: z.boolean(),
    shares: z.boolean(),
  })
  .meta({ id: "Capabilities" });
export type Capabilities = z.infer<typeof Capabilities>;

export const AdapterMode = z.enum(["live", "mock", "replay"]).meta({ id: "AdapterMode" });
export type AdapterMode = z.infer<typeof AdapterMode>;

export const StatusResponse = z
  .object({
    /** false → offer sample personas only. */
    live: z.boolean(),
    reason: z.enum(["units_low", "disabled", "rate_limited"]).optional(),
    /** `mock` means results are fixtures or watermarked; the UI should say so. */
    mode: AdapterMode,
    session: z.object({ unitsUsed: z.int().nonnegative(), unitsCap: z.int().nonnegative() }),
    capabilities: Capabilities,
    limits: z.object({
      /** Client must downsize before upload (Vercel body limit is 4.5 MB). */
      uploadMaxBytes: z.int().positive(),
      uploadMaxLongSide: z.int().positive(),
      uploadMinShortSide: z.int().positive(),
    }),
    version: z.string(),
    serverTime: IsoDate,
  })
  .meta({ id: "StatusResponse" });
export type StatusResponse = z.infer<typeof StatusResponse>;

/* --------------------------------------------------------------- baselines */

export const BaselineId = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "sha256 hex of the normalised image")
  .meta({ id: "BaselineId" });

export const CreateBaselineResponse = z
  .object({
    baselineId: BaselineId,
    width: z.int().positive(),
    height: z.int().positive(),
    /** data:image/jpeg;base64 — the exact pixels YouCam sees. Save this, not the original. */
    normalisedImage: z.string().startsWith("data:image/"),
    /** true when this image was already uploaded and its YouCam file is still valid. */
    reused: z.boolean(),
    expiresAt: IsoDate,
  })
  .meta({ id: "CreateBaselineResponse" });
export type CreateBaselineResponse = z.infer<typeof CreateBaselineResponse>;

export const DeleteBaselineResponse = z
  .object({ deleted: z.literal(true), upstreamRetentionDays: z.literal(30) })
  .meta({ id: "DeleteBaselineResponse" });
export type DeleteBaselineResponse = z.infer<typeof DeleteBaselineResponse>;

/* -------------------------------------------------------------------- jobs */

/**
 * Colour behaviour of a route.
 * - own: keep the user's colour. Template styles add a Hair Color pass with this hex (+1 unit);
 *   reference styles use YouCam's `hair_color: 'src'` and need no pass.
 * - template: accept the template's own colour (no pass).
 * - preset: change colour to a catalog preset (New chapter).
 */
export const RouteColour = z
  .discriminatedUnion("source", [
    z.strictObject({ source: z.literal("own"), hex: Hex }),
    z.strictObject({ source: z.literal("template") }),
    z.strictObject({ source: z.literal("preset"), presetId: CatalogId, mode: z.enum(["full", "ombre"]) }),
  ])
  .meta({ id: "RouteColour" });
export type RouteColour = z.infer<typeof RouteColour>;

const Attempt = z.int().min(0).max(5).default(0).describe(">0 only for an intentional re-roll; part of the idempotency key");

export const RouteSpec = z
  .strictObject({
    kind: z.literal("route"),
    routeId: RouteId,
    styleId: CatalogId,
    colour: RouteColour,
    attempt: Attempt,
  })
  .meta({ id: "RouteSpec" });

export const ColourSpec = z
  .strictObject({
    kind: z.literal("colour"),
    colour: z.strictObject({ presetId: CatalogId, mode: z.enum(["full", "ombre"]) }),
    attempt: Attempt,
  })
  .meta({ id: "ColourSpec" });

export const BrowsSpec = z
  .strictObject({
    kind: z.literal("brows"),
    browShapeId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    curvature: z.int().min(-100).max(100),
    thickness: z.int().min(-100).max(100),
    definition: z.int().min(0).max(100),
    colourHex: Hex,
    intensity: z.int().min(0).max(100),
    attempt: Attempt,
  })
  .meta({ id: "BrowsSpec" });

/**
 * One Hair Color pass over an earlier job's result, to bring a drifted hair colour back to the baseline's.
 * Used by the result check (lib/client/check): the client measures both images on the device and sends
 * the hex it measured. 1 unit. The source job must belong to the same baseline and still have its result.
 */
export const RepairSpec = z
  .strictObject({
    kind: z.literal("repair"),
    fromJobId: z.string().min(8).max(64).describe("the succeeded job whose result is repaired"),
    colourHex: Hex.describe("the baseline's measured hair colour"),
  })
  .meta({ id: "RepairSpec" });

export const JobSpec = z.discriminatedUnion("kind", [RouteSpec, ColourSpec, BrowsSpec, RepairSpec]).meta({ id: "JobSpec" });
export type JobSpec = z.infer<typeof JobSpec>;
export type JobSpecInput = z.input<typeof JobSpec>;
export const JobKind = z.enum(["route", "colour", "brows", "repair"]).meta({ id: "JobKind" });
export type JobKind = z.infer<typeof JobKind>;

export const CreateJobRequest = z
  .strictObject({
    baselineId: BaselineId,
    /** uuid generated and stored by the client before sending, so a retry never duplicates. */
    clientRequestId: z.uuid(),
    spec: JobSpec,
  })
  .meta({ id: "CreateJobRequest" });
export type CreateJobRequest = z.infer<typeof CreateJobRequest>;
export type CreateJobRequestInput = z.input<typeof CreateJobRequest>;

export const StepKind = z.enum(["hair-transfer", "hair-color", "makeup-vto"]).meta({ id: "StepKind" });
export type StepKind = z.infer<typeof StepKind>;

export const JobStatus = z.enum(["queued", "running", "succeeded", "failed"]).meta({ id: "JobStatus" });
export type JobStatus = z.infer<typeof JobStatus>;

export const JobStep = z
  .object({
    kind: StepKind,
    status: z.enum(["pending", "running", "succeeded", "failed"]),
    units: z.int().nonnegative(),
    youcamTaskId: z.string().optional(),
    startedAt: IsoDate.optional(),
    finishedAt: IsoDate.optional(),
  })
  .meta({ id: "JobStep" });
export type JobStep = z.infer<typeof JobStep>;

/** "How this was made". Params are the YouCam body with file ids / URLs replaced by placeholders. */
export const Provenance = z
  .object({
    mode: AdapterMode,
    steps: z.array(
      z.object({
        kind: StepKind,
        endpoint: z.string(),
        apiVersion: z.string(),
        params: z.record(z.string(), z.unknown()),
        youcamTaskId: z.string().optional(),
        finishedAt: IsoDate.optional(),
      }),
    ),
  })
  .meta({ id: "Provenance" });
export type Provenance = z.infer<typeof Provenance>;

export const Job = z
  .object({
    id: z.string().min(1),
    baselineId: BaselineId,
    clientRequestId: z.uuid(),
    spec: JobSpec,
    status: JobStatus,
    steps: z.array(JobStep).min(1),
    /** Present when status is failed. YOUCAM_REJECTED carries youcamCode (e.g. error_no_shoulder). */
    error: ErrorBody.optional(),
    /** true → GET /api/jobs/:id/result now and save the bytes; the upstream URL expires. */
    resultReady: z.boolean(),
    resultExpiresAt: IsoDate.optional(),
    provenance: Provenance,
    /** Client polling hint. Poll again after this many ms while not terminal. */
    retryAfterMs: z.int().min(0).max(60_000),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .meta({ id: "Job" });
export type Job = z.infer<typeof Job>;

export const JobResponse = z.object({ job: Job }).meta({ id: "JobResponse" });
export type JobResponse = z.infer<typeof JobResponse>;

/* ----------------------------------------------------------------- privacy */

export const PrivacyReceipt = z
  .object({
    baselines: z.array(
      z.object({ baselineId: BaselineId, youcamFileId: z.string(), createdAt: IsoDate, expiresAt: IsoDate }),
    ),
    jobs: z.array(
      z.object({
        id: z.string(),
        baselineId: BaselineId,
        kind: JobKind,
        endpoints: z.array(z.string()),
        youcamTaskIds: z.array(z.string()),
        createdAt: IsoDate,
        expiresAt: IsoDate,
      }),
    ),
    shares: z.array(z.object({ tokenPrefix: z.string(), itemCount: z.int(), expiresAt: IsoDate })),
    /**
     * Whether our server holds any of this session's images. False unless the person has a live share
     * link (opt-in, expires, revocable): results are otherwise streamed through and kept only on their device.
     */
    serverStoresImages: z.boolean(),
    upstream: z.object({ provider: z.string(), retentionDays: z.literal(30) }),
  })
  .meta({ id: "PrivacyReceipt" });
export type PrivacyReceipt = z.infer<typeof PrivacyReceipt>;

/* ------------------------------------------------------------ shares (P1) */

export const ShareToken = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "128-bit base64url").meta({ id: "ShareToken" });

/** JSON part `meta` of the multipart POST /api/shares (files in `images`, same order as items). */
export const CreateShareMeta = z
  .strictObject({
    /** The owner agrees these images are stored on our server until the link expires or is revoked. Required, never defaulted. */
    consent: z.literal(true),
    items: z.array(z.strictObject({ label: z.string().min(1).max(80) })).min(1).max(4),
    expiresInDays: z.int().min(1).max(7),
  })
  .meta({ id: "CreateShareMeta" });
export type CreateShareMeta = z.infer<typeof CreateShareMeta>;

export const CreateShareResponse = z
  .object({ token: ShareToken, ownerKey: z.string().min(22), url: z.url(), expiresAt: IsoDate })
  .meta({ id: "CreateShareResponse" });
export type CreateShareResponse = z.infer<typeof CreateShareResponse>;

export const ShareManifest = z
  .object({
    items: z.array(z.object({ key: z.string(), label: z.string(), imageUrl: z.string() })),
    expiresAt: IsoDate,
  })
  .meta({ id: "ShareManifest" });
export type ShareManifest = z.infer<typeof ShareManifest>;

export const CreateVoteRequest = z
  .strictObject({ itemKey: z.string().min(1), note: z.string().max(140).optional() })
  .meta({ id: "CreateVoteRequest" });
export type CreateVoteRequest = z.infer<typeof CreateVoteRequest>;

export const CreateVoteResponse = z.object({ accepted: z.literal(true), votesLeft: z.int().min(0) }).meta({ id: "CreateVoteResponse" });
export type CreateVoteResponse = z.infer<typeof CreateVoteResponse>;

export const ShareResults = z
  .object({
    items: z.array(z.object({ key: z.string(), label: z.string(), votes: z.int().nonnegative() })),
    notes: z.array(z.object({ itemKey: z.string(), note: z.string(), createdAt: IsoDate })),
    expiresAt: IsoDate,
  })
  .meta({ id: "ShareResults" });
export type ShareResults = z.infer<typeof ShareResults>;

export const DeleteShareResponse = z.object({ deleted: z.literal(true) }).meta({ id: "DeleteShareResponse" });

/* ------------------------------------------------------------------ admin */

export const AdminMetrics = z
  .object({
    balance: z.number().nullable(),
    unitsSpent: z.object({ total: z.number(), byKind: z.record(z.string(), z.number()) }),
    jobsByStatus: z.record(z.string(), z.number()),
    youcamErrors: z.record(z.string(), z.number()),
    latencyMs: z.record(z.string(), z.object({ p50: z.number(), p95: z.number(), n: z.int() })),
  })
  .meta({ id: "AdminMetrics" });
export type AdminMetrics = z.infer<typeof AdminMetrics>;

export const AdminLiveRequest = z.strictObject({ enabled: z.boolean() }).meta({ id: "AdminLiveRequest" });

/* ----------------------------------------------------------------- headers */

/** Honoured only when the server runs with YOUCAM_MODE=mock (and by the MSW handlers). */
export const MOCK_SCENARIO_HEADER = "x-cm-mock-scenario";
export const MockScenario = z
  .enum([
    "ok",
    "slow",
    "no_shoulder",
    "hair_too_short",
    "face_pose",
    "unavailable",
    "timeout",
    "rate_limited",
    "budget_exhausted",
    "live_disabled",
    "partial_failure",
    "expired",
  ])
  .meta({ id: "MockScenario" });
export type MockScenario = z.infer<typeof MockScenario>;
