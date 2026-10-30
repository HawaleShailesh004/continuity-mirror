import "server-only";
import { del, get, list, put } from "@vercel/blob";
import type { BlobObject, BlobStore } from "./store";

/** The subset of @vercel/blob we use (lets tests pass a fake). */
export type VercelBlobClient = {
  put(pathname: string, body: Uint8Array, opts: { access: "private"; contentType: string; addRandomSuffix: false; allowOverwrite: false; token: string }): Promise<unknown>;
  get(pathname: string, opts: { access: "private"; token: string }): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null; blob: { contentType: string | null } } | null>;
  del(pathnames: string[], opts: { token: string }): Promise<void>;
  list(opts: { prefix: string; cursor?: string; limit: number; token: string }): Promise<{ blobs: { pathname: string }[]; cursor?: string; hasMore: boolean }>;
};

/**
 * Vercel Blob with `access: 'private'`: nothing is reachable by URL. Only this server (holding the
 * read-write token) can read an image, and it does so only through the share routes.
 */
export class VercelBlobStore implements BlobStore {
  constructor(
    private token: string,
    private client: VercelBlobClient = { put, get, del, list } as unknown as VercelBlobClient,
  ) {}

  async put(pathname: string, bytes: Uint8Array, contentType: string) {
    // The SDK's accepted bodies include Buffer but not a bare Uint8Array.
    await this.client.put(pathname, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false, token: this.token });
  }

  async get(pathname: string): Promise<BlobObject | null> {
    const res = await this.client.get(pathname, { access: "private", token: this.token }).catch((err: unknown) => {
      if (err instanceof Error && /not.?found/i.test(`${err.name} ${err.message}`)) return null;
      throw err;
    });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { body: res.stream, contentType: res.blob.contentType ?? "image/jpeg" };
  }

  async del(pathnames: string[]) {
    if (pathnames.length) await this.client.del(pathnames, { token: this.token });
  }

  async list(prefix: string) {
    const out: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await this.client.list({ prefix, cursor, limit: 1000, token: this.token });
      out.push(...res.blobs.map((b) => b.pathname));
      if (!res.hasMore) break;
      cursor = res.cursor;
    }
    return out;
  }
}
