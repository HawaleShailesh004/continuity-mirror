// The only storage interface server code uses. Drivers: memory (dev/tests), Upstash Redis (B2).
// Values are JSON. TTLs are milliseconds. Semantics follow Redis so both drivers behave the same.

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void>;
  /** SET NX PX: true if the key was set (lock acquired). */
  setNX(key: string, value: unknown, ttlMs: number): Promise<boolean>;
  del(...keys: string[]): Promise<number>;
  /** INCRBY; when the key is new and ttlMs is given, the TTL is set. */
  incrBy(key: string, by: number, opts?: { ttlMs?: number }): Promise<number>;
  sAdd(key: string, ...members: string[]): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  sRem(key: string, ...members: string[]): Promise<number>;
  /** Refresh a key's TTL. False if the key doesn't exist. */
  expire(key: string, ttlMs: number): Promise<boolean>;
}
