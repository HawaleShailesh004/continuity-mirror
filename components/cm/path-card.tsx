"use client";

import { ViewTransition } from "react";
import Link from "next/link";
import * as m from "motion/react-m";
import { Button } from "@/components/ui/button";
import { ProgressiveBlur } from "@/components/motion/progressive-blur";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { JobProgress } from "./job-progress";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import { develop } from "@/lib/client/motion";
import { messageFor } from "@/lib/client/messages";
import type { Job, Verdict } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const verdictText: Record<Verdict["feelsLikeMe"], string> = {
  yes: copy.paths.verdictYes,
  unsure: copy.paths.verdictUnsure,
  no: copy.paths.verdictNo,
};

/*
 * One of the three paths on /paths. While it generates it shows the baseline,
 * heavily blurred, under an honest progress pill; on success the result
 * "develops" into view (blur 16 → 0, 900 ms); a failure affects this card
 * only and offers a retry when retrying can help.
 */
export function PathCard({
  name,
  blurb,
  baselineSrc,
  resultSrc,
  resultAlt,
  status,
  steps,
  error,
  slow,
  verdict,
  href,
  changed,
  viewName,
  holdName,
  onRetry,
}: {
  name: string;
  blurb: string;
  baselineSrc: string;
  resultSrc?: string;
  resultAlt?: string;
  status: Job["status"];
  steps: Job["steps"];
  error?: Job["error"];
  slow?: boolean;
  verdict?: Verdict["feelsLikeMe"];
  /** Where "Open" goes once the result is ready. */
  href: string;
  /** "What changed", in a few words (lib/client/what-changed.ts). */
  changed?: string;
  /** Shared-element name: the photo morphs into the same-named photo on the compare screen. */
  viewName?: string;
  /** Keep the shared name while the result is still loading, so an arriving morph has a target at first commit. */
  holdName?: boolean;
  onRetry?: () => void;
}) {
  const calm = useCalmMotion();
  const ready = status === "succeeded" && resultSrc;
  const failed = status === "failed";

  const photo = (
    <div className="relative aspect-4/5 overflow-hidden rounded-image bg-peach md:aspect-3/4">
      {ready ? (
        <m.img
          src={resultSrc}
          alt={resultAlt ?? name}
          data-generated-image=""
          className="absolute inset-0 size-full object-cover object-[50%_20%]"
          variants={calm ? develop.calm : develop.full}
          initial="hidden"
          animate="visible"
        />
      ) : (
        <>
          {/* The photo slowly develops while it waits: a long, gentle blur 28 → 10 px (still, with reduced motion). */}
          <m.img
            src={baselineSrc}
            alt=""
            aria-hidden="true"
            className={cn("absolute inset-0 size-full scale-105 object-cover object-[50%_20%]", failed && "opacity-40")}
            initial={{ filter: failed ? "blur(12px)" : "blur(28px)" }}
            animate={{ filter: failed ? "blur(12px)" : calm ? "blur(20px)" : "blur(10px)" }}
            transition={calm || failed ? { duration: 0 } : { duration: 40, ease: "linear" }}
          />
          {!failed && <ProgressiveBlur className="absolute inset-0" blurIntensity={2} />}
          <div className="absolute inset-x-3 bottom-3">
            {failed ? (
              <div role="alert" className="flex flex-col items-center gap-2 rounded-3xl bg-surface-raised p-4 text-center">
                <p className="text-sm font-semibold">{messageFor(error?.messageKey ?? "").title}</p>
                {error?.retryable && onRetry && (
                  <Button className="h-11 px-5 text-sm" onClick={onRetry}>
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
      {verdict && ready && (
        <span className="absolute top-3 right-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">
          {verdictText[verdict]}
        </span>
      )}
    </div>
  );

  // The route name is the link, stretched over the whole card (one target, and
  // its accessible name is its visible text).
  const heading = ready ? (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      className="rounded-image outline-offset-4 after:absolute after:inset-0 after:content-['']"
    >
      {name}
    </Link>
  ) : (
    name
  );

  return (
    <article className="relative flex flex-col gap-2.5" aria-label={name}>
      {viewName && (ready || holdName) ? (
        <ViewTransition name={viewName} share="morph">
          {photo}
        </ViewTransition>
      ) : (
        photo
      )}
      <div className="flex flex-col gap-1 px-1">
        <h2 className="font-display text-lg leading-snug font-medium">{heading}</h2>
        <p className="text-sm text-text-soft">{blurb}</p>
        {changed && (
          <p className="text-sm font-semibold text-text">
            <span className="sr-only">{copy.paths.changedTitle}: </span>
            {changed}
          </p>
        )}
      </div>
      {ready && <StyleDirectionLabel />}
    </article>
  );
}
