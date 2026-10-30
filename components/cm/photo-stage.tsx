import type { ReactNode } from "react";
import { PhotoFrame } from "./photo-frame";
import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/*
 * The big photo, staged: a soft glow behind it, a fall-off at its foot, label
 * chips on the photo and, optionally, the person's own "You, before" photo
 * docked in the corner so what changed is always one glance away. Built on
 * PhotoFrame, so a generated image keeps its marker attribute and the
 * "Style direction, not exact wig fit" label underneath.
 */
export function PhotoStage({
  src,
  alt,
  generated = false,
  sample = false,
  chips = [],
  before,
  aspect,
  position,
  className,
  children,
}: {
  src: string;
  alt: string;
  generated?: boolean;
  sample?: boolean;
  /** Short facts about this photo ("Same length, smoother ends"). */
  chips?: readonly string[];
  /** The baseline, docked bottom-right. */
  before?: string;
  aspect?: string;
  position?: string;
  className?: string;
  /** More overlay content (progress, a slider handle). */
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      <div aria-hidden="true" className="bg-morning-glow absolute -inset-x-10 -inset-y-8 -z-10 opacity-80" />
      <PhotoFrame src={src} alt={alt} generated={generated} sample={sample && !before} aspect={aspect} position={position}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-stage" />
        {chips.length > 0 && (
          <ul className="absolute top-3 left-3 flex max-w-[75%] flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip} className="rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft backdrop-blur-sm">
                {chip}
              </li>
            ))}
          </ul>
        )}
        {before && (
          <figure className="absolute right-3 bottom-3 flex w-[22%] max-w-28 min-w-18 flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={before}
              alt={copy.common.youBefore}
              className="aspect-3/4 w-full rounded-2xl border-2 border-on-photo object-cover object-[50%_20%] shadow-pill"
            />
            <figcaption className="rounded-full bg-surface-raised/90 px-2 py-0.5 text-xs font-semibold text-text-soft">
              {copy.common.youBefore}
            </figcaption>
          </figure>
        )}
        {children}
      </PhotoFrame>
    </div>
  );
}
