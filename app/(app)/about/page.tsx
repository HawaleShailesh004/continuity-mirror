import { ExternalLinkIcon } from "lucide-react";
import { Screen } from "@/components/cm/screen";
import { ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { sources } from "@/content/sources";
import { formatDate } from "@/lib/client/format";

export const metadata = { title: "How it works" };

/*
 * How it works, the YouCam APIs used and why, the limits, and every source
 * with the date we checked it. The build version (from /api/status) joins in F2.
 */
export default function AboutPage() {
  const t = copy.about;

  return (
    <Screen title={t.title} backHref="/">
      <p className="text-text-soft">{t.intro}</p>

      <section aria-labelledby="steps-title" className="flex flex-col gap-3">
        <h2 id="steps-title" className="text-lg">
          {t.stepsTitle}
        </h2>
        <ol className="flex flex-col gap-3">
          {t.steps.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-card bg-surface p-5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-peach font-bold"
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-base">{step.title}</h3>
                <p className="text-text-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="apis-title" className="flex flex-col gap-3">
        <h2 id="apis-title" className="text-lg">
          {t.apisTitle}
        </h2>
        <dl className="flex flex-col gap-3">
          {t.apis.map((api) => (
            <div key={api.name} className="flex flex-col gap-1 rounded-card bg-surface p-5">
              <dt className="font-bold">{api.name}</dt>
              <dd className="text-text-soft">{api.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="limits-title" className="flex flex-col gap-3">
        <h2 id="limits-title" className="text-lg">
          {t.limitsTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
          {t.limits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sources-title" className="flex flex-col gap-3">
        <h2 id="sources-title" className="text-lg">
          {t.sourcesTitle}
        </h2>
        <p className="text-sm text-text-muted">{t.sourcesIntro}</p>
        <ul className="flex flex-col gap-3">
          {sources.map((source) => (
            <li key={source.id} className="flex flex-col gap-1 rounded-card bg-surface p-5">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 font-bold text-action"
              >
                {source.title}
                <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="text-sm text-text-muted">
                {source.publisher} · {copy.plan.asOf(formatDate(source.asOf))}
              </p>
              <p className="text-text-soft">{source.usedFor}</p>
            </li>
          ))}
        </ul>
      </section>

      <ButtonLink href="/partners" variant="secondary" size="lg" full className="md:max-w-sm">
        {copy.partners.title}
      </ButtonLink>
    </Screen>
  );
}
