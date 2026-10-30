import { ExternalLinkIcon } from "lucide-react";
import { home } from "@/content/copy/home";
import { sources } from "@/content/sources";
import { Section } from "./section";

const cited = sources.filter((s) => s.id === "acs-wigs" || s.id === "acs-coping");

/** The decision window: why "you, before" has to be captured now. Sourced, no predictions. */
export function WhyNow() {
  const t = home.window;

  return (
    <Section id="why-now" kicker={t.kicker} title={t.title} lead={t.body} tone="peach">
      <ol className="relative grid gap-6 md:grid-cols-4 md:gap-4">
        <span aria-hidden="true" className="absolute top-4 bottom-4 left-4 w-0.5 bg-line md:top-4 md:right-8 md:bottom-auto md:left-8 md:h-0.5 md:w-auto" />
        {t.stages.map((stage, i) => (
          <li key={stage.when} className="relative flex gap-4 md:flex-col md:gap-3">
            <span
              aria-hidden="true"
              className={
                i === 0
                  ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-sm font-bold text-on-action md:ml-4"
                  : "flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface-raised text-sm font-bold text-text-soft md:ml-4"
              }
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-base">{stage.when}</h3>
              <p className="text-text-soft">{stage.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-soft">
        <span>{t.sourceLead}</span>
        {cited.map((source) => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-action"
          >
            {source.publisher}, “{source.title}”
            <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ))}
      </p>
    </Section>
  );
}
