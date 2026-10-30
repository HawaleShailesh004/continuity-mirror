import { StyleDirectionLabel } from "@/components/cm/style-direction-label";
import { common } from "@/content/copy/common";
import { home } from "@/content/copy/home";
import { HeroSlider } from "./hero-slider";

/**
 * Hero (signature moment 1): the sample person's photo and a real "Closest to me"
 * preview in one slider (hero-slider.tsx, the only client part). This wrapper stays
 * on the server so the page's copy and the "Style direction" label never ship to
 * the browser with the first load.
 */
export function HeroVisual() {
  const t = home;

  return (
    <div className="relative isolate md:w-1/2">
      <div aria-hidden="true" className="bg-morning-glow animate-sunrise absolute -inset-10 -z-10 rounded-full" />
      <HeroSlider
        beforeAlt={t.heroBeforeAlt}
        afterAlt={t.heroAfterAlt}
        beforeLabel={common.youBefore}
        afterLabel={t.heroCardLabel}
        sampleLabel={common.sampleBadge}
      />
      <StyleDirectionLabel className="mt-3" />
    </div>
  );
}
