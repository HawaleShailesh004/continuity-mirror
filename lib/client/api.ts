/*
 * The only place the app calls `fetch` (frontend plan §13). Typed functions per
 * endpoint; every JSON response is parsed with the shared Zod schema, and every
 * failure becomes an ApiError carrying the backend's ErrorBody, so screens only
 * ever deal with one error language (messageKey → words in content/copy.ts).
 */
import type { z } from "zod";
import {
  CreateBaselineResponse,
  CreateShareResponse,
  CreateVoteResponse,
  DeleteBaselineResponse,
  DeleteShareResponse,
  ErrorEnvelope,
  JobResponse,
  PrivacyReceipt,
  ShareManifest,
  ShareResults,
  StatusResponse,
  type CreateJobRequestInput,
  type CreateShareMeta,
  type CreateVoteRequest,
  type ErrorBody,
} from "@/lib/contracts";
import { errorBody } from "@/lib/contracts/errors";
import { whenMocksReady } from "./mocks";

export class ApiError extends Error {
  constructor(
    readonly body: ErrorBody,
    readonly status: number,
    /** From a Retry-After header (429), in ms. */
    readonly retryAfterMs?: number,
  ) {
    super(`${body.code} (${body.messageKey})`);
    this.name = "ApiError";
  }
}

/** Offline or the connection dropped: calm and retryable, never a raw TypeError. */
const networkError = () => new ApiError(errorBody("YOUCAM_UNAVAILABLE"), 0);

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : networkError();
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    await whenMocksReady();
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw networkError();
  }
  if (res.ok) return res;

  let body: ErrorBody;
  try {
    body = ErrorEnvelope.parse(await res.json()).error;
  } catch {
    body = errorBody("INTERNAL");
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  throw new ApiError(body, res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
}

async function json<S extends z.ZodType>(schema: S, path: string, init?: RequestInit): Promise<z.infer<S>> {
  const res = await send(path, init);
  try {
    return schema.parse(await res.json());
  } catch {
    // The server answered, but not with the contract: treat as ours, not the user's.
    throw new ApiError(errorBody("INTERNAL"), res.status);
  }
}

export const api = {
  status: () => json(StatusResponse, "/api/status"),

  /** Upload once; every job reuses the baseline. Save `normalisedImage`, not the original. */
  createBaseline: (image: Blob) => {
    const form = new FormData();
    form.set("image", image, "photo.jpg");
    return json(CreateBaselineResponse, "/api/baselines", { method: "POST", body: form });
  },

  deleteBaseline: (id: string) => json(DeleteBaselineResponse, `/api/baselines/${id}`, { method: "DELETE" }),

  createJob: (request: CreateJobRequestInput) =>
    json(JobResponse, "/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),

  job: (id: string) => json(JobResponse, `/api/jobs/${id}`),

  /** The finished image. Call as soon as `resultReady`: the upstream URL expires. */
  async result(jobId: string): Promise<Blob> {
    const res = await send(`/api/jobs/${jobId}/result`);
    return res.blob();
  },

  privacyReceipt: () => json(PrivacyReceipt, "/api/privacy/receipt"),

  /* Share links (P1). Images are the owner's own composites, one per item, same order as `meta.items`. */

  createShare: (meta: CreateShareMeta, images: readonly Blob[]) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    images.forEach((image, i) => form.append("images", image, `item-${i + 1}.jpg`));
    return json(CreateShareResponse, "/api/shares", { method: "POST", body: form });
  },

  /** The helper's view. A link that is unknown, expired or stopped all answer EXPIRED. */
  share: (token: string) => json(ShareManifest, `/api/shares/${token}`),

  vote: (token: string, request: CreateVoteRequest) =>
    json(CreateVoteResponse, `/api/shares/${token}/votes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),

  shareResults: (token: string, ownerKey: string) =>
    json(ShareResults, `/api/shares/${token}/results`, { headers: { "x-owner-key": ownerKey } }),

  revokeShare: (token: string, ownerKey: string) =>
    json(DeleteShareResponse, `/api/shares/${token}`, { method: "DELETE", headers: { "x-owner-key": ownerKey } }),
};
