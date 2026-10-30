import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/server/env";
import { MemoryKV } from "@/lib/server/store/memory";
import { CreditResponse, FeatureCostResponse, FileInitResponse, TaskCreateResponse, TaskPollResponse, TemplatesResponse } from "@/lib/server/youcam/schemas";

describe("env", () => {
  it("defaults to mock mode with memory KV and B0 capability flags", () => {
    const env = parseEnv({});
    expect(env).toMatchObject({ YOUCAM_MODE: "mock", KV_DRIVER: "memory", SESSION_UNIT_CAP: 24, UNIT_FLOOR: 150, CAP_HEADWEAR: false, CAP_SCARF: false, CAP_BROWS: true });
  });

  it("requires the key in live mode and names variables, not values", () => {
    expect(() => parseEnv({ YOUCAM_MODE: "live" })).toThrow(/YOUCAM_API_KEY: required/);
    try {
      parseEnv({ YOUCAM_MODE: "live", YOUCAM_API_BASE: "not a url secret-value" });
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });

  it("treats empty values (KEY= from .env.example) as unset", () => {
    expect(parseEnv({ ADMIN_TOKEN: "", YOUCAM_API_KEY: " ", UNIT_FLOOR: "" })).toMatchObject({ UNIT_FLOOR: 150 });
    expect(parseEnv({ ADMIN_TOKEN: "" }).ADMIN_TOKEN).toBeUndefined();
  });

  it("requires session secrets on Vercel production, not on a local `next start`", () => {
    expect(() => parseEnv({ NODE_ENV: "production", VERCEL: "1" })).toThrow(/SESSION_SECRET/);
    expect(parseEnv({ NODE_ENV: "production" }).SESSION_SECRET).toBeUndefined();
  });
});

describe("webhook payload shape logging", () => {
  it("records field names two levels deep and never any values", async () => {
    const { payloadShape } = await import("@/lib/server/jobs/webhook");
    const shape = payloadShape({ event: "task.succeeded", data: { task_id: "secret-task-id", url: "https://signed", nested: { deep: 1 } }, id: 7 });
    expect(shape).toEqual({ "": ["event", "data", "id"], data: ["task_id", "url", "nested"] });
    expect(JSON.stringify(shape)).not.toMatch(/secret-task-id|signed|task.succeeded/);
    expect(payloadShape(null)).toEqual({ "": [] });
    expect(payloadShape("text")).toEqual({ "": [] });
  });
});

describe("MemoryKV", () => {
  it("expires values, supports NX locks, counters and sets", async () => {
    let now = 0;
    const kv = new MemoryKV(() => now);
    await kv.set("a", { x: 1 }, { ttlMs: 1000 });
    expect(await kv.get("a")).toEqual({ x: 1 });
    now = 1000;
    expect(await kv.get("a")).toBeNull();

    expect(await kv.setNX("lock", 1, 5000)).toBe(true);
    expect(await kv.setNX("lock", 1, 5000)).toBe(false);
    now = 6000;
    expect(await kv.setNX("lock", 1, 5000)).toBe(true);

    expect(await kv.incrBy("units", 3, { ttlMs: 100 })).toBe(3);
    expect(await kv.incrBy("units", 2, { ttlMs: 999_999 })).toBe(5); // TTL only set on create
    now += 100;
    expect(await kv.get("units")).toBeNull();

    expect(await kv.sAdd("s", "a", "b", "a")).toBe(2);
    expect((await kv.sMembers("s")).sort()).toEqual(["a", "b"]);
    expect(await kv.sRem("s", "a")).toBe(1);
    expect(await kv.del("s", "missing")).toBe(1);
  });

  it("returns copies, not live references", async () => {
    const kv = new MemoryKV();
    const value = { n: 1 };
    await kv.set("k", value);
    value.n = 2;
    expect(await kv.get("k")).toEqual({ n: 1 });
  });
});

describe("YouCam fixtures match the response schemas", () => {
  const dir = join(process.cwd(), "tests/fixtures/youcam");
  const load = (group: string, name: string) => JSON.parse(readFileSync(join(dir, group, `${name}.json`), "utf8")).data;

  it("account and templates", () => {
    CreditResponse.parse(load("account", "credit").body);
    FeatureCostResponse.parse(load("account", "feature-cost").body);
    for (let i = 0; i < 6; i++) TemplatesResponse.parse(load("templates", `page-${i}`).body);
  });

  it.each(["hair-transfer", "hair-color", "makeup-vto"])("%s task logs", (group) => {
    for (const file of readdirSync(join(dir, group))) {
      const exchanges = load(group, file.replace(/\.json$/, "")) as { step: string; body?: unknown }[];
      for (const ex of exchanges) {
        if (ex.step === "file-init") FileInitResponse.parse(ex.body);
        if (ex.step === "task-create") TaskCreateResponse.parse(ex.body);
        if (ex.step === "task-final") TaskPollResponse.parse(ex.body);
      }
    }
  });

  it("a YouCam error is a 200 with task_status error", () => {
    const final = (load("hair-transfer", "bad-no-face") as { step: string; body: unknown }[]).find((e) => e.step === "task-final")!;
    expect(TaskPollResponse.parse(final.body).data).toMatchObject({ task_status: "error", error: "error_no_face", results: null });
  });
});
