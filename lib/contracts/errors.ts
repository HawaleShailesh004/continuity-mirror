// One error language for the whole API. The backend returns keys; the frontend owns the words
// (content/copy.ts must have an entry for every MESSAGE_KEYS value).
import { z } from "zod";

export const ErrorCode = z
  .enum([
    "VALIDATION_FAILED",
    "IMAGE_FORMAT",
    "IMAGE_TOO_SMALL",
    "PAYLOAD_TOO_LARGE",
    "RATE_LIMITED",
    "SESSION_BUDGET_EXHAUSTED",
    "LIVE_DISABLED",
    "FEATURE_DISABLED",
    "YOUCAM_REJECTED", // input problem; youcamCode says which
    "YOUCAM_UNAVAILABLE",
    "YOUCAM_TIMEOUT",
    "NOT_FOUND",
    "NOT_READY",
    "EXPIRED",
    "UNAUTHORISED",
    "INTERNAL",
  ])
  .meta({ id: "ErrorCode" });
export type ErrorCode = z.infer<typeof ErrorCode>;

export const MESSAGE_KEYS = [
  "generic.invalidRequest",
  "generic.somethingWrong",
  "generic.serviceBusy",
  "generic.busyRetry",
  "generic.timeout",
  "generic.notFound",
  "generic.tryDifferentPhoto",
  "image.format",
  "image.tooSmall",
  "image.tooLarge",
  "budget.sessionReached",
  "live.disabled",
  "feature.disabled",
  "result.notReady",
  "result.expired",
  "share.unauthorised",
  "capture.retake.shoulders",
  "capture.retake.faceForward",
  "capture.retake.faceVisible",
  "capture.retake.size",
  "capture.hairTooShort",
] as const;
export const MessageKey = z.enum(MESSAGE_KEYS).meta({ id: "MessageKey" });
export type MessageKey = z.infer<typeof MessageKey>;

export const ErrorBody = z
  .object({
    code: ErrorCode,
    messageKey: MessageKey,
    retryable: z.boolean(),
    /** Raw YouCam error, e.g. `error_no_shoulder`. Present for YOUCAM_* codes when known. */
    youcamCode: z.string().optional(),
    details: z.unknown().optional(),
  })
  .meta({ id: "ErrorBody" });
export type ErrorBody = z.infer<typeof ErrorBody>;

export const ErrorEnvelope = z.object({ error: ErrorBody }).meta({ id: "ErrorEnvelope" });
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** HTTP status used when an error is returned as a response (not when it sits inside a failed Job). */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  IMAGE_FORMAT: 415,
  IMAGE_TOO_SMALL: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SESSION_BUDGET_EXHAUSTED: 403,
  LIVE_DISABLED: 503,
  FEATURE_DISABLED: 403,
  YOUCAM_REJECTED: 422,
  YOUCAM_UNAVAILABLE: 502,
  YOUCAM_TIMEOUT: 504,
  NOT_FOUND: 404,
  NOT_READY: 409,
  EXPIRED: 410,
  UNAUTHORISED: 401,
  INTERNAL: 500,
};

/** Default messageKey and retryability per code (YOUCAM_REJECTED is refined by youcamCode). */
export const ERROR_DEFAULTS: Record<ErrorCode, { messageKey: MessageKey; retryable: boolean }> = {
  VALIDATION_FAILED: { messageKey: "generic.invalidRequest", retryable: false },
  IMAGE_FORMAT: { messageKey: "image.format", retryable: false },
  IMAGE_TOO_SMALL: { messageKey: "image.tooSmall", retryable: false },
  PAYLOAD_TOO_LARGE: { messageKey: "image.tooLarge", retryable: false },
  RATE_LIMITED: { messageKey: "generic.busyRetry", retryable: true },
  SESSION_BUDGET_EXHAUSTED: { messageKey: "budget.sessionReached", retryable: false },
  LIVE_DISABLED: { messageKey: "live.disabled", retryable: false },
  FEATURE_DISABLED: { messageKey: "feature.disabled", retryable: false },
  YOUCAM_REJECTED: { messageKey: "generic.tryDifferentPhoto", retryable: false },
  YOUCAM_UNAVAILABLE: { messageKey: "generic.serviceBusy", retryable: true },
  YOUCAM_TIMEOUT: { messageKey: "generic.timeout", retryable: true },
  NOT_FOUND: { messageKey: "generic.notFound", retryable: false },
  NOT_READY: { messageKey: "result.notReady", retryable: true },
  EXPIRED: { messageKey: "result.expired", retryable: false },
  UNAUTHORISED: { messageKey: "share.unauthorised", retryable: false },
  INTERNAL: { messageKey: "generic.somethingWrong", retryable: false },
};

export function errorBody(code: ErrorCode, extra: Partial<Omit<ErrorBody, "code">> = {}): ErrorBody {
  return { code, ...ERROR_DEFAULTS[code], ...extra };
}

/**
 * YouCam task error codes → our error. Pure data, shared by the live adapter and the mocks.
 * Extend whenever a new code is observed (and record it in docs/YOUCAM_FACTS.md).
 */
export const YOUCAM_ERROR_MAP: Record<string, { code: ErrorCode; messageKey: MessageKey; retryable: boolean }> = {
  error_no_shoulder: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.shoulders", retryable: false },
  error_large_face_angle: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.faceForward", retryable: false },
  error_face_pose: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.faceForward", retryable: false },
  error_insufficient_landmarks: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.faceVisible", retryable: false },
  error_no_face: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.faceVisible", retryable: false },
  error_hair_too_short: { code: "YOUCAM_REJECTED", messageKey: "capture.hairTooShort", retryable: false },
  error_below_min_image_size: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.size", retryable: false },
  error_exceed_max_image_size: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.size", retryable: false },
  exceed_max_filesize: { code: "YOUCAM_REJECTED", messageKey: "capture.retake.size", retryable: false },
  error_nsfw_content_detected: { code: "YOUCAM_REJECTED", messageKey: "generic.tryDifferentPhoto", retryable: false },
  error_download_image: { code: "YOUCAM_UNAVAILABLE", messageKey: "generic.serviceBusy", retryable: true },
  error_inference: { code: "YOUCAM_UNAVAILABLE", messageKey: "generic.serviceBusy", retryable: true },
  unknown_internal_error: { code: "YOUCAM_UNAVAILABLE", messageKey: "generic.serviceBusy", retryable: true },
};

export function fromYoucamCode(youcamCode: string): ErrorBody {
  const mapped = YOUCAM_ERROR_MAP[youcamCode] ?? { code: "YOUCAM_UNAVAILABLE", messageKey: "generic.serviceBusy", retryable: true };
  return { ...mapped, youcamCode };
}
