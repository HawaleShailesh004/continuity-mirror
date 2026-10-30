"use client";

import { TextShimmer } from "@/components/motion/text-shimmer";
import { Button } from "@/components/ui/button";
import { copy } from "@/content/copy";
import type { Job } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type StepLite = Pick<Job["steps"][number], "kind" | "status">;

/** Words for what's happening now, from the real step states (never a fake percentage). */
export function progressText(status: Job["status"], steps: readonly StepLite[]): string {
  if (status === "succeeded") return copy.progress.done;
  const running = steps.find((s) => s.status === "running");
  if (running) return copy.progress[running.kind];
  const nextPending = steps.find((s) => s.status === "pending");
  if (status === "running" && nextPending) return copy.progress[nextPending.kind];
  return copy.progress.queued;
}

/*
 * Honest progress: the step that is running, "Step 2 of 3", and after 45 s a
 * calm "taking longer" message with a choice. The shimmer moves, but nothing
 * pretends to know how far along it is. A polite live region announces steps.
 */
export function JobProgress({
  status,
  steps,
  slow = false,
  onKeepWaiting,
  onLater,
  className,
}: {
  status: Job["status"];
  steps: readonly StepLite[];
  /** True after ~45 s without a result. */
  slow?: boolean;
  onKeepWaiting?: () => void;
  onLater?: () => void;
  className?: string;
}) {
  const text = progressText(status, steps);
  const doneCount = steps.filter((s) => s.status === "succeeded").length;
  const current = Math.min(doneCount + 1, steps.length);

  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-3xl bg-surface-raised px-4 py-3 text-center", className)}>
      <p role="status" className="sr-only">
        {text}
      </p>
      <TextShimmer as="span" className="text-sm font-semibold">
        {text}
      </TextShimmer>
      {steps.length > 1 && (
        <p aria-hidden="true" className="text-xs text-text-muted">
          {copy.progress.stepOf(current, steps.length)}
        </p>
      )}
      {slow && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs text-text-soft">{copy.progress.slow}</p>
          <div className="flex gap-1">
            {onKeepWaiting && (
              <Button variant="quiet" className="h-11 px-3 text-sm" onClick={onKeepWaiting}>
                {copy.progress.slowAction}
              </Button>
            )}
            {onLater && (
              <Button variant="quiet" className="h-11 px-3 text-sm" onClick={onLater}>
                {copy.progress.slowLater}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
