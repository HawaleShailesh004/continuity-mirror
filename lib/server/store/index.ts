import "server-only";
import type { Env } from "../env";
import { log } from "../log";
import type { KV } from "./kv";
import { MemoryKV } from "./memory";
import { UpstashKV } from "./upstash";

export function createKV(env: Env): KV {
  if (env.KV_DRIVER === "upstash") return UpstashKV.fromEnv(env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!);
  if (env.NODE_ENV === "production") log.warn("kv.memory_in_production", { note: "state is per instance; set KV_DRIVER=upstash" });
  return new MemoryKV();
}
