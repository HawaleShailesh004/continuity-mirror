"use client";

import * as m from "motion/react-m";
import { CircleIcon } from "lucide-react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { capture } from "@/content/copy/capture";
import type { CheckResult } from "@/lib/client/capture/checks";
import { transition } from "@/lib/client/motion";
import { cn } from "@/lib/utils";

/** A check mark that draws itself in (signature moment 2). Static for reduced motion. */
function DrawnCheck({ calm }: { calm: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-action" fill="none" aria-hidden="true">
      <m.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={calm ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={calm ? { duration: 0 } : transition.base}
      />
    </svg>
  );
}

/*
 * What the camera is checking, each ticking off as it passes. Words and state
 * are both exposed to screen readers ("Facing the camera, done"); the tip bar
 * is the live announcement, this is the overview.
 */
export function CheckList({ results, className }: { results: readonly CheckResult[]; className?: string }) {
  const calm = useCalmMotion();
  return (
    <ul aria-label={capture.checksTitle} className={cn("grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2", className)}>
      {results.map((result) => (
        <li key={result.id} className="flex min-h-9 items-center gap-2.5 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center">
            {result.ok ? <DrawnCheck calm={calm} /> : <CircleIcon aria-hidden="true" className="size-4 text-text-muted" />}
          </span>
          <span className={result.ok ? "text-text" : "text-text-soft"}>{capture.checks[result.id]}</span>
          <span className="sr-only">{result.ok ? capture.checkDone : capture.checkTodo}</span>
        </li>
      ))}
    </ul>
  );
}
