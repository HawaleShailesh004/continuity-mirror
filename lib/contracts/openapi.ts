// OpenAPI document for /api, generated from the same Zod schemas the code uses.
// Script/test-only (not imported by app code). Output: docs/openapi.json + docs/API.md (pnpm api:docs).
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  AdminLiveRequest,
  AdminMetrics,
  BaselineId,
  CreateBaselineResponse,
  CreateJobRequest,
  CreateShareMeta,
  CreateShareResponse,
  CreateVoteRequest,
  CreateVoteResponse,
  DeleteBaselineResponse,
  DeleteShareResponse,
  JobResponse,
  MOCK_SCENARIO_HEADER,
  MockScenario,
  PrivacyReceipt,
  ShareManifest,
  ShareResults,
  ShareToken,
  StatusResponse,
} from "./api";
import { ErrorEnvelope } from "./errors";

type Responses = Parameters<OpenAPIRegistry["registerPath"]>[0]["responses"];

const jsonBody = (schema: z.ZodType, description: string) => ({ description, content: { "application/json": { schema } } });
const errors = (...codes: number[]): Responses =>
  Object.fromEntries(codes.map((c) => [c, jsonBody(ErrorEnvelope, "Error envelope; `error.code` says why")]));

const mockHeader = z.object({ [MOCK_SCENARIO_HEADER]: MockScenario.optional() });
const ownerHeader = z.object({ "x-owner-key": z.string() });
const jobParams = z.object({ id: z.string() });
const shareParams = z.object({ token: ShareToken });

export function buildOpenApiDocument(version = "0.1.0") {
  const r = new OpenAPIRegistry();

  r.registerPath({
    method: "get",
    path: "/api/status",
    summary: "What the UI may offer right now (live generation, capabilities, session budget)",
    request: { headers: mockHeader },
    responses: { 200: jsonBody(StatusResponse, "Status") },
  });

  r.registerPath({
    method: "post",
    path: "/api/baselines",
    summary: "Upload the baseline photo once; every job reuses it",
    description:
      "Multipart field `image` (JPEG/PNG/WebP; HEIC is rejected with details.hint='heic'). Downsize to long side ≤ 1600 and ≤ 1.5 MB first. " +
      "The server normalises to JPEG, long side 1024, EXIF stripped, and uploads to YouCam (free). baselineId = sha256 of the normalised bytes. " +
      "201 for a new baseline, 200 when reused. Kept 24 h.",
    request: {
      headers: mockHeader,
      body: { content: { "multipart/form-data": { schema: z.object({ image: z.string().meta({ format: "binary" }) }) } } },
    },
    responses: { 200: jsonBody(CreateBaselineResponse, "Reused"), 201: jsonBody(CreateBaselineResponse, "Created"), ...errors(400, 413, 415, 422, 429, 502, 503) },
  });

  r.registerPath({
    method: "delete",
    path: "/api/baselines/{id}",
    summary: "Forget a baseline and its jobs on our side (idempotent)",
    request: { params: z.object({ id: BaselineId }) },
    responses: { 200: jsonBody(DeleteBaselineResponse, "Deleted. YouCam keeps its copy up to 30 days.") },
  });

  r.registerPath({
    method: "post",
    path: "/api/jobs",
    summary: "Start a job (route / colour / brows)",
    description:
      "Idempotent: the same baseline + spec returns the existing job (200) unless it failed; the same clientRequestId returns that request's job. " +
      "Use a new clientRequestId for a retry after failure. Units are reserved on create and refunded when the job fails (YouCam errors are free).",
    request: { headers: mockHeader, body: { content: { "application/json": { schema: CreateJobRequest } } } },
    responses: { 200: jsonBody(JobResponse, "Existing job"), 202: jsonBody(JobResponse, "Created"), ...errors(400, 403, 404, 429, 503) },
  });

  r.registerPath({
    method: "get",
    path: "/api/jobs/{id}",
    summary: "Poll a job; wait job.retryAfterMs between polls",
    description:
      "Job ids are unguessable capability tokens (96-bit), so a job can be resumed even if the session cookie was lost. " +
      "Polls within 4 s of the last check are answered from the server's cache; retryAfterMs is 2 s, 4 s after 30 s, 6 s when the YouCam call budget is exhausted. " +
      "Jobs fail with YOUCAM_TIMEOUT after 180 s.",
    request: { params: jobParams },
    responses: { 200: jsonBody(JobResponse, "Job (failed jobs carry error)"), ...errors(404) },
  });

  r.registerPath({
    method: "get",
    path: "/api/jobs/{id}/result",
    summary: "Stream the result image once job.resultReady; save it on the device immediately",
    request: { params: jobParams },
    responses: {
      200: { description: "Result image", content: { "image/jpeg": { schema: z.string().meta({ format: "binary" }) } } },
      ...errors(404, 409, 410),
    },
  });

  r.registerPath({
    method: "get",
    path: "/api/privacy/receipt",
    summary: "What our server holds for this session (no images)",
    responses: { 200: jsonBody(PrivacyReceipt, "Receipt") },
  });

  r.registerPath({
    method: "post",
    path: "/api/shares",
    summary: "(P1) Create an expiring share link for chosen results",
    description:
      "Multipart: `meta` (JSON, CreateShareMeta, with `consent: true`) and `images` (one file per item, same order, ≤ 2 MB each, ≤ 4.4 MB total). " +
      "Images are re-encoded to JPEG (≤ 1024 px, metadata stripped) and stored privately until the link expires or is revoked. " +
      "5 creates per hour per session. 403 FEATURE_DISABLED when shares are off (status.capabilities.shares).",
    request: {
      body: {
        content: {
          "multipart/form-data": { schema: z.object({ meta: CreateShareMeta, images: z.array(z.string().meta({ format: "binary" })) }) },
        },
      },
    },
    responses: { 201: jsonBody(CreateShareResponse, "Created; keep ownerKey on the device"), ...errors(400, 403, 413) },
  });

  r.registerPath({
    method: "get",
    path: "/api/shares/{token}",
    summary: "(P1) Helper view manifest",
    request: { params: shareParams },
    responses: { 200: jsonBody(ShareManifest, "Manifest"), ...errors(410) },
  });

  r.registerPath({
    method: "get",
    path: "/api/shares/{token}/items/{key}",
    summary: "(P1) A shared image (the manifest's imageUrl)",
    description: "Streams the image through our server; storage is private. 410 once the link is expired or revoked.",
    request: { params: z.object({ token: ShareToken, key: z.string() }) },
    responses: { 200: { description: "Image", content: { "image/jpeg": { schema: z.string().meta({ format: "binary" }) } } }, ...errors(404, 410) },
  });

  r.registerPath({
    method: "post",
    path: "/api/shares/{token}/votes",
    summary: "(P1) Helper vote (5 per helper per share)",
    request: { params: shareParams, body: { content: { "application/json": { schema: CreateVoteRequest } } } },
    responses: { 201: jsonBody(CreateVoteResponse, "Accepted"), ...errors(400, 410, 429) },
  });

  r.registerPath({
    method: "get",
    path: "/api/shares/{token}/results",
    summary: "(P1) Owner view of votes",
    request: { params: shareParams, headers: ownerHeader },
    responses: { 200: jsonBody(ShareResults, "Results"), ...errors(401, 410) },
  });

  r.registerPath({
    method: "delete",
    path: "/api/shares/{token}",
    summary: "(P1) Revoke now: deletes images and votes",
    request: { params: shareParams, headers: ownerHeader },
    responses: { 200: jsonBody(DeleteShareResponse, "Deleted"), ...errors(401, 410) },
  });

  r.registerPath({
    method: "post",
    path: "/api/webhooks/youcam",
    summary: "YouCam task webhook (Standard Webhooks signature)",
    description:
      "Verified with webhook-id / webhook-timestamp / webhook-signature (HMAC-SHA256, YOUCAM_WEBHOOK_SECRET, 5 min tolerance) and deduped by webhook-id. " +
      "Treated as a nudge: only the task id is read from the body, and the job is advanced by asking YouCam (same path and lock as polling). 404 when no secret is configured.",
    responses: {
      200: jsonBody(z.object({ ok: z.literal(true), outcome: z.enum(["duplicate", "ignored", "advanced", "busy"]) }), "Handled"),
      ...errors(401, 404),
    },
  });

  r.registerPath({
    method: "get",
    path: "/api/cron/cleanup",
    summary: "Daily cleanup of expired shares and orphaned images (Vercel Cron, Bearer CRON_SECRET)",
    responses: { 200: jsonBody(z.object({ expired: z.int(), orphanBlobs: z.int(), live: z.int() }), "Report"), ...errors(401) },
  });

  r.registerPath({
    method: "get",
    path: "/api/admin/metrics",
    summary: "Operator metrics (Bearer ADMIN_TOKEN)",
    responses: { 200: jsonBody(AdminMetrics, "Metrics"), ...errors(401) },
  });

  r.registerPath({
    method: "post",
    path: "/api/admin/live",
    summary: "Kill switch for live generation (Bearer ADMIN_TOKEN)",
    request: { body: { content: { "application/json": { schema: AdminLiveRequest } } } },
    responses: { 200: jsonBody(z.object({ enabled: z.boolean() }), "New state"), ...errors(401) },
  });

  return new OpenApiGeneratorV31(r.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Continuity Mirror API",
      version,
      description: "Same-origin API for the Continuity Mirror PWA. Errors always use ErrorEnvelope; the frontend maps messageKey to copy.",
    },
  });
}
