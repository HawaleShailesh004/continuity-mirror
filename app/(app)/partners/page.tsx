import { Screen } from "@/components/cm/screen";
import { buttonClass } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { styles } from "@/lib/catalog";

export const metadata = { title: "For wig shops and cancer centres" };

// A real entry from our own catalogue, trimmed to the fields a shop would fill in first.
const example = (() => {
  const s = styles.find((x) => x.id === "short-bob") ?? styles[0]!;
  return JSON.stringify(
    { id: s.id, label: s.label, style: s.style, audience: s.audience, length: s.length, fringe: s.fringe, parting: s.parting, texture: s.texture, careEffort: s.careEffort, askFor: s.askFor, priceBand: s.priceBand },
    null,
    2,
  );
})();

/*
 * The B2B story (Module L): static, honest about what exists. Nothing here
 * claims a partner, a number or a launch date. The contact address comes from
 * NEXT_PUBLIC_PARTNER_EMAIL; without it the page says details are coming.
 */
export default function PartnersPage() {
  const t = copy.partners;
  const email = process.env.NEXT_PUBLIC_PARTNER_EMAIL;

  return (
    <Screen title={t.title} backHref="/about">
      <p className="text-text-soft">{t.intro}</p>
      <p role="note" className="rounded-card bg-peach px-5 py-4 text-sm font-semibold text-text-soft">
        {t.status}
      </p>

      <section aria-labelledby="who-title" className="flex flex-col gap-3">
        <h2 id="who-title" className="text-lg">
          {t.whoTitle}
        </h2>
        <ul className="flex flex-col gap-3">
          {t.who.map((w) => (
            <li key={w.title} className="flex flex-col gap-1 rounded-card bg-surface p-5">
              <h3 className="text-base">{w.title}</h3>
              <p className="text-text-soft">{w.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="today-title" className="flex flex-col gap-3">
          <h2 id="today-title" className="text-lg">
            {t.todayTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
            {t.today.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="next-title" className="flex flex-col gap-3">
          <h2 id="next-title" className="text-lg">
            {t.nextTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
            {t.next.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="format-title" className="flex flex-col gap-3">
        <h2 id="format-title" className="text-lg">
          {t.formatTitle}
        </h2>
        <p className="text-text-soft">{t.formatBody}</p>
        <pre
          tabIndex={0}
          aria-label={t.formatLabel}
          className="overflow-x-auto rounded-card bg-surface p-4 font-mono text-xs leading-relaxed"
        >
          {example}
        </pre>
        <p className="text-sm text-text-muted">{t.formatNote}</p>
      </section>

      <section aria-labelledby="keeps-title" className="flex flex-col gap-3">
        <h2 id="keeps-title" className="text-lg">
          {t.keepsTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
          {t.keeps.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-title" className="flex flex-col items-start gap-3 rounded-card bg-surface p-5">
        <h2 id="contact-title" className="text-lg">
          {t.contactTitle}
        </h2>
        <p className="text-text-soft">{t.contactBody}</p>
        {email ? (
          <a href={`mailto:${email}?subject=${encodeURIComponent(t.contactSubject)}`} className={buttonClass({ size: "lg" })}>
            {t.contactCta}
          </a>
        ) : (
          <p className="text-sm font-semibold text-text-muted">{t.contactMissing}</p>
        )}
      </section>
    </Screen>
  );
}
