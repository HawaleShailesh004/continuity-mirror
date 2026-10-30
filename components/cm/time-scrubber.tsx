"use client";

import { useEffect, useId, useRef } from "react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

export type TimeStage = { key: string; when: string; short: string; src: string; alt: string };

/*
 * Moment 6: a scrubber across time. The three real results sit on top of each
 * other and cross-fade as the slider (or a time button) moves between them;
 * "You, before" stays docked in the corner. On first view it glides once from
 * the first stage to the last to teach the gesture (never with reduced motion),
 * and stops the instant the person touches anything. The slider is a native
 * range input, so arrow keys, Home/End and screen readers work as they should.
 */
export function TimeScrubber({
  stages,
  beforeSrc,
  active,
  onActive,
  hint = true,
  className,
}: {
  stages: readonly TimeStage[];
  beforeSrc: string;
  active: number;
  onActive: (index: number) => void;
  hint?: boolean;
  className?: string;
}) {
  const calm = useCalmMotion();
  const id = useId();
  const touched = useRef(false);
  const t = copy.regrowth;

  useEffect(() => {
    if (!hint || calm) return;
    const timers = stages.slice(1).map((_, i) =>
      setTimeout(() => {
        if (!touched.current) onActive(i + 1);
      }, 1500 + i * 1500),
    );
    return () => timers.forEach(clearTimeout);
    // Plays once per mount: `active` and the callback are deliberately not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (i: number) => {
    touched.current = true;
    onActive(i);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="relative isolate md:max-w-sm">
        <div aria-hidden="true" className="bg-morning-glow absolute -inset-x-10 -inset-y-8 -z-10 opacity-80" />
        <div className="relative aspect-3/4 overflow-hidden rounded-image bg-peach shadow-raised">
          {stages.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.key}
              src={s.src}
              alt={i === active ? s.alt : ""}
              aria-hidden={i === active ? undefined : true}
              data-generated-image=""
              className={cn(
                "absolute inset-0 size-full object-cover object-[50%_20%] transition-opacity duration-(--dur-reveal) ease-out",
                i === active ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-stage" />
          <span className="absolute top-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">
            {stages[active]?.when}
          </span>
          <figure className="absolute right-3 bottom-3 flex w-[22%] max-w-28 min-w-18 flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeSrc} alt={copy.compare.altBefore} className="aspect-3/4 w-full rounded-2xl border-2 border-on-photo object-cover object-[50%_20%] shadow-pill" />
            <figcaption className="rounded-full bg-surface-raised/90 px-2 py-0.5 text-xs font-semibold text-text-soft">{copy.common.youBefore}</figcaption>
          </figure>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <StyleDirectionLabel />
        </div>
      </div>

      <div className="flex flex-col gap-1 md:max-w-sm">
        <label htmlFor={id} className="text-sm font-semibold text-text-soft">
          {t.scrubLabel}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={stages.length - 1}
          step={1}
          value={active}
          onChange={(e) => set(Number(e.target.value))}
          aria-valuetext={stages[active]?.when}
          className="h-11 w-full cursor-pointer accent-action"
        />
        <ul className="flex justify-between" aria-label={t.scrubStops}>
          {stages.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => set(i)}
                aria-pressed={i === active}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm font-semibold transition-colors duration-(--dur-quick)",
                  i === active ? "bg-selected text-text" : "text-text-soft",
                )}
              >
                {s.short}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
