"use client";
/*
 * BlurFade: element arrives with a small offset and blur-to-sharp
 * (landing buttons in a 60 ms stagger, cards, sections).
 * Adapted from Magic UI (MIT), see docs/THIRD_PARTY.md.
 * Changes: `m` components; token duration/easing; reduced motion → opacity
 * fade; dropped the AnimatePresence wrapper (exit never ran without a key).
 */
import { useRef, type ReactNode } from "react";
import { useInView, type UseInViewOptions, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { dur, ease, rest, transition } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

export type BlurFadeProps = {
  children: ReactNode;
  className?: string;
  /** Seconds. */
  delay?: number;
  duration?: number;
  /** px travelled. */
  offset?: number;
  direction?: "up" | "down" | "left" | "right";
  /** Wait until scrolled into view. */
  inView?: boolean;
  inViewMargin?: UseInViewOptions["margin"];
  blur?: string;
};

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = dur.base,
  offset = 12,
  direction = "up",
  inView = false,
  inViewMargin = "-50px",
  blur = "6px",
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: inViewMargin });
  const show = !inView || seen;
  const calm = useCalmMotion();

  const from = direction === "down" || direction === "right" ? -offset : offset;
  const horizontal = direction === "left" || direction === "right";

  const variants: Variants = calm
    ? {
        hidden: { opacity: 0 },
        visible: { ...rest, opacity: 1, transition: { ...transition.reduced, delay } },
      }
    : {
        hidden: {
          ...(horizontal ? { x: from } : { y: from }),
          opacity: 0,
          filter: `blur(${blur})`,
        },
        visible: {
          ...(horizontal ? { x: 0 } : { y: 0 }),
          opacity: 1,
          filter: "blur(0px)",
          transition: { duration, ease: ease.out, delay },
        },
      };

  return (
    <m.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={show ? "visible" : "hidden"}
      variants={variants}
    >
      {children}
    </m.div>
  );
}
