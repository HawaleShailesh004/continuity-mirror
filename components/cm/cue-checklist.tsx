"use client";

import { CheckIcon } from "lucide-react";
import { copy } from "@/content/copy";
import type { Cue, CueKey } from "@/lib/client/cues";
import { cn } from "@/lib/utils";

/*
 * The user's own cues as chips. A ticked chip means "this still looks like
 * me"; unticking records "this changed something I didn't want". The user
 * judges, the app only records (principle 2): no scores, no detection.
 */
export function CueChecklist({
  cues,
  changed,
  onChangedChange,
}: {
  cues: readonly Cue[];
  /** Keys the user says changed. */
  changed: readonly CueKey[];
  onChangedChange: (changed: CueKey[]) => void;
}) {
  const toggle = (key: CueKey) =>
    onChangedChange(changed.includes(key) ? changed.filter((k) => k !== key) : [...changed, key]);

  return (
    <div role="group" aria-label={copy.compare.cuesLabel} className="flex flex-wrap gap-2">
      {cues.map((cue) => {
        const still = !changed.includes(cue.key);
        return (
          <button
            key={cue.key}
            type="button"
            aria-pressed={still}
            onClick={() => toggle(cue.key)}
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-(--dur-quick)",
              still ? "bg-selected text-text" : "bg-surface text-text-muted line-through decoration-1",
            )}
          >
            {still && <CheckIcon aria-hidden="true" className="size-4 text-action" strokeWidth={3} />}
            {cue.label}
          </button>
        );
      })}
    </div>
  );
}
