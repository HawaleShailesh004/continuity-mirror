import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { copy } from "@/content/copy/checked";
import type { ResultCheck } from "@/lib/client/check/judge";

/*
 * What the on-device check found, in plain words (elite-plan B2). It never rates the
 * person: it says whether the preview kept their face and their colour. Nothing shows
 * when no check ran (samples, practice mode, a face the model could not find).
 */
export function CheckedRow({
  check,
  onTryAgain,
  sample = false,
  firstVersion,
}: {
  check?: ResultCheck;
  onTryAgain?: () => void;
  /** Samples were checked when they were built, not on this device. */
  sample?: boolean;
  /** Present when a repair replaced the image: lets the person look at what YouCam first returned. */
  firstVersion?: { showing: boolean; onToggle: () => void };
}) {
  if (!check || check.outcome === "unchecked") return null;
  const t = copy;
  const repair = check.repaired?.state;

  let tone: "ok" | "wait" | "look";
  let items: string[];
  if (check.outcome === "needs-look") {
    tone = "look";
    items = [t.faceChanged];
  } else if (repair === "queued") {
    tone = "wait";
    items = [t.faceKept, t.adjusting];
  } else if (repair === "adjusted") {
    // After a successful repair the stored outcome is "checked" (markRepair), so match on the repair alone.
    tone = "ok";
    items = [t.faceKept, t.colourAdjusted];
  } else if (check.outcome === "repairable") {
    // The repair failed or was undone: say what is true.
    tone = "ok";
    items = [t.faceKept, t.colourMayDiffer];
  } else {
    tone = "ok";
    items = check.colour.status === "kept" ? [t.faceKept, t.colourKept] : [t.faceKept];
  }

  const title = sample ? t.titleSample : t.title;
  const showToggle = Boolean(firstVersion) && items.includes(t.colourAdjusted);
  const Icon = tone === "ok" ? CheckIcon : tone === "wait" ? Loader2Icon : AlertCircleIcon;
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-card bg-surface/80 px-5 py-4">
      <p className="text-xs font-semibold text-text-muted">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((line) => (
          <li key={line} className="flex items-center gap-2 text-sm font-semibold">
            <Icon aria-hidden="true" className={tone === "wait" ? "size-4 animate-spin text-action" : "size-4 text-action"} />
            {line}
          </li>
        ))}
      </ul>
      {showToggle && firstVersion && (
        <button
          type="button"
          aria-pressed={firstVersion.showing}
          onClick={firstVersion.onToggle}
          className="inline-flex min-h-11 items-center self-start font-semibold text-action"
        >
          {firstVersion.showing ? t.seeAdjusted : t.seeFirst}
        </button>
      )}
      {tone === "look" && onTryAgain && (
        <button type="button" onClick={onTryAgain} className="inline-flex min-h-11 items-center self-start font-semibold text-action">
          {t.tryAgain}
        </button>
      )}
    </section>
  );
}
