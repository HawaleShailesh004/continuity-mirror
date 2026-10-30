import type { BlobObject, BlobStore } from "./store";

/** In-process store for development and tests. Not shared across serverless instances. */
export class MemoryBlobStore implements BlobStore {
  private objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(pathname: string, bytes: Uint8Array, contentType: string) {
    if (this.objects.has(pathname)) throw new Error(`blob exists: ${pathname}`); // like Vercel's default: no silent overwrite
    this.objects.set(pathname, { bytes: new Uint8Array(bytes), contentType });
  }

  async get(pathname: string): Promise<BlobObject | null> {
    const o = this.objects.get(pathname);
    return o ? { body: new Uint8Array(o.bytes), contentType: o.contentType } : null;
  }

  async del(pathnames: string[]) {
    for (const p of pathnames) this.objects.delete(p);
  }

  async list(prefix: string) {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  /** Test helper. */
  get size() {
    return this.objects.size;
  }
}
