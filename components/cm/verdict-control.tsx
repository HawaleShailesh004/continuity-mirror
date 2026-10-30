"use client";

import { ChoiceChips } from "@/components/ui/choice-chips";
import { Disclosure } from "@/components/ui/disclosure";
import { CueChecklist } from "./cue-checklist";
import { copy } from "@/content/copy";
import type { Cue, CueKey } from "@/lib/client/cues";
import type { Verdict } from "@/lib/contracts";

/*
 * "Does this still feel like you?": Yes / Not sure / Not me, plus a quiet
 * disclosure for what changed. The answer is saved by the parent as soon as
 * it changes (a Verdict row in Dexie). Never a score.
 */
export function VerdictControl({
  value,
  onValueChange,
  cues,
  changed,
  onChangedChange,
}: {
  value: Verdict["feelsLikeMe"] | null;
  onValueChange: (value: Verdict["feelsLikeMe"]) => void;
  cues: readonly Cue[];
  changed: readonly CueKey[];
  onChangedChange: (changed: CueKey[]) => void;
}) {
  return (
    <section aria-labelledby="verdict-title" className="flex flex-col gap-3">
      <h2 id="verdict-title" className="text-lg">
        {copy.compare.verdictTitle}
      </h2>
      <ChoiceChips
        variant="segment"
        label={copy.compare.verdictLabel}
        value={value}
        onValueChange={onValueChange}
        options={[
          { value: "yes", label: copy.common.yes },
          { value: "unsure", label: copy.common.notSure },
          { value: "no", label: copy.common.no },
        ]}
      />
      <Disclosure title={copy.compare.changedTitle}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-soft">{copy.compare.changedHint}</p>
          <CueChecklist cues={cues} changed={changed} onChangedChange={onChangedChange} />
          <p className="text-xs text-text-muted">{copy.compare.colourMayDiffer}</p>
        </div>
      </Disclosure>
    </section>
  );
}
