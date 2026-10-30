import Image from "next/image";
import { StyleDirectionLabel } from "@/components/cm/style-direction-label";
import { common } from "@/content/copy/common";
import { home } from "@/content/copy/home";

/**
 * Hero portrait (signature moment 1) with a real "Closest to me" preview
 * pinned beside it, so the first screen already shows what the product does.
 */
export function HeroVisual() {
  const t = home;

  return (
    <div className="relative isolate md:w-1/2">
      <div aria-hidden="true" className="bg-morning-glow animate-sunrise absolute -inset-10 -z-10 rounded-full" />
      <div className="relative aspect-4/5 max-h-[52vh] overflow-hidden rounded-card bg-peach md:aspect-3/4 md:max-h-none">
        <Image
          src="/mock/personas/amara.jpg"
          alt={t.heroBeforeAlt}
          fill
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover object-[50%_22%]"
        />
        <span className="absolute top-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">
          {common.sampleBadge}
        </span>
      </div>

      <figure className="absolute right-3 -bottom-6 flex w-40 flex-col gap-2 rounded-card bg-surface-raised p-2.5 shadow-raised md:-right-6 md:bottom-10 md:w-48">
        <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach">
          <Image
            src="/demo/amara/closest.jpg"
            alt={t.heroAfterAlt}
            fill
            sizes="200px"
            className="object-cover object-[50%_20%]"
            data-generated-image=""
          />
        </div>
        <figcaption className="flex flex-col gap-1.5 px-1 pb-1">
          <span className="text-sm font-bold">{t.heroCardLabel}</span>
          <StyleDirectionLabel className="px-2 py-1" />
        </figcaption>
      </figure>
    </div>
  );
}
