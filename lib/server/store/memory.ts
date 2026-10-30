import type { KV } from "./kv";

type Entry = { value: unknown; expiresAt: number | null };

/** In-process KV for development and tests. Not shared across serverless instances. */
export class MemoryKV implements KV {
  private data = new Map<string, Entry>();

  constructor(private now: () => number = () => Date.now()) {}

  private live(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private expiry(ttlMs?: number) {
    return ttlMs === undefined ? null : this.now() + ttlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    if (!entry) return null;
    if (entry.value instanceof Set) throw new Error(`WRONGTYPE ${key} is a set`);
    return structuredClone(entry.value) as T;
  }

  async set(key: string, value: unknown, opts: { ttlMs?: number } = {}) {
    this.data.set(key, { value: structuredClone(value), expiresAt: this.expiry(opts.ttlMs) });
  }

  async setNX(key: string, value: unknown, ttlMs: number) {
    if (this.live(key)) return false;
    await this.set(key, value, { ttlMs });
    return true;
  }

  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.live(k) && this.data.delete(k)) n++;
    return n;
  }

  async incrBy(key: string, by: number, opts: { ttlMs?: number } = {}) {
    const entry = this.live(key);
    if (entry && typeof entry.value !== "number") throw new Error(`WRONGTYPE ${key} is not a number`);
    const value = ((entry?.value as number | undefined) ?? 0) + by;
    this.data.set(key, { value, expiresAt: entry ? entry.expiresAt : this.expiry(opts.ttlMs) });
    return value;
  }

  private set_(key: string): Set<string> {
    const entry = this.live(key);
    if (entry && !(entry.value instanceof Set)) throw new Error(`WRONGTYPE ${key} is not a set`);
    if (entry) return entry.value as Set<string>;
    const s = new Set<string>();
    this.data.set(key, { value: s, expiresAt: null });
    return s;
  }

  async sAdd(key: string, ...members: string[]) {
    const s = this.set_(key);
    const before = s.size;
    members.forEach((m) => s.add(m));
    return s.size - before;
  }

  async sMembers(key: string) {
    const entry = this.live(key);
    return entry ? [...(entry.value as Set<string>)] : [];
  }

  async sRem(key: string, ...members: string[]) {
    const entry = this.live(key);
    if (!entry) return 0;
    const s = entry.value as Set<string>;
    const n = members.filter((m) => s.delete(m)).length;
    if (s.size === 0) this.data.delete(key);
    return n;
  }

  async expire(key: string, ttlMs: number) {
    const entry = this.live(key);
    if (!entry) return false;
    entry.expiresAt = this.now() + ttlMs;
    return true;
  }
}
