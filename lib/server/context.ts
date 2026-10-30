import "server-only";
import { createBlobStore } from "./blob";
import type { BlobStore } from "./blob/store";
import { env as readEnv, type Env } from "./env";
import { createKV } from "./store";
import type { KV } from "./store/kv";
import { createAdapter } from "./youcam";
import type { YouCamAdapter } from "./youcam/adapter";

export type ServerContext = { env: Env; kv: KV; blob: BlobStore; youcam: YouCamAdapter; now: () => number };

// Singletons survive module re-evaluation in dev (route bundles share one process).
const g = globalThis as unknown as { cmServerContext?: ServerContext; cmServerContextOverride?: ServerContext };

export function serverContext(): ServerContext {
  if (g.cmServerContextOverride) return g.cmServerContextOverride;
  if (!g.cmServerContext) {
    const env = readEnv();
    const kv = createKV(env);
    g.cmServerContext = { env, kv, blob: createBlobStore(env), youcam: createAdapter(env), now: () => Date.now() };
  }
  return g.cmServerContext;
}

/** Tests inject memory KV, a mock adapter and a fake clock. Pass undefined to clear. */
export function setServerContext(ctx: ServerContext | undefined) {
  g.cmServerContextOverride = ctx;
}
