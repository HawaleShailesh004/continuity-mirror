/*
 * What the landing page needs to know, read with no data layer at all: a plain
 * fetch and a raw IndexedDB read. The landing page's first load stays under
 * its bundle budget (no Dexie, Query, Zustand or Zod), and its buttons are one
 * stable piece of DOM that simply updates, so a tap is never lost to a swap.
 */
import { whenMocksReady } from "./mocks";

export type LandingState = {
  /** Live generation is off (units low, kill switch): lead with the sample person. */
  liveOff: boolean;
  /** Where "continue where you left off" goes, or null for a first visit. */
  resume: "/paths" | "/start/snapshot" | null;
};

async function readLiveOff(): Promise<boolean> {
  try {
    await whenMocksReady();
    const res = await fetch("/api/status", { credentials: "same-origin" });
    if (!res.ok) return false;
    return ((await res.json()) as { live?: unknown }).live === false;
  } catch {
    return false; // offline or erroring: show the normal buttons, never block the way in
  }
}

/**
 * Reads the persisted journey (zustand's "journey" row in the `settings` table
 * of the Dexie database) without opening it through Dexie. Never creates the
 * database: opening a missing one here would leave an empty v1 behind that
 * Dexie would then refuse to build its tables in.
 */
async function readResume(): Promise<LandingState["resume"]> {
  try {
    if (!indexedDB.databases) return null;
    const known = await indexedDB.databases();
    if (!known.some((d) => d.name === "continuity-mirror")) return null;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("continuity-mirror");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains("settings")) return null;
      const row = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
        const request = db.transaction("settings").objectStore("settings").get("journey");
        request.onsuccess = () => resolve(request.result as { value?: unknown } | undefined);
        request.onerror = () => reject(request.error);
      });
      if (typeof row?.value !== "string") return null;
      const state = (JSON.parse(row.value) as { state?: { baselineId?: unknown; routes?: unknown } }).state;
      if (!state?.baselineId) return null;
      return Array.isArray(state.routes) && state.routes.length > 0 ? "/paths" : "/start/snapshot";
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function readLandingState(): Promise<LandingState> {
  const [liveOff, resume] = await Promise.all([readLiveOff(), readResume()]);
  return { liveOff, resume };
}
