// Where share images live. Same idea as the KV: one small interface, a memory driver for dev and tests,
// and Vercel Blob (private) in production. Keys are pathnames like `shares/<token>/<random>.jpg`.

export type BlobObject = { body: ReadableStream<Uint8Array> | Uint8Array; contentType: string };

export interface BlobStore {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** null when the object doesn't exist (deleted, never written). */
  get(pathname: string): Promise<BlobObject | null>;
  del(pathnames: string[]): Promise<void>;
  /** Every pathname starting with `prefix` (all pages). */
  list(prefix: string): Promise<string[]>;
}
