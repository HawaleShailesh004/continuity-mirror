import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/baselines/route";
import { DELETE } from "@/app/api/baselines/[id]/route";
import { CreateBaselineResponse, DeleteBaselineResponse } from "@/lib/contracts/api";
import { ErrorEnvelope } from "@/lib/contracts/errors";
import { keys } from "@/lib/server/keys";
import { setServerContext, type ServerContext } from "@/lib/server/context";
import { parseEnv } from "@/lib/server/env";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { MemoryKV } from "@/lib/server/store/memory";
import { MockYouCamAdapter } from "@/lib/server/youcam/mock";

const meera = readFileSync(join(process.cwd(), "public/mock/personas/meera.jpg"));
let now: number;
let ctx: ServerContext;

beforeEach(() => {
  now = Date.parse("2026-10-27T08:00:00Z");
  ctx = { env: parseEnv({}), kv: new MemoryKV(() => now), blob: new MemoryBlobStore(), youcam: new MockYouCamAdapter({ now: () => now, latencyScale: 0 }), now: () => now };
  setServerContext(ctx);
});
afterEach(() => setServerContext(undefined));

function uploadRequest(bytes: Uint8Array | null, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (bytes) form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "me.jpg");
  return new Request("https://cm.test/api/baselines", { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.7", ...headers } });
}

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0];

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ErrorEnvelope.parse(await res.json());
  expect(body.error.code).toBe(code);
  return body.error;
}

describe("POST /api/baselines", () => {
  it("normalises, uploads once, and reuses by content", async () => {
    const upload = vi.spyOn(ctx.youcam, "uploadImage");
    const first = await POST(uploadRequest(meera));
    expect(first.status).toBe(201);
    expect(first.headers.get("x-request-id")).toMatch(/[0-9a-f-]{36}/);
    const cookie = cookieOf(first)!;
    expect(first.headers.get("set-cookie")).toMatch(/cm_sid=.+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure/);

    const body = CreateBaselineResponse.parse(await first.json());
    expect(body).toMatchObject({ width: 768, height: 1024, reused: false, expiresAt: "2026-10-28T08:00:00.000Z" });
    const jpeg = Buffer.from(body.normalisedImage.split(",")[1]!, "base64");
    expect((await sharp(jpeg).metadata()).format).toBe("jpeg");

    const second = await POST(uploadRequest(meera, { cookie }));
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toBeNull(); // same session
    expect(CreateBaselineResponse.parse(await second.json())).toMatchObject({ baselineId: body.baselineId, reused: true });
    expect(upload).toHaveBeenCalledTimes(1);

    expect(await ctx.kv.get(keys.baseline(body.baselineId))).toMatchObject({ fileId: expect.stringMatching(/^mock-file-/) });
  });

  it("never stores image bytes in KV", async () => {
    const res = await POST(uploadRequest(meera));
    const { baselineId } = CreateBaselineResponse.parse(await res.json());
    const stored = JSON.stringify(await ctx.kv.get(keys.baseline(baselineId)));
    expect(stored.length).toBeLessThan(400);
  });

  it("rejects bad input with the right codes", async () => {
    await expectError(await POST(uploadRequest(new TextEncoder().encode("nope"))), 415, "IMAGE_FORMAT");
    await expectError(await POST(uploadRequest(null)), 400, "VALIDATION_FAILED");
    await expectError(await POST(new Request("https://cm.test/api/baselines", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })), 400, "VALIDATION_FAILED");
    const small = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#000" } }).jpeg().toBuffer();
    await expectError(await POST(uploadRequest(small)), 422, "IMAGE_TOO_SMALL");
  });

  it("respects the kill switch, the env default and the live_disabled scenario", async () => {
    await ctx.kv.set(keys.liveFlag, false);
    await expectError(await POST(uploadRequest(meera)), 503, "LIVE_DISABLED");
    await ctx.kv.del(keys.liveFlag);
    setServerContext({ ...ctx, env: parseEnv({ LIVE_GENERATION_ENABLED: "false" }) });
    await expectError(await POST(uploadRequest(meera)), 503, "LIVE_DISABLED");
    setServerContext(ctx);
    await expectError(await POST(uploadRequest(meera, { "x-cm-mock-scenario": "live_disabled" })), 503, "LIVE_DISABLED");
  });

  it("maps an upstream 429 to RATE_LIMITED with Retry-After", async () => {
    const res = await POST(uploadRequest(meera, { "x-cm-mock-scenario": "rate_limited" }));
    expect(res.headers.get("retry-after")).toBe("5");
    await expectError(res, 429, "RATE_LIMITED");
  });

  it("ignores the mock scenario header outside mock mode", async () => {
    setServerContext({ ...ctx, env: parseEnv({ YOUCAM_MODE: "replay" }) });
    expect((await POST(uploadRequest(meera, { "x-cm-mock-scenario": "live_disabled" }))).status).toBe(201);
  });

  it("limits uploads per session (8 per minute)", async () => {
    const first = await POST(uploadRequest(meera));
    const cookie = cookieOf(first)!;
    for (let i = 0; i < 7; i++) expect((await POST(uploadRequest(meera, { cookie }))).status).toBe(200);
    const limited = await POST(uploadRequest(meera, { cookie }));
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    await expectError(limited, 429, "RATE_LIMITED");
    now += 60_000;
    expect((await POST(uploadRequest(meera, { cookie }))).status).toBe(200);
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    vi.spyOn(ctx.youcam, "uploadImage").mockRejectedValue(new Error("db password is hunter2"));
    const res = await POST(uploadRequest(meera));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
  });
});

describe("DELETE /api/baselines/:id", () => {
  it("forgets the baseline, idempotently, and is honest about upstream retention", async () => {
    const created = await POST(uploadRequest(meera));
    const cookie = cookieOf(created)!;
    const { baselineId } = CreateBaselineResponse.parse(await created.json());
    const del = () => DELETE(new Request(`https://cm.test/api/baselines/${baselineId}`, { method: "DELETE", headers: { cookie } }), { params: Promise.resolve({ id: baselineId }) });

    const res = await del();
    expect(DeleteBaselineResponse.parse(await res.json())).toEqual({ deleted: true, upstreamRetentionDays: 30 });
    expect(await ctx.kv.get(keys.baseline(baselineId))).toBeNull();
    expect((await del()).status).toBe(200);
  });

  it("validates the id", async () => {
    const res = await DELETE(new Request("https://cm.test/api/baselines/xyz", { method: "DELETE" }), { params: Promise.resolve({ id: "xyz" }) });
    await expectError(res, 400, "VALIDATION_FAILED");
  });
});
