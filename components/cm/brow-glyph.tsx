"use client";

import * as m from "motion/react-m";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { browPath, GLYPH_BOX, type GlyphFamily, type GlyphThickness } from "@/lib/client/brow-path";
import { cn } from "@/lib/utils";

/*
 * A brow shape as a drawing. `draw` plays moment 7: the outline draws itself,
 * then the shape fills in with the chosen colour (a plain fade with reduced
 * motion). Swatches in a list use it still. Decorative: the label is the name.
 */
export function BrowGlyph({
  family,
  thickness,
  colour,
  draw = false,
  className,
}: {
  family: GlyphFamily;
  thickness: GlyphThickness;
  /** The brow colour (data: the person's own choice, not a theme token). */
  colour: string;
  draw?: boolean;
  className?: string;
}) {
  const calm = useCalmMotion();
  const d = browPath(family, thickness);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${GLYPH_BOX.w} ${GLYPH_BOX.h}`} className={cn("w-full", className)}>
      {draw ? (
        <m.path
          d={d}
          strokeWidth={1.5}
          strokeLinejoin="round"
          className="stroke-action"
          style={{ fill: colour }}
          initial={calm ? { opacity: 0 } : { pathLength: 0, fillOpacity: 0 }}
          animate={calm ? { opacity: 1 } : { pathLength: 1, fillOpacity: 1 }}
          transition={calm ? { duration: 0.15 } : { pathLength: { duration: 1.1, ease: [0.65, 0, 0.35, 1] }, fillOpacity: { delay: 1, duration: 0.5 } }}
        />
      ) : (
        <path d={d} strokeWidth={1} strokeLinejoin="round" className="stroke-line" style={{ fill: colour }} />
      )}
    </svg>
  );
}
