// Node factory for tests and the B1 route stubs: a MockBackend that reads fixture images from public/.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MockBackend, type MockBackendOptions } from "./backend";

const publicDir = join(process.cwd(), "public");

export function createNodeMockBackend(options: Partial<MockBackendOptions> = {}) {
  return new MockBackend({
    loadImage: async (path) => {
      const buf = await readFile(join(publicDir, path));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    },
    ...options,
  });
}
