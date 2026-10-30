"use client";

/*
 * Journey store (frontend plan §5.2): where the user is and what they chose,
 * persisted to IndexedDB on every change so a reload resumes. Heavy data
 * (photos, jobs, results) lives in Dexie tables, not here.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { db } from "./db";
import type { PlannedRoute } from "@/lib/planner";

export type Mood = "exploring" | "anxious" | "ready";

/** Which styles to draw from. A preference the user sets; never inferred from the photo. */
export type Audience = "all" | "female" | "male";

type Journey = {
  /** False until the persisted state has loaded from IndexedDB. Guards wait for it. */
  hydrated: boolean;
  mood: Mood | null;
  helperMode: boolean;
  isSample: boolean;
  personaId: string | undefined;
  audience: Audience;
  baselineId: string | undefined;
  /** The three planned paths for the current baseline and snapshot. */
  routes: PlannedRoute[];
  set: (patch: Partial<Omit<Journey, "set" | "reset" | "hydrated">>) => void;
  /** Back to a blank journey (after "delete everything"). */
  reset: () => void;
};

const blank = {
  mood: null,
  helperMode: false,
  isSample: false,
  personaId: undefined,
  audience: "all" as Audience,
  baselineId: undefined,
  routes: [] as PlannedRoute[],
};

// Dexie as zustand's async storage. Failures degrade to an in-memory journey.
const dexieStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const row = await db.settings.get(name);
      return (row?.value as string | undefined) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await db.settings.put({ key: name, value });
    } catch {
      /* private mode or quota: the journey still works for this page load */
    }
  },
  removeItem: async (name) => {
    try {
      await db.settings.delete(name);
    } catch {
      /* nothing to remove */
    }
  },
};

export const useJourney = create<Journey>()(
  persist(
    (set) => ({
      ...blank,
      hydrated: false,
      set: (patch) => set(patch),
      reset: () => set({ ...blank }),
    }),
    {
      name: "journey",
      storage: createJSONStorage(() => dexieStorage),
      partialize: ({ mood, helperMode, isSample, personaId, audience, baselineId, routes }) => ({
        mood,
        audience,
        helperMode,
        isSample,
        personaId,
        baselineId,
        routes,
      }),
      onRehydrateStorage: () => () => useJourney.setState({ hydrated: true }),
    },
  ),
);
