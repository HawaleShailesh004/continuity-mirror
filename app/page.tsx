import { ViewTransition } from "react";
import { CheckIcon } from "lucide-react";
import { BlurFade } from "@/components/motion/blur-fade";
import { TextEffect } from "@/components/motion/text-effect";
import { FinalCall, SiteFooter, SiteHeader } from "@/components/landing/chrome";
import { HeroVisual } from "@/components/landing/hero-visual";
import { PackPreview } from "@/components/landing/pack-preview";
import { People } from "@/components/landing/people";
import { ThreePaths } from "@/components/landing/three-paths";
import { Faq, ForFitters, PrivacyPromise } from "@/components/landing/trust";
import { WhyNow } from "@/components/landing/why-now";
import { home } from "@/content/copy/home";
import { landing } from "@/content/copy/landing";
import { LandingActions } from "./landing-actions";

/*
 * Landing. The hero keeps the three ways in (signature moment 1: the peach
 * glow rises, the headline arrives line by line, the buttons follow in a 60 ms
 * stagger; /api/status and "continue where you left off" in LandingActions).
 * Below it, the long form for someone deciding whether this is for them: why
 * now, how it works on real results, who it's for, the plan, privacy, FAQ.
 * Everything below the hero is a server component: `/` has a 180 KB JS budget.
 */
export default function Home() {
  const t = landing;

  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col overflow-x-clip">
        <section className="px-5 pt-8 pb-16 md:px-8 md:pt-12 md:pb-24">
          {/* Text first: on a phone, who it's for and the buttons come before the photo. */}
          <div className="mx-auto flex w-full max-w-280 flex-col gap-14 md:flex-row-reverse md:items-center md:gap-14">
            <div className="flex flex-col gap-6 md:w-1/2">
              <BlurFade>
                <p className="inline-flex self-start rounded-full bg-peach px-3 py-1.5 text-sm font-semibold text-text-soft">
                  {home.eyebrow}
                </p>
              </BlurFade>
              <TextEffect
                as="h1"
                per="line"
                preset="fade-in-blur"
                className="text-2xl leading-[1.15] tracking-tight md:text-3xl"
              >
                {t.headline}
              </TextEffect>
              <BlurFade delay={0.3}>
                <p className="text-lg text-text-soft">{t.promise}</p>
              </BlurFade>
              <LandingActions />
              <BlurFade delay={0.7}>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-text-muted sm:flex sm:flex-wrap">
                  {home.trust.map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <CheckIcon aria-hidden="true" className="size-4 text-action" />
                      {item}
                    </li>
                  ))}
                </ul>
              </BlurFade>
            </div>

            <HeroVisual />
          </div>
        </section>

        <WhyNow />
        <ThreePaths />
        <People />
        <PackPreview />
        <PrivacyPromise />
        <ForFitters />
        <Faq />
        <FinalCall />
      </main>
      <SiteFooter />
      </div>
    </ViewTransition>
  );
}
