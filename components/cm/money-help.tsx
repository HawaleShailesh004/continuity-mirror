"use client";

import { ExternalLinkIcon } from "lucide-react";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Disclosure } from "@/components/ui/disclosure";
import { copy } from "@/content/copy";
import type { InsuranceGuide, Programme, ProgrammeCountry } from "@/lib/catalog";
import { formatDate } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const external = "inline-flex min-h-11 items-center gap-1 font-semibold text-action";

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={external}>
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Programmes for one country: each with its source, the date we checked it, and what to double-check. */
export function ResourceList({ programmes }: { programmes: readonly Programme[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {programmes.map((p) => (
        <li key={p.id} className="flex flex-col gap-1.5 rounded-2xl bg-bg p-4">
          <h4 className="text-base font-bold">{p.name}</h4>
          <p className="text-sm text-text-soft">{p.summary}</p>
          {p.contact && <p className="text-sm font-semibold">{copy.plan.callThem(p.contact)}</p>}
          {p.checkNote && (
            <p className="text-xs text-text-muted">
              <span className="font-semibold">{copy.plan.checkBeforeYouGo}</span> {p.checkNote}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            <span>{copy.plan.asOf(formatDate(p.asOf))}</span>
            <SourceLink href={p.sourceUrl}>{copy.plan.source}</SourceLink>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** One country's insurance guide. Steps from a source say so; our own suggestions are labelled as ours. */
function InsuranceSteps({ guide }: { guide: InsuranceGuide }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-soft">{guide.intro}</p>
      <ol className="flex flex-col gap-3">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <span>{step.text}</span>
            <span className={cn("text-xs font-semibold", step.basis === "guidance" ? "text-text-soft" : "text-text-muted")}>
              {step.basis === "guidance" ? copy.plan.ourSuggestion : copy.plan.citedBy}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col">
        <p className="text-xs font-semibold text-text-muted">
          {copy.plan.sources} · {copy.plan.asOf(formatDate(guide.asOf))}
        </p>
        {guide.sources.map((s) => (
          <SourceLink key={s.url} href={s.url}>
            {s.title}
          </SourceLink>
        ))}
      </div>
    </div>
  );
}

/*
 * Insurance wording, then programmes, both for the country the user picks.
 * General guidance only, with a source and an as-of date on everything
 * (master plan §6). Backend's reviewed data; we never show its review flags.
 */
export function MoneyHelp({
  programmes,
  guides,
  country,
  onCountry,
}: {
  programmes: readonly Programme[];
  guides: readonly InsuranceGuide[];
  country: ProgrammeCountry;
  onCountry: (country: ProgrammeCountry) => void;
}) {
  const countries = (Object.keys(copy.plan.countryOptions) as ProgrammeCountry[]).map((c) => ({
    value: c,
    label: copy.plan.countryOptions[c],
  }));
  const shown = programmes.filter((p) => p.country === country);
  const guide = guides.find((g) => g.country === country);

  return (
    <div className="flex flex-col gap-4">
      <ChoiceChips label={copy.plan.countryLabel} value={country} onValueChange={onCountry} options={countries} />

      <Disclosure title={guide?.title ?? copy.plan.insuranceTitle}>
        {guide ? <InsuranceSteps guide={guide} /> : <p className="text-sm text-text-soft">{copy.plan.noInsuranceGuide}</p>}
      </Disclosure>

      <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
        <h3 className="text-base">{copy.plan.programmesTitle}</h3>
        <p className="text-sm text-text-soft">{copy.plan.programmesIntro}</p>
        {shown.length > 0 ? (
          <ResourceList programmes={shown} />
        ) : (
          <p className="text-sm text-text-muted">{copy.plan.noProgrammes}</p>
        )}
      </div>
    </div>
  );
}
