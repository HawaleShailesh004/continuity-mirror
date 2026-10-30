"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";
import { transition } from "@/lib/client/motion";

/**
 * "user" follows the OS setting; "always"/"never" come from the in-app
 * setting (frontend plan §8). Mirror the same choice on <html data-motion>
 * so CSS durations in app/theme.css agree.
 */
export type ReducedMotionSetting = "user" | "always" | "never";

const ReducedMotionContext = createContext<ReducedMotionSetting>("user");

const loadFeatures = () =>
  import("@/lib/client/motion-features").then((mod) => mod.default);

export function MotionProvider({
  children,
  reducedMotion = "user",
}: {
  children: ReactNode;
  reducedMotion?: ReducedMotionSetting;
}) {
  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      {/* strict: any `motion.*` import inside the app throws; use `m.*`. */}
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig reducedMotion={reducedMotion} transition={transition.base}>
          {children}
        </MotionConfig>
      </LazyMotion>
    </ReducedMotionContext.Provider>
  );
}

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True when animations should collapse to a 150 ms opacity fade.
 * MotionConfig alone only strips transform/layout animation; blur filters and
 * ambient loops need this to switch to the `calm` presets.
 *
 * Not motion's useReducedMotion: that reads matchMedia during the first client
 * render and mismatches the server HTML. The server snapshot is `false`, so
 * hydration matches and calm users switch right after. Calm `visible`
 * variants therefore reset filter/transform explicitly (lib/client/motion.ts).
 */
export function useCalmMotion(): boolean {
  const setting = useContext(ReducedMotionContext);
  const prefersReduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  if (setting === "always") return true;
  if (setting === "never") return false;
  return prefersReduced;
}
