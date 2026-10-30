"use client";

import { useEffect } from "react";
import * as m from "motion/react-m";
import { HeartIcon } from "lucide-react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { ease } from "@/lib/client/motion";

export const PLAN_PILL_ID = "plan-pill";

/*
 * Moment 5: when a look is saved, a small heart arcs from the Save button to the
 * "My plan" pill, which then counts up. A pill that is not on screen yet (the very
 * first save) is aimed at where it will appear. With reduced motion there is no
 * flight at all: the pill's count simply changes.
 */
export function HeartFlight({ from, onDone }: { from: { x: number; y: number }; onDone: () => void }) {
  const calm = useCalmMotion();
  const rect = document.getElementById(PLAN_PILL_ID)?.getBoundingClientRect();
  const to = rect
    ? { x: rect.left + 26, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth - 20 - 36, y: window.innerHeight - 96 - 24 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  useEffect(() => {
    if (calm) onDone();
  }, [calm, onDone]);
  if (calm) return null;

  return (
    <m.span
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 text-action"
      initial={{ opacity: 0, scale: 0.6, x: from.x - 12, y: from.y - 12 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.6, 1.15, 1, 0.7],
        x: [from.x - 12, from.x - 12 + dx * 0.55, from.x - 12 + dx],
        y: [from.y - 12, from.y - 12 + dy * 0.2 - 90, from.y - 12 + dy],
      }}
      transition={{
        opacity: { duration: 0.8, times: [0, 0.15, 0.8, 1] },
        scale: { duration: 0.8, times: [0, 0.2, 0.8, 1] },
        x: { duration: 0.8, times: [0, 0.55, 1], ease: ease.out },
        y: { duration: 0.8, times: [0, 0.4, 1], ease: ease.inOut },
      }}
      onAnimationComplete={onDone}
    >
      <HeartIcon className="size-6 fill-current" />
    </m.span>
  );
}
