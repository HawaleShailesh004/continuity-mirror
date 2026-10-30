import Image from "next/image";
import { ArrowRightIcon, HeartHandshakeIcon } from "lucide-react";
import { BlurFade } from "@/components/motion/blur-fade";
import { StyleDirectionLabel } from "@/components/cm/style-direction-label";
import { ButtonLink } from "@/components/ui/button";
import { home } from "@/content/copy/home";
import { Section } from "./section";

/** "Who it's for": each sample person stands for one real question, with one genuine result. */
export function People() {
  const t = home.people;

  return (
    <Section id="who" kicker={t.kicker} title={t.title} lead={t.body} tone="surface">
      <ul className="grid gap-4 md:grid-cols-2">
        {t.cards.map((card, i) => (
          <li key={card.id}>
            <BlurFade inView delay={0.06 * (i % 2)} className="flex h-full flex-col gap-4 rounded-card bg-surface-raised p-4 shadow-raised sm:flex-row sm:items-center">
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="relative aspect-3/4 w-28 overflow-hidden rounded-image bg-peach">
                  <Image src={`/demo/${card.id}/baseline.jpg`} alt={card.beforeAlt} fill sizes="112px" className="object-cover object-top" />
                </div>
                <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                <div className="relative aspect-3/4 w-28 overflow-hidden rounded-image bg-peach">
                  <Image
                    src={`/demo/${card.id}/${card.after}.jpg`}
                    alt={card.afterAlt}
                    fill
                    sizes="112px"
                    className="object-cover object-top"
                    data-generated-image=""
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 px-1">
                <h3 className="text-lg">{card.title}</h3>
                <p className="text-text-soft">{card.text}</p>
              </div>
            </BlurFade>
          </li>
        ))}
      </ul>
      <StyleDirectionLabel className="-mt-4" />

      <BlurFade inView>
        <div className="flex flex-col gap-4 rounded-card bg-peach p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex gap-4">
            <HeartHandshakeIcon aria-hidden="true" className="mt-0.5 size-7 shrink-0 text-text-soft" />
            <div className="flex flex-col gap-1">
              <h3 className="text-lg">{t.helperTitle}</h3>
              <p className="max-w-150 text-text-soft">{t.helperText}</p>
            </div>
          </div>
          <ButtonLink href="/start/consent?sample=1" variant="secondary" full className="bg-surface-raised md:w-auto">
            {t.helperCta}
          </ButtonLink>
        </div>
      </BlurFade>
    </Section>
  );
}
