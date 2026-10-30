"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ImageComparison,
  ImageComparisonImage,
  ImageComparisonSlider,
} from "@/components/motion/image-comparison";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { PhotoFrame } from "./photo-frame";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";

type Mode = "side" | "slide";

const WIDE = "(min-width: 768px)";
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/*
 * "You, before" beside the new look. Side by side on phones, a drag slider
 * from 768 px; either can be switched by hand. The baseline is always on
 * screen (principle 2). The slider is keyboard operable (arrow keys, Home,
 * End) and announces "Showing 60% new style". `hint` plays the one-time
 * 50 → 35 → 50 glide.
 */
export function CompareView({
  beforeSrc,
  afterSrc,
  afterAlt,
  routeName,
  hint = false,
  sample = false,
}: {
  beforeSrc: string;
  afterSrc: string;
  /** From copy.compare.alt(): "Preview: chin-length bob, your own colour". */
  afterAlt: string;
  routeName: string;
  hint?: boolean;
  sample?: boolean;
}) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode = chosen ?? (wide ? "slide" : "side");

  return (
    <div className="flex flex-col gap-3">
      <ChoiceChips
        variant="segment"
        label={copy.compare.modeLabel}
        value={mode}
        onValueChange={setChosen}
        options={[
          { value: "side", label: copy.compare.modeSide },
          { value: "slide", label: copy.compare.modeSlide },
        ]}
        className="self-start md:w-72"
      />

      {mode === "side" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <figure className="flex flex-col gap-1.5">
            <PhotoFrame src={beforeSrc} alt={copy.compare.altBefore} sample={sample} aspect="aspect-3/4" />
            <figcaption className="text-xs font-bold">{copy.compare.before}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1.5">
            <PhotoFrame src={afterSrc} alt={afterAlt} generated hideLabel aspect="aspect-3/4" />
            <figcaption className="text-xs font-bold">{routeName}</figcaption>
          </figure>
        </div>
      ) : (
        <ImageComparison
          hint={hint}
          label={copy.compare.sliderLabel}
          getValueText={(position) => copy.compare.sliderValue(100 - position)}
          className="aspect-3/4 w-full max-w-md self-center rounded-image bg-peach"
        >
          <ImageComparisonImage
            src={afterSrc}
            alt={afterAlt}
            side="after"
            dataAttrs={{ "data-generated-image": "" }}
          />
          <ImageComparisonImage src={beforeSrc} alt={copy.compare.altBefore} side="before" />
          <ImageComparisonSlider className="bg-on-photo shadow-pill">
            <span className="absolute top-1/2 left-1/2 size-11 -translate-1/2 rounded-full border-2 border-on-photo bg-surface-raised/40 shadow-raised backdrop-blur-sm" />
          </ImageComparisonSlider>
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">
            {copy.compare.before}
          </span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">
            {routeName}
          </span>
        </ImageComparison>
      )}

      <StyleDirectionLabel />
    </div>
  );
}
