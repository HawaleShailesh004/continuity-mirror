import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/shares/route";
import { GET as getRoute, DELETE as revokeRoute } from "@/app/api/shares/[token]/route";
import { POST as voteRoute } from "@/app/api/shares/[token]/votes/route";
import { GET as resultsRoute } from "@/app/api/shares/[token]/results/route";
import { GET as imageRoute } from "@/app/api/shares/[token]/items/[key]/route";
import { GET as cleanupRoute } from "@/app/api/cron/cleanup/route";
import { GET as receiptRoute } from "@/app/api/privacy/receipt/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { CreateShareResponse, PrivacyReceipt, ShareManifest, ShareResults, StatusResponse } from "@/lib/contracts/api";
import { ErrorEnvelope } from "@/lib/contracts/errors";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { setServerContext, type ServerContext } from "@/lib/server/context";
import { parseEnv } from "@/lib/server/env";
import { keys } from "@/lib/server/keys";
import { MemoryKV } from "@/lib/server/store/memory";
import { MockYouCamAdapter } from "@/lib/server/youcam/mock";

const ORIGIN = "https://cm.test";
const CRON = "cron-secret-0123456789";
const meera = readFileSync(join(process.cwd(), "public/demo/meera/closest.jpg"));
const grace = readFileSync(join(process.cwd(), "public/demo/grace/closest.jpg"));

let now: number;
let ctx: ServerContext;
let blob: MemoryBlobStore;

function makeCtx(env: Record<string, string> = {}) {
  blob = new MemoryBlobStore();
  ctx = { env: parseEnv({ CRON_SECRET: CRON, ...env }), kv: new MemoryKV(() => now), blob, youcam: new MockYouCamAdapter({ now: () => now }), now: () => now };
  setServerContext(ctx);
}

beforeEach(() => {
  now = Date.parse("2026-10-27T08:00:00Z");
  makeCtx();
});
afterEach(() => setServerContext(undefined));

/** One person (cookie + address). The owner and each helper are separate people. */
function person(ip: string) {
  let cookie: string | undefined;
  const headers = (extra: Record<string, string> = {}) => ({ "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...extra });
  const take = (res: Response) => {
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  const params = <T>(p: T) => ({ params: Promise.resolve(p) });
  return {
    create: async (parts: { meta?: unknown; images?: Uint8Array[]; rawMeta?: string } = {}) => {
      const form = new FormData();
      form.set("meta", parts.rawMeta ?? JSON.stringify(parts.meta ?? { consent: true, items: [{ label: "Closest to me" }, { label: "Easier" }], expiresInDays: 7 }));
      for (const [i, img] of (parts.images ?? [meera, grace]).entries()) form.append("images", new Blob([img as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), `${i}.jpg`);
      return take(await createRoute(new Request(`${ORIGIN}/api/shares`, { method: "POST", body: form, headers: headers() })));
    },
    manifest: async (t: string) => take(await getRoute(new Request(`${ORIGIN}/api/shares/${t}`, { headers: headers() }), params({ token: t }))),
    image: async (t: string, key: string) => take(await imageRoute(new Request(`${ORIGIN}/api/shares/${t}/items/${key}`, { headers: headers() }), params({ token: t, key }))),
    vote: async (t: string, body: unknown) =>
      take(await voteRoute(new Request(`${ORIGIN}/api/shares/${t}/votes`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(body) }), params({ token: t }))),
    results: async (t: string, ownerKey?: string) =>
      take(await resultsRoute(new Request(`${ORIGIN}/api/shares/${t}/results`, { headers: headers(ownerKey ? { "x-owner-key": ownerKey } : {}) }), params({ token: t }))),
    revoke: async (t: string, ownerKey?: string) =>
      take(await revokeRoute(new Request(`${ORIGIN}/api/shares/${t}`, { method: "DELETE", headers: headers(ownerKey ? { "x-owner-key": ownerKey } : {}) }), params({ token: t }))),
    receipt: async () => PrivacyReceipt.parse(await (await take(await receiptRoute(new Request(`${ORIGIN}/api/privacy/receipt`, { headers: headers() })))).json()),
    status: async () => StatusResponse.parse(await (await take(await statusRoute(new Request(`${ORIGIN}/api/status`, { headers: headers() })))).json()),
  };
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const { error } = ErrorEnvelope.parse(await res.json());
  expect(error.code).toBe(code);
  return error;
}

async function makeShare(owner = person("203.0.113.1")) {
  const res = await owner.create();
  expect(res.status).toBe(201);
  return { owner, share: CreateShareResponse.parse(await res.json()) };
}

describe("create", () => {
  it("stores re-encoded images privately and returns a link, token and owner key", async () => {
    const { share } = await makeShare();
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.ownerKey.length).toBeGreaterThanOrEqual(22);
    expect(share.url).toBe(`${ORIGIN}/share/${share.token}`);
    expect(share.expiresAt).toBe("2026-11-03T08:00:00.000Z");
    expect(blob.size).toBe(2);
    expect(await blob.list(`shares/${share.token}/`)).toHaveLength(2);
  });

  it("never stores the owner key, only its hash", async () => {
    const { share } = await makeShare();
    const stored = JSON.stringify(await ctx.kv.get(keys.share(share.token)));
    expect(stored).not.toContain(share.ownerKey);
    expect(stored).toContain("ownerKeyHash");
  });

  it("strips metadata (EXIF GPS) and normalises size and format", async () => {
    const withGps = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#884" } })
      .withExif({ IFD0: { Copyright: "secret-owner-name" } })
      .jpeg()
      .toBuffer();
    const { owner, share } = await makeShare();
    const res = await owner.create({ images: [withGps], meta: { consent: true, items: [{ label: "Wide" }], expiresInDays: 1 } });
    const made = CreateShareResponse.parse(await res.json());
    const [path] = await blob.list(`shares/${made.token}/`);
    const stored = Buffer.from((await blob.get(path!))!.body as Uint8Array);
    const meta = await sharp(stored).metadata();
    expect({ format: meta.format, w: meta.width, h: meta.height }).toEqual({ format: "jpeg", w: 1024, h: 768 });
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from("secret-owner-name"))).toBe(false);
    expect(share.token).not.toBe(made.token);
  });

  it("requires explicit consent, one image per item, valid images, and the feature flag", async () => {
    // Every attempt counts toward the 5/hour limit, so each case is a different person.
    let n = 0;
    const p = () => person(`203.0.113.${20 + n++}`);
    const one = { consent: true, items: [{ label: "a" }], expiresInDays: 7 };
    await expectError(await p().create({ meta: { items: [{ label: "a" }], expiresInDays: 7 }, images: [meera] }), 400, "VALIDATION_FAILED");
    await expectError(await p().create({ meta: { ...one, consent: false }, images: [meera] }), 400, "VALIDATION_FAILED");
    await expectError(await p().create({ meta: { ...one, items: [{ label: "a" }, { label: "b" }] }, images: [meera] }), 400, "VALIDATION_FAILED");
    await expectError(await p().create({ meta: { ...one, expiresInDays: 30 }, images: [meera] }), 400, "VALIDATION_FAILED");
    await expectError(await p().create({ rawMeta: "not json", images: [meera] }), 400, "VALIDATION_FAILED");
    await expectError(await p().create({ meta: one, images: [new TextEncoder().encode("not an image")] }), 415, "IMAGE_FORMAT");
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000" } }).jpeg().toBuffer();
    await expectError(await p().create({ meta: one, images: [tiny] }), 422, "IMAGE_TOO_SMALL");
    await expectError(await p().create({ meta: one, images: [new Uint8Array(2_000_001)] }), 413, "PAYLOAD_TOO_LARGE");
    expect(blob.size).toBe(0); // nothing half-stored after any rejection

    makeCtx({ CAP_SHARES: "false" });
    await expectError(await person("203.0.113.3").create(), 403, "FEATURE_DISABLED");
  });

  it("limits creation to 5 per hour per person", async () => {
    const owner = person("203.0.113.4");
    for (let i = 0; i < 5; i++) expect((await owner.create()).status).toBe(201);
    await expectError(await owner.create(), 429, "RATE_LIMITED");
    now += 3_600_000;
    expect((await owner.create()).status).toBe(201);
  });

  it("cleans up uploaded blobs if storage fails part-way", async () => {
    let n = 0;
    const real = blob.put.bind(blob);
    blob.put = async (p, b, c) => {
      if (++n === 2) throw new Error("storage down");
      return real(p, b, c);
    };
    await expectError(await person("203.0.113.5").create(), 500, "INTERNAL");
    expect(blob.size).toBe(0);
  });

  it("is on by default locally and off on Vercel until configured; Vercel needs blob, cron and upstash", () => {
    expect(parseEnv({}).CAP_SHARES).toBe(true);
    expect(parseEnv({ VERCEL: "1" }).CAP_SHARES).toBe(false);
    expect(() => parseEnv({ VERCEL: "1", CAP_SHARES: "true" })).toThrow(/BLOB_READ_WRITE_TOKEN.*\n.*CRON_SECRET.*\n.*KV_DRIVER/);
    expect(
      parseEnv({
        VERCEL: "1",
        CAP_SHARES: "true",
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x",
        CRON_SECRET: CRON,
        KV_DRIVER: "upstash",
        UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "t",
        SESSION_SECRET: "s".repeat(32),
        IP_HASH_SALT: "salt-salt",
        NODE_ENV: "production",
      }).CAP_SHARES,
    ).toBe(true);
  });
});

describe("helper view", () => {
  it("serves the manifest and images to anyone with the link, from our own routes", async () => {
    const { share } = await makeShare();
    const helper = person("198.51.100.1");
    const manifest = ShareManifest.parse(await (await helper.manifest(share.token)).json());
    expect(manifest.items).toEqual([
      { key: "i1", label: "Closest to me", imageUrl: `/api/shares/${share.token}/items/i1` },
      { key: "i2", label: "Easier", imageUrl: `/api/shares/${share.token}/items/i2` },
    ]);
    const img = await helper.image(share.token, "i1");
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toBe("private, max-age=300");
    expect([...new Uint8Array(await img.arrayBuffer()).subarray(0, 2)]).toEqual([0xff, 0xd8]);
    await expectError(await helper.image(share.token, "i9"), 404, "NOT_FOUND");
  });

  it("treats unknown, malformed and expired tokens the same (410), and expires on time", async () => {
    const { share } = await makeShare();
    const helper = person("198.51.100.2");
    await expectError(await helper.manifest("A".repeat(22)), 410, "EXPIRED");
    await expectError(await helper.manifest("short"), 410, "EXPIRED");
    now += 7 * 86_400_000 - 1;
    expect((await helper.manifest(share.token)).status).toBe(200);
    now += 1;
    await expectError(await helper.manifest(share.token), 410, "EXPIRED");
    await expectError(await helper.image(share.token, "i1"), 410, "EXPIRED");
    await expectError(await helper.vote(share.token, { itemKey: "i1" }), 410, "EXPIRED");
  });
});

describe("votes", () => {
  it("counts votes and notes for the owner only", async () => {
    const { owner, share } = await makeShare();
    const ana = person("198.51.100.3");
    const sam = person("198.51.100.4");
    expect(await (await ana.vote(share.token, { itemKey: "i1", note: "Feels most like you" })).json()).toEqual({ accepted: true, votesLeft: 4 });
    now += 1000;
    expect((await sam.vote(share.token, { itemKey: "i1" })).status).toBe(201);
    now += 1000;
    expect((await sam.vote(share.token, { itemKey: "i2", note: "  Nice\u0007 and easy  " })).status).toBe(201);

    await expectError(await ana.results(share.token), 401, "UNAUTHORISED");
    await expectError(await ana.results(share.token, "wrong-key-wrong-key-wrong-key"), 401, "UNAUTHORISED");
    const results = ShareResults.parse(await (await owner.results(share.token, share.ownerKey)).json());
    expect(results.items).toEqual([
      { key: "i1", label: "Closest to me", votes: 2 },
      { key: "i2", label: "Easier", votes: 1 },
    ]);
    expect(results.notes.map((n) => [n.itemKey, n.note])).toEqual([["i1", "Feels most like you"], ["i2", "Nice  and easy"]]);
  });

  it("rejects unknown items and bad bodies; 5 votes per helper per share, then 429", async () => {
    const { share } = await makeShare();
    const ana = person("198.51.100.5");
    await expectError(await ana.vote(share.token, { itemKey: "nope" }), 400, "VALIDATION_FAILED");
    await expectError(await ana.vote(share.token, { itemKey: "i1", note: "x".repeat(141) }), 400, "VALIDATION_FAILED");
    await expectError(await ana.vote(share.token, { itemKey: "i1", extra: 1 }), 400, "VALIDATION_FAILED");
    for (let i = 0; i < 5; i++) expect((await ana.vote(share.token, { itemKey: "i1" })).status).toBe(201);
    const limited = await ana.vote(share.token, { itemKey: "i2" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    await expectError(limited, 429, "RATE_LIMITED");
    // a different person is unaffected
    expect((await person("198.51.100.6").vote(share.token, { itemKey: "i2" })).status).toBe(201);
  });

  it("caps the total votes on a share", async () => {
    const { share } = await makeShare();
    for (let i = 0; i < 200; i++) await ctx.kv.incrBy(keys.shareVoteTotal(share.token), 1);
    await expectError(await person("198.51.100.7").vote(share.token, { itemKey: "i1" }), 429, "RATE_LIMITED");
  });
});

describe("revoke and privacy", () => {
  it("revoking deletes images, votes and the record at once; wrong key can't; twice is gone", async () => {
    const { owner, share } = await makeShare();
    await person("198.51.100.8").vote(share.token, { itemKey: "i1" });
    await expectError(await owner.revoke(share.token), 401, "UNAUTHORISED");
    await expectError(await person("198.51.100.9").revoke(share.token, share.ownerKey + "x"), 401, "UNAUTHORISED");
    expect(blob.size).toBe(2);

    expect((await owner.revoke(share.token, share.ownerKey)).status).toBe(200);
    expect(blob.size).toBe(0);
    expect(await ctx.kv.get(keys.share(share.token))).toBeNull();
    expect(await ctx.kv.sMembers(keys.shareVotes(share.token))).toEqual([]);
    await expectError(await person("198.51.100.10").manifest(share.token), 410, "EXPIRED");
    await expectError(await owner.revoke(share.token, share.ownerKey), 410, "EXPIRED");
  });

  it("the privacy receipt lists this person's live shares, without the token", async () => {
    const { owner, share } = await makeShare();
    await makeShare(person("203.0.113.9"));
    const receipt = await owner.receipt();
    expect(receipt.shares).toEqual([{ tokenPrefix: share.token.slice(0, 6), itemCount: 2, expiresAt: share.expiresAt }]);
    expect(receipt.serverStoresImages).toBe(true); // honest while a share link is live
    await owner.revoke(share.token, share.ownerKey);
    const after = await owner.receipt();
    expect(after.shares).toEqual([]);
    expect(after.serverStoresImages).toBe(false);
    expect((await person("203.0.113.13").receipt()).serverStoresImages).toBe(false); // someone who never shared
  });

  it("status reports the capability", async () => {
    expect((await person("203.0.113.11").status()).capabilities.shares).toBe(true);
    makeCtx({ CAP_SHARES: "false" });
    expect((await person("203.0.113.11").status()).capabilities.shares).toBe(false);
  });
});

describe("daily cleanup", () => {
  const cron = (token?: string) => cleanupRoute(new Request(`${ORIGIN}/api/cron/cleanup`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

  it("requires the cron secret, and is off without one", async () => {
    await expectError(await cron(), 401, "UNAUTHORISED");
    await expectError(await cron("wrong-secret-0123456789"), 401, "UNAUTHORISED");
    makeCtx({ CRON_SECRET: "" });
    await expectError(await cron(CRON), 401, "UNAUTHORISED");
  });

  it("deletes expired shares (kept past expiry for this) and stray blobs, and leaves live ones", async () => {
    const { share: shortLived } = await makeShare();
    const owner = person("203.0.113.12");
    const longLived = CreateShareResponse.parse(await (await owner.create({ meta: { consent: true, items: [{ label: "x" }], expiresInDays: 7 }, images: [meera] })).json());
    // make the first one expire sooner than the second by moving the clock past 7 days only for it
    const record = (await ctx.kv.get<{ expiresAt: number }>(keys.share(shortLived.token)))!;
    record.expiresAt = now + 1000;
    await ctx.kv.set(keys.share(shortLived.token), record);
    await blob.put("shares/orphan-token-without-record/a.jpg", new Uint8Array([1]), "image/jpeg");
    expect(blob.size).toBe(4);

    now += 2000;
    const report = await (await cron(CRON)).json();
    expect(report).toEqual({ expired: 1, orphanBlobs: 1, live: 1 });
    expect(await blob.list("shares/")).toHaveLength(1);
    expect((await blob.list(`shares/${longLived.token}/`)).length).toBe(1);
    expect(await ctx.kv.sMembers(keys.sharesIndex)).toEqual([longLived.token]);
    // idempotent
    expect(await (await cron(CRON)).json()).toEqual({ expired: 0, orphanBlobs: 0, live: 1 });
  });

  it("finds expired shares even after the record's own TTL grace passes", async () => {
    const { share } = await makeShare();
    now += 7 * 86_400_000 + 3 * 86_400_000; // past expiry and past the 2-day grace: the record is gone
    expect(await ctx.kv.get(keys.share(share.token))).toBeNull();
    const report = await (await cron(CRON)).json();
    expect(report).toMatchObject({ expired: 1 });
    expect(blob.size).toBe(0);
  });
});
