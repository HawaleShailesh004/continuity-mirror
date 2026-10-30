"use client";

import { useEffect, useState } from "react";
import { BlurFade } from "@/components/motion/blur-fade";
import { ButtonLink } from "@/components/ui/button";
import { landing } from "@/content/copy/landing";
import { readLandingState, type LandingState } from "@/lib/client/landing-state";
import { stagger } from "@/lib/client/motion";

const at = (position: number) => 0.45 + position * stagger;

/*
 * The three ways in, shaped by what is true right now:
 *  - a journey already in progress → "Continue where you left off" leads;
 *  - live generation off (units low, kill switch) → the photo button is
 *    replaced by a calm note and the sample person becomes the main action.
 * Until the probe answers we show the normal first-visit buttons, which are
 * the real, tappable ones: the probe only adds to or adjusts them in place.
 */
export function LandingActions() {
  const t = landing;
  const [state, setState] = useState<LandingState>({ liveOff: false, resume: null });

  useEffect(() => {
    let cancelled = false;
    void readLandingState().then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, []);

  const { liveOff, resume } = state;

  return (
    <div className="flex flex-col gap-2.5">
      {resume && (
        <ButtonLink href={resume} size="lg" full>
          {t.continueWhereLeftOff}
        </ButtonLink>
      )}
      <BlurFade delay={at(0)}>
        {liveOff ? (
          <p role="status" className="rounded-card bg-peach px-5 py-4 text-sm text-text-soft">
            {t.sampleOnly}
          </p>
        ) : (
          <ButtonLink href="/start/consent" size="lg" full variant={resume ? "secondary" : "primary"}>
            {t.usePhoto}
          </ButtonLink>
        )}
      </BlurFade>
      <BlurFade delay={at(1)}>
        <ButtonLink href="/start/consent?sample=1" variant={liveOff && !resume ? "primary" : "secondary"} size="lg" full>
          {t.trySample}
        </ButtonLink>
      </BlurFade>
      {!liveOff && (
        <BlurFade delay={at(2)}>
          <ButtonLink href="/start/consent?helper=1" variant="quiet" full>
            {t.helping}
          </ButtonLink>
        </BlurFade>
      )}
    </div>
  );
}
