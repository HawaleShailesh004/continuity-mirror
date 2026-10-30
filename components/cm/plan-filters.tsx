"use client";

import { ChoiceChips } from "@/components/ui/choice-chips";
import { copy } from "@/content/copy";
import type { Plan } from "@/lib/contracts";

/** Budget, climate and upkeep. They change the notes on the plan, live. */
export function PlanFilters({
  budget,
  climate,
  careEffort,
  onBudget,
  onClimate,
  onCareEffort,
}: {
  budget: Plan["budget"];
  climate: Plan["climate"];
  careEffort: 1 | 2 | 3;
  onBudget: (v: Plan["budget"]) => void;
  onClimate: (v: Plan["climate"]) => void;
  onCareEffort: (v: 1 | 2 | 3) => void;
}) {
  const group = (label: string) => <h3 className="text-sm font-semibold text-text-soft">{label}</h3>;
  const opts = copy.plan;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {group(opts.budget)}
        <ChoiceChips
          label={opts.budget}
          value={budget}
          onValueChange={onBudget}
          options={(["low", "mid", "high"] as const).map((v) => ({ value: v, label: opts.budgetOptions[v] }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        {group(opts.climate)}
        <ChoiceChips
          label={opts.climate}
          value={climate}
          onValueChange={onClimate}
          options={(["hot", "temperate", "cold"] as const).map((v) => ({ value: v, label: opts.climateOptions[v] }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        {group(opts.care)}
        <ChoiceChips
          label={opts.care}
          value={String(careEffort) as "1" | "2" | "3"}
          onValueChange={(v) => onCareEffort(Number(v) as 1 | 2 | 3)}
          options={(["1", "2", "3"] as const).map((v) => ({ value: v, label: opts.careOptions[Number(v) as 1 | 2 | 3] }))}
        />
      </div>
    </div>
  );
}
