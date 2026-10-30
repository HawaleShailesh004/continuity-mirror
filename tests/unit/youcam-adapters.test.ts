import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { YouCamHttpError } from "@/lib/server/youcam/adapter";
import { LiveYouCamAdapter } from "@/lib/server/youcam/live";
import { MockYouCamAdapter } from "@/lib/server/youcam/mock";
import { ReplayYouCamAdapter } from "@/lib/server/youcam/replay";

type Call = { url: string; method: string; headers: Headers; body?: unknown; signal?: AbortSignal | null };
type Reply = Response | Error | ((call: Call) => Response | Promise<Response>);

/** Scripted fetch: replies in order, records every call. */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(input), method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body, signal: init.signal };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error(`unexpected call ${call.method} ${call.url}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next;
  }) as typeof fetch;
  return { fn, calls };
}

const ok = (body: unknown) => Response.json(body);
const http = (status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ status, error: "x" }), { status, headers });

function live(replies: Reply[], extra: Partial<ConstructorParameters<typeof LiveYouCamAdapter>[0]> = {}) {
  const f = fakeFetch(replies);
  const sleeps: number[] = [];
  const adapter = new LiveYouCamAdapter({
    base: "https://yce.test/",
    apiKey: "test-key-123",
    fetch: f.fn,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    ...extra,
  });
  return { adapter, calls: f.calls, sleeps };
}

describe("LiveYouCamAdapter", () => {
  it("uploads: init with auth, then PUT to storage without auth", async () => {
    const { adapter, calls } = live([
      ok({ status: 200, data: { files: [{ file_id: "F1", requests: [{ method: "PUT", url: "https://s3.test/put", headers: { "Content-Type": "image/jpeg" } }] }] } }),
      new Response(null, { status: 200 }),
    ]);
    expect(await adapter.uploadImage(new Uint8Array(10), { fileName: "a.jpg", contentType: "image/jpeg" })).toEqual({ fileId: "F1" });
    expect(calls[0]).toMatchObject({ url: "https://yce.test/s2s/v2.0/file", method: "POST" });
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer test-key-123");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ files: [{ content_type: "image/jpeg", file_name: "a.jpg", file_size: 10 }] });
    expect(calls[1]).toMatchObject({ url: "https://s3.test/put", method: "PUT" });
    expect(calls[1]!.headers.get("authorization")).toBeNull();
  });

  it("maps task states, including a YouCam error (HTTP 200, task_status error)", async () => {
    const { adapter, calls } = live([
      ok({ status: 200, data: { task_id: "T1" } }),
      ok({ status: 200, data: { task_status: "running" } }),
      ok({ status: 200, data: { task_status: "success", error: null, results: { url: "https://s3.test/r.jpg" } } }),
      ok({ status: 200, data: { task_status: "error", error: "error_no_face", error_message: "No face", results: null } }),
    ]);
    expect(await adapter.createTask("hair-transfer", { src_file_id: "F1", template_id: "all_pixie" })).toEqual({ taskId: "T1" });
    expect(calls[0]!.url).toBe("https://yce.test/s2s/v2.1/task/hair-transfer");
    expect(await adapter.getTask("hair-transfer", "T1")).toEqual({ status: "running" });
    expect(calls[1]!.url).toBe("https://yce.test/s2s/v2.1/task/hair-transfer/T1");
    expect(await adapter.getTask("hair-transfer", "T1")).toEqual({ status: "success", resultUrl: "https://s3.test/r.jpg" });
    expect(await adapter.getTask("hair-color", "T2")).toEqual({ status: "error", youcamCode: "error_no_face", message: "No face" });
  });

  it("retries safe calls on 429/5xx/network with backoff + jitter, honouring Retry-After", async () => {
    const { adapter, sleeps } = live([http(503), http(429, { "retry-after": "9" }), new TypeError("fetch failed"), ok({ status: 200, results: [{ type: "ApiPaygToken", amount: 600 }, { type: "x", amount: 3 }] })]);
    expect(await adapter.getBalance()).toBe(603);
    expect(sleeps).toEqual([1000, 9000, 7000]);
  });

  it("gives up after the last backoff", async () => {
    const { adapter } = live([http(502), http(502), http(502), http(502)]);
    await expect(adapter.getBalance()).rejects.toMatchObject({ httpStatus: 502, retryable: true });
  });

  it("never retries task creation after a 5xx (the task may exist and be charged), only after 429", async () => {
    const a = live([http(500)]);
    await expect(a.adapter.createTask("hair-color", {})).rejects.toMatchObject({ httpStatus: 500 });
    expect(a.calls).toHaveLength(1);
    const b = live([http(429), ok({ status: 200, data: { task_id: "T9" } })]);
    expect(await b.adapter.createTask("hair-color", {})).toEqual({ taskId: "T9" });
  });

  it("does not retry auth or parameter errors", async () => {
    const { adapter, calls } = live([http(401)]);
    await expect(adapter.getBalance()).rejects.toMatchObject({ httpStatus: 401, retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("times out slow calls via the request's AbortSignal", async () => {
    // Never answers; only the adapter's timeout signal can end it.
    const hang = (call: Call) => new Promise<Response>((_, reject) => call.signal?.addEventListener("abort", () => reject(call.signal!.reason)));
    const { adapter } = live([hang], { timeoutMs: 5, backoffMs: [] });
    await expect(adapter.getBalance()).rejects.toMatchObject({ httpStatus: "timeout" });
  });

  it("detects response drift and keeps secrets out of error messages", async () => {
    const { adapter } = live([ok({ status: 200, data: { taskId: "renamed" } })]);
    const err = (await adapter.createTask("hair-transfer", {}).catch((e: unknown) => e)) as YouCamHttpError;
    expect(err).toMatchObject({ httpStatus: "schema" });
    expect(err.message).toContain("response drift");
    expect(err.message).not.toContain("test-key-123");
  });

  it("pages through templates with starting_token", async () => {
    const t = (id: string) => ({ id, thumb: "https://cdn/x.jpg", title: id, category_name: "Female", keep_users_color: true });
    const { adapter, calls } = live([
      ok({ status: 200, data: { templates: [t("a"), t("b")], next_token: "42" } }),
      ok({ status: 200, data: { templates: [t("c")], next_token: null } }),
    ]);
    expect((await adapter.listTemplates()).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(calls[0]!.url).toContain("page_size=20");
    expect(calls[1]!.url).toContain("starting_token=42");
  });

  it("labels results by their bytes when storage doesn't say image/* (colour steps return PNG)", async () => {
    const png = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#222" } }).png().toBuffer();
    const { adapter } = live([new Response(png, { headers: { "content-type": "binary/octet-stream" } }), new Response(new Uint8Array(32), { headers: { "content-type": "application/octet-stream" } })]);
    const res = await adapter.fetchResult("https://s3.test/a");
    expect(res.contentType).toBe("image/png");
    expect(res.body).toBeInstanceOf(Uint8Array);
    await expect(adapter.fetchResult("https://s3.test/b")).rejects.toMatchObject({ httpStatus: "schema" });
  });

  it("fetches results without our auth header", async () => {
    const { adapter, calls } = live([new Response(new Uint8Array([0xff, 0xd8]), { headers: { "content-type": "image/jpeg" } })]);
    const res = await adapter.fetchResult("https://s3.test/result.jpg");
    expect(res.contentType).toBe("image/jpeg");
    expect(calls[0]!.headers.get("authorization")).toBeNull();
  });
});

describe("MockYouCamAdapter", () => {
  const image = () => sharp({ create: { width: 768, height: 1024, channels: 3, background: "#8a6446" } }).jpeg().toBuffer();

  it("runs a 2-step chain with latency, charges on success, and watermarks results", async () => {
    let now = 0;
    const mock = new MockYouCamAdapter({ now: () => now });
    const { fileId } = await mock.uploadImage(await image(), { fileName: "b.jpg", contentType: "image/jpeg" });
    const t1 = await mock.createTask("hair-transfer", { src_file_id: fileId, template_id: "all_pixie" });
    expect(await mock.getTask("hair-transfer", t1.taskId)).toEqual({ status: "running" });
    now += 8000;
    const done = await mock.getTask("hair-transfer", t1.taskId);
    expect(done.status).toBe("success");
    const url = (done as { resultUrl: string }).resultUrl;

    const t2 = await mock.createTask("hair-color", { src_file_url: url, pattern: { name: "full" }, palettes: [{ color: "#3B2A20" }] });
    now += 8000;
    const done2 = await mock.getTask("hair-color", t2.taskId);
    expect(done2.status).toBe("success");
    expect(await mock.getBalance()).toBe(1000 - 3);

    const result = await mock.fetchResult((done2 as { resultUrl: string }).resultUrl);
    const meta = await sharp(result.body as Uint8Array).metadata();
    expect({ format: meta.format, w: meta.width, h: meta.height }).toEqual({ format: "jpeg", w: 768, h: 1024 });
    const original = await sharp(await image()).raw().toBuffer();
    expect(Buffer.compare(await sharp(result.body as Uint8Array).raw().toBuffer(), original)).not.toBe(0); // watermark changed pixels
  });

  it("scenarios: task errors are free, timeout never finishes, 429 on rate_limited", async () => {
    let now = 0;
    const mock = new MockYouCamAdapter({ now: () => now });
    const { fileId } = await mock.uploadImage(await image(), { fileName: "b.jpg", contentType: "image/jpeg" });
    const rejected = await mock.createTask("hair-transfer", { src_file_id: fileId, template_id: "x" }, { mockScenario: "hair_too_short" });
    const hung = await mock.createTask("hair-transfer", { src_file_id: fileId, template_id: "x" }, { mockScenario: "timeout" });
    now += 60_000;
    expect(await mock.getTask("hair-transfer", rejected.taskId)).toMatchObject({ status: "error", youcamCode: "error_hair_too_short" });
    expect(await mock.getTask("hair-transfer", hung.taskId)).toEqual({ status: "running" });
    expect(await mock.getBalance()).toBe(1000);
    await expect(mock.createTask("hair-transfer", {}, { mockScenario: "rate_limited" })).rejects.toMatchObject({ httpStatus: 429 });
  });

  it("catches mapper bugs: unfilled placeholders and non-mock result URLs", async () => {
    const mock = new MockYouCamAdapter({ latencyScale: 0 });
    await expect(mock.createTask("hair-transfer", { src_file_id: "<baseline>" })).rejects.toMatchObject({ httpStatus: 400 });
    await expect(mock.createTask("hair-color", { src_file_url: "https://elsewhere/x.jpg" })).rejects.toMatchObject({ httpStatus: 400 });
  });

  it("is stateless across instances: another instance can poll, and renders a placeholder without the photo", async () => {
    let now = 0;
    const a = new MockYouCamAdapter({ now: () => now });
    const b = new MockYouCamAdapter({ now: () => now });
    const { fileId } = await a.uploadImage(await image(), { fileName: "b.jpg", contentType: "image/jpeg" });
    const { taskId } = await a.createTask("hair-transfer", { src_file_id: fileId, template_id: "all_pixie" });
    now += 9000;
    const done = await b.getTask("hair-transfer", taskId);
    expect(done.status).toBe("success");
    const img = await b.fetchResult((done as { resultUrl: string }).resultUrl);
    expect((await sharp(img.body as Uint8Array).metadata()).width).toBe(768);
    await expect(b.getTask("hair-transfer", "mock-task.garbage")).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("lists the 116 real templates", async () => {
    expect(await new MockYouCamAdapter().listTemplates()).toHaveLength(116);
  });
});

describe("ReplayYouCamAdapter", () => {
  const replay = (strict = true) =>
    new ReplayYouCamAdapter({ fixturesDir: join(process.cwd(), "tests/fixtures/youcam"), publicDir: join(process.cwd(), "public"), strict });

  it("replays a recorded task by signature, running first", async () => {
    const r = replay();
    const { taskId } = await r.createTask("hair-transfer", { src_file_id: "anything", template_id: "all_short_bob" });
    expect(await r.getTask("hair-transfer", taskId)).toEqual({ status: "running" });
    const done = await r.getTask("hair-transfer", taskId);
    expect(done).toMatchObject({ status: "success" });
    const img = await r.fetchResult((done as { resultUrl: string }).resultUrl);
    expect((img.body as Uint8Array).subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
  });

  it("replays recorded errors, custom mode and the colour chain", async () => {
    const r = replay();
    const custom = await r.createTask("hair-transfer", { src_file_id: "x", ref_file_id: "y", hair_color: "src" });
    await r.getTask("hair-transfer", custom.taskId);
    expect(await r.getTask("hair-transfer", custom.taskId)).toMatchObject({ status: "success" });
    const colour = await r.createTask("hair-color", { src_file_url: "z", pattern: { name: "full" }, palettes: [{ color: "#1C1714", color_intensity: 80, shine_intensity: 20 }] });
    await r.getTask("hair-color", colour.taskId);
    expect(await r.getTask("hair-color", colour.taskId)).toMatchObject({ status: "success" });
  });

  it("strict mode refuses unknown requests; loose mode falls back per endpoint", async () => {
    await expect(replay(true).createTask("hair-transfer", { src_file_id: "x", template_id: "unrecorded" })).rejects.toMatchObject({ httpStatus: 400 });
    expect(await replay(false).createTask("hair-transfer", { src_file_id: "x", template_id: "unrecorded" })).toHaveProperty("taskId");
  });

  it("serves account data and templates from fixtures", async () => {
    const r = replay();
    expect(await r.getBalance()).toBe(1000);
    expect((await r.getFeatureCosts())["AI Hair Style Virtual Try-On V2.0 (Preset)"]).toBe(2);
    expect(await r.listTemplates()).toHaveLength(116);
  });
});
