"use client";
/*
 * TransitionPanel: crossfade between panels (tips in the camera guide,
 * sheet steps). Shows one child at a time.
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: `m` components; token variants by default; reduced motion →
 * opacity only; mode="wait" so only one tip is ever visible (plan §4.1).
 */
import type { ReactNode } from "react";
import { AnimatePresence, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import { rest, transition } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

const defaultVariants: Variants = {
  enter: { opacity: 0, y: 8, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)", transition: transition.base },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: transition.quick },
};

const calmVariants: Variants = {
  enter: { opacity: 0 },
  center: { ...rest, opacity: 1, transition: transition.reduced },
  exit: { opacity: 0, transition: transition.reduced },
};

export type TransitionPanelProps = {
  children: ReactNode[];
  activeIndex: number;
  className?: string;
  /** Needs `enter`, `center` and `exit` keys. */
  variants?: Variants;
};

export function TransitionPanel({
  children,
  activeIndex,
  className,
  variants,
}: TransitionPanelProps) {
  const calm = useCalmMotion();
  return (
    <div className={cn("relative", className)}>
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={activeIndex}
          variants={calm ? calmVariants : (variants ?? defaultVariants)}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {children[activeIndex]}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
