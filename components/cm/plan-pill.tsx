"use client";

import Link from "next/link";
import * as m from "motion/react-m";
import { HeartIcon } from "lucide-react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { copy } from "@/content/copy";
import { spring } from "@/lib/client/motion";

/*
 * The floating "My plan · 2" pill that appears after the first save and stays
 * one tap away. The count pops once when it changes (the add-to-cart pattern,
 * for a calm commerce feel). Hidden at zero.
 */
export function PlanPill({ count }: { count: number }) {
  const calm = useCalmMotion();
  if (count <= 0) return null;

  return (
    <Link
      href="/plan"
      transitionTypes={["nav-forward"]}
      aria-label={copy.nav.planPillLabel(count)}
      className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-30 flex h-12 items-center gap-2 rounded-full bg-surface-raised px-5 text-sm font-semibold shadow-raised"
    >
      <HeartIcon aria-hidden="true" className="size-4 text-action" />
      <m.span
        key={count}
        initial={calm ? { opacity: 0 } : { scale: 0.85, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={calm ? { duration: 0.15 } : spring.ui}
      >
        {copy.nav.planPill(count)}
      </m.span>
    </Link>
  );
}
