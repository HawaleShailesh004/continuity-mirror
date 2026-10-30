import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MOCK_SCENARIO_HEADER, MockScenario } from "@/lib/contracts/api";
import { errorBody, type ErrorBody } from "@/lib/contracts/errors";
import { serverContext, type ServerContext } from "../context";
import { log } from "../log";
import { YouCamHttpError } from "../youcam/adapter";
import { ApiError, errorResponse } from "./errors";
import { clientIp, hashIp } from "./ip";
import { RATE_LIMITS, rateLimit, type RateLimitRule } from "./ratelimit";
import { getSession, type Session } from "./session";

export type HandlerContext<P> = ServerContext & {
  request: Request;
  requestId: string;
  session: Session;
  ipHash: string;
  params: P;
  /** Only set when YOUCAM_MODE=mock and the request carries x-cm-mock-scenario. */
  mockScenario?: MockScenario;
};

type RouteOptions = {
  /** Shown in logs. */
  name: string;
  /** Extra per-session limits for this route, on top of the global session/IP limits. */
  limits?: RateLimitRule[];
};

/** Map anything thrown to the error envelope. Unknown errors never leak their message. */
export function toErrorBody(err: unknown): { body: ErrorBody; headers: Record<string, string> } {
  if (err instanceof ApiError) return { body: err.body, headers: err.headers };
  if (err instanceof z.ZodError) {
    return { body: errorBody("VALIDATION_FAILED", { details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }), headers: {} };
  }
  if (err instanceof YouCamHttpError) {
    if (err.httpStatus === 429) {
      const seconds = Math.ceil((err.retryAfterMs ?? 5000) / 1000);
      return { body: errorBody("RATE_LIMITED"), headers: { "retry-after": String(seconds) } };
    }
    if (err.httpStatus === "timeout") return { body: errorBody("YOUCAM_TIMEOUT"), headers: {} };
    if (err.httpStatus === 401 || err.httpStatus === 403 || err.httpStatus === "schema" || err.httpStatus === 400) {
      return { body: errorBody("INTERNAL"), headers: {} };
    }
    return { body: errorBody("YOUCAM_UNAVAILABLE"), headers: {} };
  }
  return { body: errorBody("INTERNAL"), headers: {} };
}

async function enforce(ctx: ServerContext, rule: RateLimitRule, subject: string) {
  const result = await rateLimit(ctx.kv, rule, subject, ctx.now());
  if (!result.ok) throw new ApiError("RATE_LIMITED", { details: { limit: rule.name } }, { "retry-after": String(Math.ceil(result.retryAfterMs / 1000)) });
}

/**
 * Wraps a route handler: session cookie, rate limits, error envelope, request id, timing log.
 * Usage: `export const POST = route({ name: "baselines.create" }, async (ctx) => Response.json(...))`
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  options: RouteOptions,
  fn: (ctx: HandlerContext<P>) => Promise<Response>,
) {
  return async (request: Request, routeContext?: { params: Promise<P> }): Promise<Response> => {
    // Touch request data first: with cacheComponents this ends any build-time prerender attempt
    // before we read env or KV (every API response is per request).
    request.headers.get("cookie");
    const started = performance.now();
    const requestId = randomUUID();
    let session: Session | undefined;
    let response: Response;
    let code: string | undefined;

    try {
      const base = serverContext();
      session = getSession(request, base.env.SESSION_SECRET);
      const ipHash = hashIp(clientIp(request), base.env.IP_HASH_SALT);
      const scenario = base.env.YOUCAM_MODE === "mock" ? MockScenario.safeParse(request.headers.get(MOCK_SCENARIO_HEADER)) : undefined;
      const ctx: HandlerContext<P> = {
        ...base,
        request,
        requestId,
        session,
        ipHash,
        params: ((await routeContext?.params) ?? {}) as P,
        ...(scenario?.success ? { mockScenario: scenario.data } : {}),
      };
      await enforce(base, RATE_LIMITS.session, session.id);
      await enforce(base, RATE_LIMITS.ip, ipHash);
      for (const rule of options.limits ?? []) await enforce(base, rule, session.id);
      response = await fn(ctx);
    } catch (err) {
      const { body, headers } = toErrorBody(err);
      code = body.code;
      if (body.code === "INTERNAL") {
        log.error("api.internal", { requestId, route: options.name, error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "unknown" });
      }
      response = errorResponse(body, headers);
    }

    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    if (session?.setCookie) headers.append("set-cookie", session.setCookie);
    log.info("api", { requestId, route: options.name, method: request.method, status: response.status, code, ms: Math.round(performance.now() - started) });
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
