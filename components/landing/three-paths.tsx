import Image from "next/image";
import { BlurFade } from "@/components/motion/blur-fade";
import { StyleDirectionLabel } from "@/components/cm/style-direction-label";
import { home } from "@/content/copy/home";
import { label } from "@/content/copy/label";
import { Section } from "./section";

const results = [
  { src: "/demo/meera/closest.jpg", alt: home.paths.alt.closest },
  { src: "/demo/meera/easier.jpg", alt: home.paths.alt.easier },
  { src: "/demo/meera/new-chapter.jpg", alt: home.paths.alt.newChapter },
] as const;

/** "One photo, three paths": Meera's genuine results beside her baseline, then the three steps. */
export function ThreePaths() {
  const t = home.paths;

  return (
    <Section id="how" kicker={t.kicker} title={t.title} lead={t.body}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <BlurFade inView>
          <figure className="flex flex-col gap-2">
            <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach ring-2 ring-action ring-offset-2 ring-offset-bg">
              <Image src="/demo/meera/baseline.jpg" alt={t.alt.before} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover object-top" />
            </div>
            <figcaption className="flex flex-col gap-0.5">
              <span className="font-bold">{t.before}</span>
              <span className="text-sm text-text-muted">{t.person}</span>
            </figcaption>
          </figure>
        </BlurFade>
        {results.map((result, i) => (
          <BlurFade key={result.src} inView delay={0.08 * (i + 1)}>
            <figure className="flex flex-col gap-2">
              <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach">
                <Image
                  src={result.src}
                  alt={result.alt}
                  fill
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className="object-cover object-top"
                  data-generated-image=""
                />
              </div>
              <figcaption className="flex flex-col gap-0.5">
                <span className="font-bold">{t.routes[i].name}</span>
                <span className="text-sm text-text-soft">{t.routes[i].text}</span>
              </figcaption>
            </figure>
          </BlurFade>
        ))}
      </div>
      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StyleDirectionLabel />
        <p className="text-xs text-text-muted">{label.sampleResult}</p>
      </div>

      <ol className="grid gap-3 md:grid-cols-3">
        {t.steps.map((step, i) => (
          <li key={step.title} className="flex gap-4 rounded-card bg-surface p-5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-peach font-bold">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-base">{step.title}</h3>
              <p className="text-text-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
