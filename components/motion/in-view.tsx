"use client";
/*
 * InView: animate when scrolled into view (Regrowth timeline stages,
 * signature moment 8).
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: `m` components; fadeRise preset by default with its calm form;
 * `once` uses useInView's own option instead of extra state.
 */
import { useRef, type ReactNode } from "react";
import { useInView, type UseInViewOptions, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { fadeRise } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

export type InViewProps = {
  children: ReactNode;
  /** Needs `hidden` and `visible` keys. Defaults to fadeRise. */
  variants?: Variants;
  viewOptions?: Omit<UseInViewOptions, "once">;
  as?: "div" | "section" | "li" | "article";
  once?: boolean;
  className?: string;
};

export function InView({
  children,
  variants,
  viewOptions,
  as = "div",
  once = true,
  className,
}: InViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { ...viewOptions, once });
  const calm = useCalmMotion();
  const Tag = m[as] as typeof m.div;

  return (
    <Tag
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={calm ? fadeRise.calm : (variants ?? fadeRise.full)}
    >
      {children}
    </Tag>
  );
}
