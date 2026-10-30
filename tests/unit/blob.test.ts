import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { VercelBlobStore, type VercelBlobClient } from "@/lib/server/blob/vercel";

describe("MemoryBlobStore", () => {
  it("stores copies, lists by prefix, deletes, and refuses silent overwrite", async () => {
    const store = new MemoryBlobStore();
    const bytes = new Uint8Array([1, 2, 3]);
    await store.put("shares/a/1.jpg", bytes, "image/jpeg");
    await store.put("shares/a/2.jpg", bytes, "image/jpeg");
    await store.put("shares/b/1.jpg", bytes, "image/jpeg");
    bytes[0] = 9;
    expect([...((await store.get("shares/a/1.jpg"))!.body as Uint8Array)]).toEqual([1, 2, 3]);
    expect(await store.list("shares/a/")).toEqual(["shares/a/1.jpg", "shares/a/2.jpg"]);
    await expect(store.put("shares/a/1.jpg", bytes, "image/jpeg")).rejects.toThrow(/exists/);
    await store.del(["shares/a/1.jpg", "never-existed"]);
    expect(await store.get("shares/a/1.jpg")).toBeNull();
    expect(await store.list("shares/")).toHaveLength(2);
  });
});

describe("VercelBlobStore", () => {
  function fakeClient(overrides: Partial<VercelBlobClient> = {}) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const client: VercelBlobClient = {
      async put(...args) {
        calls.push({ fn: "put", args });
        return {};
      },
      async get(...args) {
        calls.push({ fn: "get", args });
        return { statusCode: 200, stream: new Blob([new Uint8Array([7])]).stream(), blob: { contentType: "image/jpeg" } };
      },
      async del(...args) {
        calls.push({ fn: "del", args });
      },
      async list(...args) {
        calls.push({ fn: "list", args });
        return { blobs: [{ pathname: "shares/a/1.jpg" }], hasMore: false };
      },
      ...overrides,
    };
    return { client, calls };
  }

  it("writes private, never overwrites, and carries the token on every call", async () => {
    const { client, calls } = fakeClient();
    const store = new VercelBlobStore("tok-secret", client);
    await store.put("shares/a/1.jpg", new Uint8Array([1]), "image/jpeg");
    await store.get("shares/a/1.jpg");
    await store.del(["shares/a/1.jpg"]);
    await store.list("shares/");
    expect(Buffer.isBuffer(calls[0]!.args[1])).toBe(true);
    expect(calls[0]).toMatchObject({ fn: "put", args: ["shares/a/1.jpg", expect.any(Uint8Array), { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: false, token: "tok-secret" }] });
    expect(calls[1]).toMatchObject({ fn: "get", args: ["shares/a/1.jpg", { access: "private", token: "tok-secret" }] });
    expect(calls[2]).toMatchObject({ fn: "del", args: [["shares/a/1.jpg"], { token: "tok-secret" }] });
    expect(calls[3]).toMatchObject({ fn: "list", args: [{ prefix: "shares/", token: "tok-secret" }] });
  });

  it("reads a stream and its content type; a missing blob is null, other errors propagate", async () => {
    const found = await new VercelBlobStore("t", fakeClient().client).get("x");
    expect(found?.contentType).toBe("image/jpeg");
    expect(found!.body).toBeInstanceOf(ReadableStream);

    const missing = fakeClient({ async get() { throw Object.assign(new Error("The requested blob does not exist"), { name: "BlobNotFoundError" }); } });
    expect(await new VercelBlobStore("t", missing.client).get("x")).toBeNull();
    const notModified = fakeClient({ async get() { return { statusCode: 304, stream: null, blob: { contentType: null } }; } });
    expect(await new VercelBlobStore("t", notModified.client).get("x")).toBeNull();
    const broken = fakeClient({ async get() { throw new Error("store suspended"); } });
    await expect(new VercelBlobStore("t", broken.client).get("x")).rejects.toThrow(/suspended/);
  });

  it("lists every page, and doesn't call delete for nothing", async () => {
    const pages = [
      { blobs: [{ pathname: "a" }, { pathname: "b" }], cursor: "c1", hasMore: true },
      { blobs: [{ pathname: "c" }], hasMore: false },
    ];
    const cursors: (string | undefined)[] = [];
    const { client, calls } = fakeClient({
      async list(opts) {
        cursors.push(opts.cursor);
        return pages.shift()!;
      },
    });
    const store = new VercelBlobStore("t", client);
    expect(await store.list("shares/")).toEqual(["a", "b", "c"]);
    expect(cursors).toEqual([undefined, "c1"]);
    await store.del([]);
    expect(calls.some((c) => c.fn === "del")).toBe(false);
  });
});
