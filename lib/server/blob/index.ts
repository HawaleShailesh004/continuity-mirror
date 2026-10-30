import "server-only";
import type { Env } from "../env";
import { log } from "../log";
import { MemoryBlobStore } from "./memory";
import type { BlobStore } from "./store";
import { VercelBlobStore } from "./vercel";

export function createBlobStore(env: Env): BlobStore {
  if (env.BLOB_READ_WRITE_TOKEN) return new VercelBlobStore(env.BLOB_READ_WRITE_TOKEN);
  if (env.NODE_ENV === "production" && env.VERCEL && env.CAP_SHARES) log.warn("blob.memory_in_production", { note: "share images would be lost between instances" });
  return new MemoryBlobStore();
}
