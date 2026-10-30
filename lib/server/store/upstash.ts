import "server-only";
import { Redis } from "@upstash/redis";
import type { KV } from "./kv";

/** The subset of @upstash/redis we use (lets tests pass a fake). JSON (de)serialisation is the client's. */
export type RedisLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { px?: number; nx?: true }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incrby(key: string, by: number): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  sadd(key: string, member: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;
};

export class UpstashKV implements KV {
  constructor(private redis: RedisLike) {}

  static fromEnv(url: string, token: string) {
    return new UpstashKV(new Redis({ url, token }) as unknown as RedisLike);
  }

  get<T>(key: string) {
    return this.redis.get<T>(key);
  }

  async set(key: string, value: unknown, opts: { ttlMs?: number } = {}) {
    await this.redis.set(key, value, opts.ttlMs ? { px: opts.ttlMs } : undefined);
  }

  async setNX(key: string, value: unknown, ttlMs: number) {
    return (await this.redis.set(key, value, { px: ttlMs, nx: true })) === "OK";
  }

  del(...keys: string[]) {
    return keys.length ? this.redis.del(...keys) : Promise.resolve(0);
  }

  async incrBy(key: string, by: number, opts: { ttlMs?: number } = {}) {
    const value = await this.redis.incrby(key, by);
    // First increment created the key: give it its TTL. (A crash in between leaves a TTL-less counter;
    // keys are windowed/dated, so the worst case is a stale key, never a wrong count.)
    if (opts.ttlMs && value === by) await this.redis.pexpire(key, opts.ttlMs);
    return value;
  }

  sAdd(key: string, ...members: string[]) {
    const [first, ...rest] = members;
    return first === undefined ? Promise.resolve(0) : this.redis.sadd(key, first, ...rest);
  }

  sMembers(key: string) {
    return this.redis.smembers(key);
  }

  sRem(key: string, ...members: string[]) {
    return members.length ? this.redis.srem(key, ...members) : Promise.resolve(0);
  }

  async expire(key: string, ttlMs: number) {
    return (await this.redis.pexpire(key, ttlMs)) === 1;
  }
}
