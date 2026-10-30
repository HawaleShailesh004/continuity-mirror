import type { Transition, Variants } from "motion/react";

/*
 * Motion tokens (frontend-implementation-plan.md §3.4).
 * The CSS side (--dur-*, --ease-*) lives in app/theme.css; keep the two in step.
 *
 * Rules: animate only transform, opacity and filter; at most one ambient loop
 * per screen; no bounce, shake or celebration; never gate input > 200 ms.
 * With reduced motion every animation becomes a 150 ms opacity fade.
 */

type Bezier = [number, number, number, number];

/** Durations in seconds (motion's unit). */
export const dur = {
  quick: 0.18, // press, hover, toggles
  base: 0.32, // enter/exit of elements, sheets
  gentle: 0.48, // screen transitions, card morphs
  reveal: 0.9, // a result developing into view
  ambient: 5, // breathing guide, glow (4–6 s)
  reduced: 0.15, // everything, when reduced motion is on
} as const;

export const ease = {
  out: [0.16, 1, 0.3, 1] as Bezier, // expo-out: all entrances
  inOut: [0.65, 0, 0.35, 1] as Bezier, // ambient loops
} as const;

export const spring = {
  /** Sliders, segmented controls, drag. No visible bounce. */
  ui: { type: "spring", stiffness: 320, damping: 32 },
  /** Shared-element morphs (layoutId). */
  layout: { type: "spring", stiffness: 200, damping: 28 },
} as const satisfies Record<string, Transition>;

export const transition = {
  quick: { duration: dur.quick, ease: ease.out },
  base: { duration: dur.base, ease: ease.out },
  gentle: { duration: dur.gentle, ease: ease.out },
  reveal: { duration: dur.reveal, ease: ease.out },
  reduced: { duration: dur.reduced, ease: "linear" },
} as const satisfies Record<string, Transition>;

/** Stagger between siblings arriving together (e.g. landing buttons). */
export const stagger = 0.06;

/** Button press scale. */
export const pressScale = 0.98;

/**
 * Neutral pose. Calm `visible` states spread it so an element the server
 * painted in a full `hidden` pose (blurred, offset) still comes to rest.
 */
export const rest = { x: 0, y: 0, scale: 1, filter: "blur(0px)" } as const;

/* ── Presets ──────────────────────────────────────────────────
 * Each preset has a full and a calm (reduced-motion) form. Pick with
 * `useCalmMotion()` from components/motion/motion-provider.
 */

/** Element entrance: 12 px rise + fade. */
export const fadeRise = {
  full: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: transition.base },
    exit: { opacity: 0, y: -8, transition: transition.quick },
  },
  calm: {
    hidden: { opacity: 0 },
    visible: { ...rest, opacity: 1, transition: transition.reduced },
    exit: { opacity: 0, transition: transition.reduced },
  },
} as const satisfies Record<"full" | "calm", Variants>;

/** Signature moment 5: a result "developing" out of the blurred baseline. */
export const develop = {
  full: {
    hidden: { opacity: 0, filter: "blur(16px)", scale: 1.03 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      scale: 1,
      transition: transition.reveal,
    },
  },
  calm: {
    hidden: { opacity: 0 },
    visible: { ...rest, opacity: 1, transition: transition.reduced },
  },
} as const satisfies Record<"full" | "calm", Variants>;

/** Headline lines arriving blur-to-sharp (signature moment 1). */
export const blurIn = {
  full: {
    hidden: { opacity: 0, filter: "blur(8px)", y: 6 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: transition.gentle,
    },
  },
  calm: {
    hidden: { opacity: 0 },
    visible: { ...rest, opacity: 1, transition: transition.reduced },
  },
} as const satisfies Record<"full" | "calm", Variants>;

/** Calm departure for deletions (signature moment 10). */
export const dissolve = {
  full: {
    visible: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(6px)", transition: transition.base },
  },
  calm: {
    visible: { ...rest, opacity: 1 },
    exit: { opacity: 0, transition: transition.reduced },
  },
} as const satisfies Record<"full" | "calm", Variants>;
