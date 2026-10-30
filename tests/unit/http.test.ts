import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/server/http/errors";
import { toErrorBody } from "@/lib/server/http/handler";
import { clientIp, hashIp } from "@/lib/server/http/ip";
import { rateLimit, slidingRateLimit } from "@/lib/server/http/ratelimit";
import { getSession, verifySessionCookie } from "@/lib/server/http/session";
import { MemoryKV } from "@/lib/server/store/memory";
import { UpstashKV, type RedisLike } from "@/lib/server/store/upstash";
import { YouCamHttpError } from "@/lib/server/youcam/adapter";

const SECRET = "x".repeat(32);

describe("session cookie", () => {
  it("mints a signed id and verifies it; tampering mints a new one", () => {
    const first = getSession(new Request("http://localhost/api/status"), SECRET);
    expect(first.isNew).toBe(true);
    expect(first.setCookie).not.toContain("Secure"); // http in dev
    const value = first.setCookie!.split(";")[0]!.split("=").slice(1).join("=");
    expect(verifySessionCookie(value, SECRET)).toBe(first.id);

    const again = getSession(new Request("http://localhost/", { headers: { cookie: `other=1; cm_sid=${value}` } }), SECRET);
    expect(again).toEqual({ id: first.id, isNew: false });

    const forged = `${first.id}.${"A".repeat(43)}`;
    expect(getSession(new Request("http://localhost/", { headers: { cookie: `cm_sid=${forged}` } }), SECRET).isNew).toBe(true);
    expect(verifySessionCookie(value, "y".repeat(32))).toBeUndefined();
  });
});

describe("ip hashing", () => {
  it("uses the first forwarded address and never returns it raw", () => {
    const req = new Request("http://localhost/", { headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("198.51.100.4");
    const h = hashIp("198.51.100.4", "salt");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toBe(hashIp("198.51.100.4", "other-salt"));
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window", async () => {
    let now = 0;
    const kv = new MemoryKV(() => now);
    const rule = { name: "t", limit: 2, windowMs: 1000 };
    expect((await rateLimit(kv, rule, "s", now)).ok).toBe(true);
    expect((await rateLimit(kv, rule, "s", now)).ok).toBe(true);
    const third = await rateLimit(kv, rule, "s", (now = 250));
    expect(third).toEqual({ ok: false, remaining: 0, retryAfterMs: 750 });
    expect((await rateLimit(kv, rule, "other", now)).ok).toBe(true);
    now = 1000;
    expect((await rateLimit(kv, rule, "s", now)).ok).toBe(true);
  });
});

describe("slidingRateLimit", () => {
  const rule = { name: "s", limit: 10, windowMs: 1000 };
  const burst = async (kv: MemoryKV, at: number, n: number) => {
    let ok = 0;
    for (let i = 0; i < n; i++) if ((await slidingRateLimit(kv, rule, "g", at)).ok) ok++;
    return ok;
  };

  it("doesn't let double the limit through around a window boundary (a fixed window does)", async () => {
    const sliding = new MemoryKV(() => 0);
    const fixed = new MemoryKV(() => 0);
    // 10 calls just before the boundary, 10 just after: 20 inside any 1 s span.
    const slidingOk = (await burst(sliding, 999, 10)) + (await burst(sliding, 1001, 10));
    let fixedOk = 0;
    for (const at of [999, 1001]) for (let i = 0; i < 10; i++) if ((await rateLimit(fixed, rule, "g", at)).ok) fixedOk++;
    expect(fixedOk).toBe(20);
    expect(slidingOk).toBeLessThanOrEqual(11);
  });

  it("a denied attempt doesn't consume budget, and capacity returns as the old window fades", async () => {
    const kv = new MemoryKV(() => 0);
    expect(await burst(kv, 500, 15)).toBe(10);
    expect((await slidingRateLimit(kv, rule, "g", 500)).retryAfterMs).toBeGreaterThan(0);
    // Half a window later, half of the earlier calls no longer count.
    expect(await burst(kv, 1500, 20)).toBeGreaterThanOrEqual(4);
    expect(await burst(kv, 3000, 20)).toBe(10); // two windows on, back to the full limit
  });
});

describe("toErrorBody", () => {
  it("maps every kind of failure to the envelope", () => {
    expect(toErrorBody(new ApiError("IMAGE_TOO_SMALL")).body).toMatchObject({ code: "IMAGE_TOO_SMALL", messageKey: "image.tooSmall" });
    expect(toErrorBody(z.object({ a: z.string() }).safeParse({}).error).body.code).toBe("VALIDATION_FAILED");
    expect(toErrorBody(new YouCamHttpError(429, "x", 12_000))).toMatchObject({ body: { code: "RATE_LIMITED" }, headers: { "retry-after": "12" } });
    expect(toErrorBody(new YouCamHttpError(503, "x")).body).toMatchObject({ code: "YOUCAM_UNAVAILABLE", retryable: true });
    expect(toErrorBody(new YouCamHttpError("timeout", "x")).body.code).toBe("YOUCAM_TIMEOUT");
    expect(toErrorBody(new YouCamHttpError(401, "x")).body.code).toBe("INTERNAL");
    expect(toErrorBody(new YouCamHttpError("schema", "x")).body.code).toBe("INTERNAL");
    expect(toErrorBody(new Error("boom")).body).toEqual({ code: "INTERNAL", messageKey: "generic.somethingWrong", retryable: false });
  });
});

describe("UpstashKV", () => {
  /** Minimal in-memory stand-in for the REST client (TTL ignored). */
  function fakeRedis() {
    const data = new Map<string, unknown>();
    const ttls = new Map<string, number>();
    const redis: RedisLike = {
      async get<T>(k: string) {
        return (data.get(k) as T) ?? null;
      },
      async set(k, v, o) {
        if (o?.nx && data.has(k)) return null;
        data.set(k, v);
        if (o?.px) ttls.set(k, o.px);
        return "OK";
      },
      async del(...ks) {
        return ks.filter((k) => data.delete(k)).length;
      },
      async incrby(k, by) {
        const v = ((data.get(k) as number) ?? 0) + by;
        data.set(k, v);
        return v;
      },
      async pexpire(k, ms) {
        if (!data.has(k)) return 0;
        ttls.set(k, ms);
        return 1;
      },
      async sadd(k, ...ms) {
        const s = (data.get(k) as Set<string>) ?? new Set<string>();
        const before = s.size;
        ms.forEach((m) => s.add(m));
        data.set(k, s);
        return s.size - before;
      },
      async smembers(k) {
        return [...((data.get(k) as Set<string>) ?? [])];
      },
      async srem(k, ...ms) {
        const s = data.get(k) as Set<string> | undefined;
        return s ? ms.filter((m) => s.delete(m)).length : 0;
      },
    };
    return { redis, ttls };
  }

  it("implements the KV contract on the Redis client", async () => {
    const { redis, ttls } = fakeRedis();
    const kv = new UpstashKV(redis);
    await kv.set("a", { x: 1 }, { ttlMs: 500 });
    expect(await kv.get("a")).toEqual({ x: 1 });
    expect(ttls.get("a")).toBe(500);
    expect(await kv.setNX("lock", 1, 100)).toBe(true);
    expect(await kv.setNX("lock", 1, 100)).toBe(false);
    expect(await kv.incrBy("n", 2, { ttlMs: 60 })).toBe(2);
    expect(ttls.get("n")).toBe(60);
    ttls.delete("n");
    expect(await kv.incrBy("n", 2, { ttlMs: 60 })).toBe(4);
    expect(ttls.has("n")).toBe(false); // TTL only on creation
    expect(await kv.sAdd("s")).toBe(0);
    expect(await kv.sAdd("s", "a", "b")).toBe(2);
    expect(await kv.sRem("s", "a")).toBe(1);
    expect(await kv.sMembers("s")).toEqual(["b"]);
    expect(await kv.expire("missing", 10)).toBe(false);
    expect(await kv.del()).toBe(0);
  });
});
