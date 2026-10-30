"use client";
/*
 * TextShimmer: a slow light sweep across honest status text
 * ("Styling your hair · usually 15–25 s"), signature moment 5.
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: `m` components; colours from tokens (muted text with a --text
 * highlight, so it reads in both modes); fixed tag set instead of creating a
 * motion component on every render; reduced motion → static muted text.
 */
import type { CSSProperties } from "react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

export type TextShimmerProps = {
  children: string;
  as?: "p" | "span";
  className?: string;
  /** Seconds per sweep. Slow on purpose. */
  duration?: number;
  /** Highlight width in px per character. */
  spread?: number;
};

export function TextShimmer({
  children,
  as = "p",
  className,
  duration = 2.4,
  spread = 2,
}: TextShimmerProps) {
  const calm = useCalmMotion();
  const Tag = as === "span" ? m.span : m.p;

  if (calm) {
    return <Tag className={cn("text-text-muted", className)}>{children}</Tag>;
  }

  return (
    <Tag
      className={cn(
        "relative inline-block bg-clip-text text-transparent",
        "bg-[length:250%_100%,auto] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{ repeat: Infinity, duration, ease: ease.inOut }}
      style={
        {
          "--spread": `${children.length * spread}px`,
          backgroundImage:
            "linear-gradient(90deg, transparent calc(50% - var(--spread)), var(--text), transparent calc(50% + var(--spread))), linear-gradient(var(--text-muted), var(--text-muted))",
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
