import "server-only";
import { errorBody, HTTP_STATUS, type ErrorBody, type ErrorCode } from "@/lib/contracts/errors";

/** Throw anywhere in a handler; the wrapper turns it into the error envelope. */
export class ApiError extends Error {
  readonly body: ErrorBody;
  constructor(
    code: ErrorCode,
    extra: Partial<Omit<ErrorBody, "code">> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(code);
    this.body = errorBody(code, extra);
  }

  get status() {
    return HTTP_STATUS[this.body.code];
  }
}

export function errorResponse(body: ErrorBody, headers: Record<string, string> = {}) {
  return Response.json({ error: body }, { status: HTTP_STATUS[body.code], headers: { "cache-control": "no-store", ...headers } });
}
