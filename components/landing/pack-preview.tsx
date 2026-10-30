import Image from "next/image";
import { CheckIcon, ClipboardListIcon, LandmarkIcon } from "lucide-react";
import { BlurFade } from "@/components/motion/blur-fade";
import { StyleDirectionLabel } from "@/components/cm/style-direction-label";
import { exportPack } from "@/content/copy/exportPack";
import { home } from "@/content/copy/home";
import { Section } from "./section";

/**
 * "What you leave with": a paper-like sketch of the consultation pack (drawn in
 * HTML from Meera's genuine results, not a screenshot) beside what's inside it.
 */
export function PackPreview() {
  const t = home.pack;

  return (
    <Section id="plan" kicker={t.kicker} title={t.title} lead={t.body}>
      <div className="grid items-start gap-10 md:grid-cols-2 md:gap-14">
        <BlurFade inView>
          <figure aria-label={exportPack.title} className="mx-auto flex w-full max-w-110 -rotate-1 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-raised">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
              <span className="text-lg font-bold">{t.paperTitle}</span>
              <span className="text-xs text-text-muted">{t.paperSub}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { src: "/demo/meera/baseline.jpg", name: t.paperBefore, generated: false },
                { src: "/demo/meera/closest.jpg", name: t.paperLooks, generated: true },
                { src: "/demo/meera/easier.jpg", name: "", generated: true },
              ].map((photo) => (
                <div key={photo.src} className="flex flex-col gap-1">
                  <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-peach">
                    <Image
                      src={photo.src}
                      alt=""
                      fill
                      sizes="140px"
                      className="object-cover object-top"
                      {...(photo.generated ? { "data-generated-image": "" } : {})}
                    />
                  </div>
                  <span className="min-h-5 text-xs font-semibold text-text-soft">{photo.name}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-surface p-3">
              <span className="text-xs font-semibold text-text-muted">{t.paperAsk}</span>
              <span className="text-sm">{t.paperAskText}</span>
            </div>
            <StyleDirectionLabel />
          </figure>
        </BlurFade>

        <div className="flex flex-col gap-6">
          <BlurFade inView>
            <h3 className="mb-3 text-lg">{exportPack.contentsTitle}</h3>
            <ul className="flex flex-col gap-2.5">
              {exportPack.contents.map((item) => (
                <li key={item} className="flex gap-3 text-text-soft">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-action" />
                  {item}
                </li>
              ))}
            </ul>
          </BlurFade>
          <BlurFade inView delay={0.08}>
            <div className="flex gap-4 rounded-card bg-surface p-5">
              <LandmarkIcon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-text-soft" />
              <div className="flex flex-col gap-1">
                <h3 className="text-base">{t.moneyTitle}</h3>
                <p className="text-text-soft">{t.moneyText}</p>
              </div>
            </div>
          </BlurFade>
          <BlurFade inView delay={0.16}>
            <div className="flex gap-4 rounded-card bg-surface p-5">
              <ClipboardListIcon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-text-soft" />
              <div className="flex flex-col gap-1">
                <h3 className="text-base">{t.checklistTitle}</h3>
                <p className="text-text-soft">{t.checklistText}</p>
              </div>
            </div>
          </BlurFade>
        </div>
      </div>
    </Section>
  );
}
