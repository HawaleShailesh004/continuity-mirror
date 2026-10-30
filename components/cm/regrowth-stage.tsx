"use client";

import { useId } from "react";
import * as m from "motion/react-m";
import { CheckIcon, PlusIcon } from "lucide-react";
import { InView } from "@/components/motion/in-view";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { Button } from "@/components/ui/button";
import { JobProgress } from "./job-progress";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import { develop } from "@/lib/client/motion";
import { messageFor } from "@/lib/client/messages";
import type { Job } from "@/lib/contracts";

/*
 * One stage of the regrowth roadmap: "You, before" beside the stage, so the
 * baseline is never out of sight. While it is being made the stage shows the
 * baseline blurred under honest progress; on success it develops into view
 * (signature moment 5), and the stage fades in as it scrolls into view
 * (moment 8). Every stage carries "a possibility, not a prediction".
 */
export function RegrowthStage({
  when,
  styleName,
  beforeSrc,
  resultSrc,
  resultAlt,
  status,
  steps,
  error,
  slow,
  note,
  saved,
  onToggleSaved,
  onRetry,
}: {
  when: string;
  styleName: string;
  beforeSrc: string;
  resultSrc?: string;
  resultAlt: string;
  status: Job["status"];
  steps: Job["steps"];
  error?: Job["error"];
  slow?: boolean;
  /** Something to say about this image (a sample result that reuses an identical earlier one). */
  note?: string;
  saved: boolean;
  onToggleSaved: () => void;
  onRetry?: () => void;
}) {
  const calm = useCalmMotion();
  const headingId = useId();
  const ready = status === "succeeded" && resultSrc;
  const failed = status === "failed";
  const t = copy.regrowth;

  return (
    <InView as="li" className="relative flex flex-col gap-3 pl-8">
      {/* The dot sits on the timeline line drawn by the parent. */}
      <span aria-hidden="true" className="absolute top-1.5 left-0 size-4 rounded-full border-4 border-bg bg-action ring-2 ring-action/30" />
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="text-base">
          {when}
        </h3>
        <p className="text-sm text-text-soft">{t.stageStyle(styleName)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <figure className="flex flex-col gap-1.5">
          <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeSrc} alt={copy.compare.altBefore} className="absolute inset-0 size-full object-cover object-[50%_20%]" />
          </div>
          <figcaption className="text-xs font-semibold text-text-muted">{t.before}</figcaption>
        </figure>

        <div className="flex flex-col gap-1.5">
          <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach">
            {ready ? (
              <m.img
                src={resultSrc}
                alt={resultAlt}
                data-generated-image=""
                className="absolute inset-0 size-full object-cover object-[50%_20%]"
                variants={calm ? develop.calm : develop.full}
                initial="hidden"
                animate="visible"
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={beforeSrc}
                  alt=""
                  aria-hidden="true"
                  className={failed ? "absolute inset-0 size-full scale-105 object-cover object-[50%_20%] opacity-40 blur-md" : "absolute inset-0 size-full scale-105 object-cover object-[50%_20%] blur-xl"}
                />
                <div className="absolute inset-x-2 bottom-2">
                  {failed ? (
                    <div role="alert" className="flex flex-col items-center gap-2 rounded-3xl bg-surface-raised p-3 text-center">
                      <p className="text-sm font-semibold">{messageFor(error?.messageKey ?? "").title}</p>
                      {error?.retryable && onRetry && (
                        <Button className="h-11 px-4 text-sm" onClick={onRetry}>
                          {copy.paths.retryOne}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <JobProgress status={status} steps={steps} slow={slow} />
                  )}
                </div>
              </>
            )}
          </div>
          {ready ? <StyleDirectionLabel /> : null}
        </div>
      </div>

      {ready && (
        <>
          <p className="text-xs font-semibold text-text-muted">{t.possibility}</p>
          {note && <p className="text-xs text-text-muted">{note}</p>}
          {/* The visible words are the whole name (so voice control works); the stage is its description. */}
          <Button variant={saved ? "primary" : "secondary"} className="self-start" aria-describedby={headingId} onClick={onToggleSaved}>
            {saved ? <CheckIcon aria-hidden="true" className="size-5" /> : <PlusIcon aria-hidden="true" className="size-5" />}
            {saved ? t.inPlan : t.addToPlan}
          </Button>
        </>
      )}
    </InView>
  );
}
