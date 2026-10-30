import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CreateShareMeta,
  CreateVoteRequest,
  ShareToken,
  type CreateShareResponse,
  type CreateVoteResponse,
  type ShareManifest,
  type ShareResults,
} from "@/lib/contracts/api";
import type { ServerContext } from "../context";
import { ApiError } from "../http/errors";
import type { HandlerContext } from "../http/handler";
import { keys, TTL } from "../keys";
import { log } from "../log";
import { prepareShareImage, SHARE_BODY_MAX_BYTES } from "./images";

export const VOTES_PER_HELPER = 5;
const VOTES_PER_SHARE = 200;
const BLOB_PREFIX = "shares/";

type StoredShare = {
  token: string;
  /** sha256 of the owner key: the key itself is shown once and never stored. */
  ownerKeyHash: string;
  items: { key: string; label: string; pathname: string; contentType: string }[];
  createdAt: number;
  expiresAt: number;
  sessionId: string;
};
type StoredVote = { id: string; k: string; n?: string; t: number };

type Ctx = HandlerContext<Record<string, string>>;
type Core = Pick<ServerContext, "kv" | "blob" | "now">;

const sha = (s: string) => createHash("sha256").update(s).digest();
const iso = (ms: number) => new Date(ms).toISOString();
const tokenPrefix = (token: string) => `${BLOB_PREFIX}${token}/`;
const zodDetails = (issues: readonly { path: PropertyKey[]; message: string }[]) => issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));

function requireEnabled(ctx: Pick<ServerContext, "env">) {
  if (!ctx.env.CAP_SHARES) throw new ApiError("FEATURE_DISABLED", { details: "shares" });
}

/** A live share, or null. Unknown, malformed, expired and revoked tokens are indistinguishable (all 410). */
async function loadLive(ctx: Core, token: string): Promise<StoredShare | null> {
  if (!ShareToken.safeParse(token).success) return null;
  const share = await ctx.kv.get<StoredShare>(keys.share(token));
  return share && ctx.now() < share.expiresAt ? share : null;
}

async function requireLive(ctx: Core, token: string) {
  const share = await loadLive(ctx, token);
  if (!share) throw new ApiError("EXPIRED");
  return share;
}

function requireOwner(request: Request, share: StoredShare) {
  const given = request.headers.get("x-owner-key") ?? "";
  if (!given || !timingSafeEqual(sha(given), Buffer.from(share.ownerKeyHash, "hex"))) throw new ApiError("UNAUTHORISED");
}

/** Remove a share and everything attached to it. Safe to call twice. */
async function destroy(ctx: Core, token: string, record: StoredShare | null) {
  const paths = new Set([...(record?.items.map((i) => i.pathname) ?? []), ...(await ctx.blob.list(tokenPrefix(token)))]);
  await ctx.blob.del([...paths]);
  await ctx.kv.del(keys.share(token), keys.shareVotes(token), keys.shareVoteTotal(token));
  await ctx.kv.sRem(keys.sharesIndex, token);
  if (record) await ctx.kv.sRem(keys.sessionShares(record.sessionId), token);
}

/* ----------------------------------------------------------------- create */

export async function createShare(ctx: Ctx): Promise<CreateShareResponse> {
  requireEnabled(ctx);
  const declared = Number(ctx.request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SHARE_BODY_MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { details: "expected multipart/form-data" });
  }
  let rawMeta: unknown;
  try {
    rawMeta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    throw new ApiError("VALIDATION_FAILED", { details: "`meta` must be JSON" });
  }
  const meta = CreateShareMeta.safeParse(rawMeta);
  if (!meta.success) throw new ApiError("VALIDATION_FAILED", { details: zodDetails(meta.error.issues) });
  const files = form.getAll("images").filter((f): f is File => typeof f !== "string");
  if (files.length !== meta.data.items.length) throw new ApiError("VALIDATION_FAILED", { details: "one image per item" });
  if (files.reduce((sum, f) => sum + f.size, 0) > SHARE_BODY_MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");

  const images = await Promise.all(files.map(async (f) => prepareShareImage(new Uint8Array(await f.arrayBuffer()))));

  const token = randomBytes(16).toString("base64url");
  const ownerKey = randomBytes(24).toString("base64url");
  const now = ctx.now();
  const expiresAt = now + meta.data.expiresInDays * 86_400_000;
  const items = meta.data.items.map((item, i) => ({
    key: `i${i + 1}`,
    label: item.label.replace(/[\u0000-\u001f\u007f]/g, " ").trim(),
    pathname: `${tokenPrefix(token)}${randomBytes(12).toString("base64url")}.jpg`,
    contentType: "image/jpeg",
  }));

  try {
    await Promise.all(items.map((item, i) => ctx.blob.put(item.pathname, images[i]!, item.contentType)));
  } catch (err) {
    await ctx.blob.del(items.map((i) => i.pathname)).catch(() => undefined);
    log.error("share.upload_failed", { requestId: ctx.requestId, error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    throw new ApiError("INTERNAL");
  }

  const record: StoredShare = { token, ownerKeyHash: sha(ownerKey).toString("hex"), items, createdAt: now, expiresAt, sessionId: ctx.session.id };
  await ctx.kv.set(keys.share(token), record, { ttlMs: expiresAt - now + TTL.shareGrace });
  await ctx.kv.sAdd(keys.sharesIndex, token);
  await ctx.kv.sAdd(keys.sessionShares(ctx.session.id), token);
  await ctx.kv.expire(keys.sessionShares(ctx.session.id), TTL.session);
  log.info("share.created", { requestId: ctx.requestId, share: token.slice(0, 6), items: items.length, days: meta.data.expiresInDays });

  const origin = ctx.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? new URL(ctx.request.url).origin;
  return { token, ownerKey, url: `${origin}/share/${token}`, expiresAt: iso(expiresAt) };
}

/* ------------------------------------------------------------------- view */

export async function getManifest(ctx: Ctx, token: string): Promise<ShareManifest> {
  requireEnabled(ctx);
  const share = await requireLive(ctx, token);
  return {
    items: share.items.map((i) => ({ key: i.key, label: i.label, imageUrl: `/api/shares/${share.token}/items/${i.key}` })),
    expiresAt: iso(share.expiresAt),
  };
}

export async function getShareImage(ctx: Ctx, token: string, key: string): Promise<Response> {
  requireEnabled(ctx);
  const share = await requireLive(ctx, token);
  const item = share.items.find((i) => i.key === key);
  if (!item) throw new ApiError("NOT_FOUND");
  const object = await ctx.blob.get(item.pathname);
  if (!object) throw new ApiError("EXPIRED");
  return new Response(object.body as BodyInit, {
    headers: { "content-type": object.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
}

/* ------------------------------------------------------------------- vote */

export async function castVote(ctx: Ctx, token: string): Promise<CreateVoteResponse> {
  requireEnabled(ctx);
  const share = await requireLive(ctx, token);
  const parsed = CreateVoteRequest.safeParse(await ctx.request.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError("VALIDATION_FAILED", { details: zodDetails(parsed.error.issues) });
  if (!share.items.some((i) => i.key === parsed.data.itemKey)) throw new ApiError("VALIDATION_FAILED", { details: "unknown itemKey" });

  const ttlMs = Math.max(60_000, share.expiresAt - ctx.now() + TTL.shareGrace);
  const retryAfter = { "retry-after": String(Math.ceil((share.expiresAt - ctx.now()) / 1000)) };
  const total = await ctx.kv.incrBy(keys.shareVoteTotal(token), 1, { ttlMs });
  if (total > VOTES_PER_SHARE) {
    await ctx.kv.incrBy(keys.shareVoteTotal(token), -1);
    throw new ApiError("RATE_LIMITED", { details: { limit: "share" } }, retryAfter);
  }
  const mine = await ctx.kv.incrBy(keys.shareIpVotes(token, ctx.ipHash), 1, { ttlMs });
  if (mine > VOTES_PER_HELPER) {
    await ctx.kv.incrBy(keys.shareIpVotes(token, ctx.ipHash), -1);
    await ctx.kv.incrBy(keys.shareVoteTotal(token), -1);
    throw new ApiError("RATE_LIMITED", { details: { limit: "helper" } }, retryAfter);
  }

  const note = parsed.data.note?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const vote: StoredVote = { id: randomBytes(6).toString("base64url"), k: parsed.data.itemKey, ...(note ? { n: note } : {}), t: ctx.now() };
  await ctx.kv.sAdd(keys.shareVotes(token), JSON.stringify(vote));
  await ctx.kv.expire(keys.shareVotes(token), ttlMs);
  return { accepted: true, votesLeft: VOTES_PER_HELPER - mine };
}

/* ---------------------------------------------------------------- results */

export async function getResults(ctx: Ctx, token: string): Promise<ShareResults> {
  requireEnabled(ctx);
  const share = await requireLive(ctx, token);
  requireOwner(ctx.request, share);
  const votes = (await ctx.kv.sMembers(keys.shareVotes(token))).map((m) => JSON.parse(m) as StoredVote).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  return {
    items: share.items.map((i) => ({ key: i.key, label: i.label, votes: votes.filter((v) => v.k === i.key).length })),
    notes: votes.filter((v) => v.n).map((v) => ({ itemKey: v.k, note: v.n!, createdAt: iso(v.t) })),
    expiresAt: iso(share.expiresAt),
  };
}

/* ----------------------------------------------------------------- revoke */

export async function revokeShare(ctx: Ctx, token: string): Promise<{ deleted: true }> {
  requireEnabled(ctx);
  const share = await requireLive(ctx, token);
  requireOwner(ctx.request, share);
  await destroy(ctx, token, share);
  log.info("share.revoked", { requestId: ctx.requestId, share: token.slice(0, 6) });
  return { deleted: true };
}

/** This session's live shares, for the privacy receipt. */
export async function sessionShares(ctx: Core, sessionId: string): Promise<StoredShare[]> {
  const tokens = await ctx.kv.sMembers(keys.sessionShares(sessionId));
  const live = await Promise.all(tokens.map((t) => loadLive(ctx, t)));
  return live.filter((s): s is StoredShare => s !== null);
}

/* ---------------------------------------------------------------- cleanup */

export type CleanupReport = { expired: number; orphanBlobs: number; live: number };

/**
 * Daily job. Deletes expired shares (records kept past expiry for exactly this), and any blob whose
 * share no longer exists (a crash between upload and record, or a record that aged out).
 */
export async function cleanupShares(ctx: Core): Promise<CleanupReport> {
  const report: CleanupReport = { expired: 0, orphanBlobs: 0, live: 0 };
  const live = new Set<string>();
  for (const token of await ctx.kv.sMembers(keys.sharesIndex)) {
    const record = await ctx.kv.get<StoredShare>(keys.share(token));
    if (record && ctx.now() < record.expiresAt) {
      live.add(token);
      report.live++;
      continue;
    }
    await destroy(ctx, token, record);
    report.expired++;
  }
  const strays = (await ctx.blob.list(BLOB_PREFIX)).filter((p) => !live.has(p.slice(BLOB_PREFIX.length).split("/")[0]!));
  if (strays.length) {
    await ctx.blob.del(strays);
    report.orphanBlobs = strays.length;
  }
  log.info("share.cleanup", { ...report });
  return report;
}
