import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "@/lib/client/data-url";

describe("dataUrlToBlob", () => {
  it("decodes a base64 JPEG data URL to the same bytes and type", async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250, 251, 252]);
    const url = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
    const blob = dataUrlToBlob(url);
    expect(blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("handles plain (non-base64) data URLs", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20world");
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hello world");
  });

  it("rejects things that aren't data URLs", () => {
    expect(() => dataUrlToBlob("https://example.com/a.jpg")).toThrow();
    expect(() => dataUrlToBlob("data:image/jpeg")).toThrow();
  });
});
