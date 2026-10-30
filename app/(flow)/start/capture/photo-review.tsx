"use client";

import { CheckList } from "@/components/cm/check-list";
import { PhotoFrame } from "@/components/cm/photo-frame";
import { RetakeCoach } from "@/components/cm/retake-coach";
import { capture } from "@/content/copy/capture";
import type { CheckResult } from "@/lib/client/capture/checks";
import { blocking, retakeKey } from "@/lib/client/capture/still";

/*
 * The photo, and the verdict of our own checks. A photo that fails a blocking
 * check is not used (no YouCam call, no units): the coach says the one thing to
 * change. Light is advice only. If the models couldn't run, the photo is
 * unchecked and the user may still use it.
 */
export function PhotoReview({
  url,
  results,
  source,
  onAgain,
}: {
  url: string;
  results: readonly CheckResult[] | null;
  source: "camera" | "upload";
  /** Go back to taking or choosing a photo. */
  onAgain: () => void;
}) {
  const blockers = results ? blocking(results) : [];
  const lightIsOff = results?.some((r) => r.id === "lighting" && !r.ok) ?? false;

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto w-full max-w-60">
        <PhotoFrame src={url} alt={capture.review.alt} aspect="aspect-3/4" />
      </div>

      {blockers.length > 0 && results ? (
        <>
          <p className="text-sm font-semibold text-text-soft">{capture.review.fixFirst}</p>
          <RetakeCoach
            messageKey={retakeKey(results)}
            onRetake={source === "camera" ? onAgain : undefined}
            onChooseOther={source === "upload" ? onAgain : undefined}
          />
          <CheckList results={results} className="mx-auto w-full max-w-sm" />
        </>
      ) : (
        <>
          {results && <CheckList results={results} className="mx-auto w-full max-w-sm" />}
          {!results && <p className="rounded-card bg-surface px-5 py-4 text-sm text-text-soft">{capture.review.unchecked}</p>}
          {lightIsOff && <p className="rounded-card bg-peach px-5 py-4 text-sm text-text-soft">{capture.review.lightNote}</p>}
        </>
      )}
    </div>
  );
}
