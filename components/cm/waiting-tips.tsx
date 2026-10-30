"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { copy } from "@/content/copy";
import { fadeRise } from "@/lib/client/motion";

/*
 * One calm sentence at a time while previews are made, swapped every 8 s with a
 * soft rise and fade (a plain cross-fade with reduced motion). No countdown and
 * no percentage: it keeps company, it doesn't pretend to measure.
 */
export function WaitingTips({ intervalMs = 8000 }: { intervalMs?: number }) {
  const calm = useCalmMotion();
  const [i, setI] = useState(0);
  const tips = copy.paths.tips;

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % tips.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, tips.length]);

  const v = calm ? fadeRise.calm : fadeRise.full;
  return (
    <div className="flex min-h-16 flex-col gap-1 rounded-card bg-surface/80 px-5 py-4">
      <p className="text-xs font-semibold text-text-muted">{copy.paths.tipsTitle}</p>
      <AnimatePresence mode="wait" initial={false}>
        <m.p key={i} variants={v} initial="hidden" animate="visible" exit="exit" className="text-sm text-text-soft">
          {tips[i]}
        </m.p>
      </AnimatePresence>
    </div>
  );
}
