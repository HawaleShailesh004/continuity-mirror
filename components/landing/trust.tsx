import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon, LockIcon, ScissorsIcon, SmartphoneIcon, Trash2Icon, UserRoundXIcon } from "lucide-react";
import { BlurFade } from "@/components/motion/blur-fade";
import { home } from "@/content/copy/home";
import { Section } from "./section";

const privacyIcons = [SmartphoneIcon, LockIcon, UserRoundXIcon, Trash2Icon];

/** Privacy promises (each one is a row in docs/FACTS.md), then the note for wig fitters. */
export function PrivacyPromise() {
  const t = home.privacy;

  return (
    <Section id="privacy" kicker={t.kicker} title={t.title} tone="surface">
      <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {t.items.map((item, i) => {
          const Icon = privacyIcons[i];
          return (
            <li key={item.title}>
              <BlurFade inView delay={0.06 * i} className="flex h-full flex-col gap-3 rounded-card bg-surface-raised p-5">
                <Icon aria-hidden="true" className="size-6 text-action" />
                <h3 className="text-base">{item.title}</h3>
                <p className="text-text-soft">{item.text}</p>
              </BlurFade>
            </li>
          );
        })}
      </ul>
      <Link href="/privacy" transitionTypes={["nav-forward"]} className="-mt-4 inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-action">
        {t.more}
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </Link>
    </Section>
  );
}

export function ForFitters() {
  const t = home.fitters;

  return (
    <section aria-labelledby="fitters-title" className="px-5 py-16 md:px-8">
      <BlurFade inView className="mx-auto flex w-full max-w-280 flex-col gap-4 rounded-card border border-line p-6 md:flex-row md:items-center md:gap-8 md:p-10">
        <ScissorsIcon aria-hidden="true" className="size-8 shrink-0 text-text-soft" />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-action">{t.kicker}</p>
          <h2 id="fitters-title" className="font-display text-xl font-medium">
            {t.title}
          </h2>
          <p className="max-w-170 text-text-soft">{t.text}</p>
        </div>
        <Link
          href="/partners"
          transitionTypes={["nav-forward"]}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start font-semibold text-action md:ml-auto md:self-center"
        >
          {t.cta}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </BlurFade>
    </section>
  );
}

export function Faq() {
  const t = home.faq;

  return (
    <Section id="faq" title={t.title}>
      <div className="flex max-w-200 flex-col gap-3">
        {t.items.map((item) => (
          <details key={item.q} className="group rounded-card bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDownIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-text-muted transition-transform duration-(--dur-base) group-open:rotate-180"
              />
            </summary>
            <p className="px-5 pb-5 text-text-soft">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
