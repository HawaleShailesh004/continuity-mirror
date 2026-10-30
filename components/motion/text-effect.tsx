"use client";
/*
 * TextEffect: text arriving per line / word / character.
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: `m` components for LazyMotion; token durations and easing;
 * presets trimmed to calm ones (no scale-from-zero); reduced motion → fade.
 */
import { memo } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import type { Transition, Variants } from "motion/react";
import { cn } from "@/lib/utils";
import { dur, ease, rest, transition } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

export type TextEffectPreset = "blur" | "fade-in-blur" | "fade" | "slide";
export type TextEffectPer = "line" | "word" | "char";
type Tag = "p" | "span" | "div" | "h1" | "h2" | "h3";

export type TextEffectProps = {
  /** For per="line", separate lines with "\n". */
  children: string;
  per?: TextEffectPer;
  as?: Tag;
  preset?: TextEffectPreset;
  className?: string;
  /** Seconds before the first segment starts. */
  delay?: number;
  trigger?: boolean;
  onAnimationComplete?: () => void;
};

const staggerFor: Record<TextEffectPer, number> = {
  char: 0.02,
  word: 0.05,
  line: 0.12,
};

const items: Record<TextEffectPreset | "calm", Variants> = {
  blur: {
    hidden: { opacity: 0, filter: "blur(10px)" },
    visible: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(10px)" },
  },
  "fade-in-blur": {
    hidden: { opacity: 0, y: 12, filter: "blur(10px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: 12, filter: "blur(10px)" },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
  },
  calm: {
    hidden: { opacity: 0 },
    visible: { ...rest, opacity: 1 },
    exit: { opacity: 0 },
  },
};

function withTransition(variants: Variants, t: Transition): Variants {
  return {
    hidden: variants.hidden,
    visible: { ...(variants.visible as object), transition: t },
    exit: { ...(variants.exit as object), transition: t },
  };
}

const Segment = memo(function Segment({
  segment,
  variants,
  per,
}: {
  segment: string;
  variants: Variants;
  per: TextEffectPer;
}) {
  if (per === "line") {
    return (
      <m.span variants={variants} className="block">
        {segment}
      </m.span>
    );
  }
  if (per === "word") {
    return (
      <m.span
        aria-hidden="true"
        variants={variants}
        className="inline-block whitespace-pre"
      >
        {segment}
      </m.span>
    );
  }
  return (
    <span className="inline-block whitespace-pre">
      {segment.split("").map((char, i) => (
        <m.span
          key={i}
          aria-hidden="true"
          variants={variants}
          className="inline-block whitespace-pre"
        >
          {char}
        </m.span>
      ))}
    </span>
  );
});

export function TextEffect({
  children,
  per = "word",
  as = "p",
  preset = "fade",
  className,
  delay = 0,
  trigger = true,
  onAnimationComplete,
}: TextEffectProps) {
  const calm = useCalmMotion();
  const MotionTag = m[as] as typeof m.p;
  const segments = per === "line" ? children.split("\n") : children.split(/(\s+)/);

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: calm ? 0 : staggerFor[per],
        delayChildren: calm ? 0 : delay,
      },
    },
    exit: {
      transition: { staggerChildren: calm ? 0 : staggerFor[per], staggerDirection: -1 },
    },
  };

  const item = withTransition(
    items[calm ? "calm" : preset],
    calm ? transition.reduced : { duration: dur.gentle, ease: ease.out },
  );

  return (
    <AnimatePresence mode="popLayout">
      {trigger && (
        <MotionTag
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={container}
          className={cn(className)}
          onAnimationComplete={onAnimationComplete}
        >
          {/* Word/char segments are aria-hidden; screen readers get the whole string. */}
          {per !== "line" ? <span className="sr-only">{children}</span> : null}
          {segments.map((segment, i) => (
            <Segment
              key={`${per}-${i}-${segment}`}
              segment={segment}
              variants={item}
              per={per}
            />
          ))}
        </MotionTag>
      )}
    </AnimatePresence>
  );
}
