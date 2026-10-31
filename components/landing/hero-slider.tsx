"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { landing } from "@/content/copy/landing";

const reducedMotion = () => {
  const root = document.documentElement;
  if (root.dataset.motion === "reduce") return true;
  return root.dataset.motion !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export type HeroLook = { id: string; src: string; short: string; label: string; alt: string; note?: string };

/**
 * Hero (signature moment 1): "You, before" against genuine results for the same sample person, in one
 * slider. The "after" side switches between four real previews (Closest, Easier, New chapter, Regrowth)
 * with a cross-fade, chosen by the pills below. It starts on the most visible change, glides once
 * (50 → 35 → 50) to show it can be moved, then steps through the looks every 3.5 s until anyone touches
 * the hero. It never auto-advances with reduced motion, while hovered, or in a hidden tab.
 * Mouse, touch and keyboard (a native range input, arrow keys, Home/End) all work.
 * Plain pointer events and CSS: the landing page keeps a small script budget, so this island takes its
 * words as props and imports no copy beyond the slider labels (the server wrapper, hero-visual.tsx, owns
 * them, and renders the StyleDirectionLabel for the generated images below this slider).
 */
export function HeroSlider({
  beforeAlt,
  beforeLabel,
  sampleLabel,
  looks,
  looksLabel,
  start,
}: {
  beforeAlt: string;
  beforeLabel: string;
  sampleLabel: string;
  looks: readonly HeroLook[];
  looksLabel: string;
  start: number;
}) {
  const [pos, setPos] = useState(50);
  const [index, setIndex] = useState(start);
  // The other looks are mounted after the first paint so they never compete with the LCP image.
  const [extras, setExtras] = useState(false);
  const touched = useRef(false);
  const dragging = useRef(false);
  const stopped = useRef(false);
  const paused = useRef(false);
  const pills = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const extrasTimer = setTimeout(() => setExtras(true), 1500);
    return () => clearTimeout(extrasTimer);
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    let t0 = 0;
    const DURATION = 1800;
    const begin = setTimeout(() => {
      const tick = (now: number) => {
        if (touched.current) return;
        t0 ||= now;
        const p = Math.min(1, (now - t0) / DURATION);
        const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        setPos(50 - 15 * Math.sin(Math.PI * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 1100);
    return () => {
      clearTimeout(begin);
      cancelAnimationFrame(frame);
    };
  }, []);

  // After the glide, walk through the looks until the person takes over.
  useEffect(() => {
    if (reducedMotion()) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const begin = setTimeout(() => {
      interval = setInterval(() => {
        if (stopped.current || paused.current || document.visibilityState === "hidden") return;
        setExtras(true);
        setIndex((i) => (i + 1) % looks.length);
      }, 3500);
    }, 3200);
    return () => {
      clearTimeout(begin);
      clearInterval(interval);
    };
  }, [looks.length]);

  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    touched.current = true;
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  const choose = (i: number, focus = false) => {
    stopped.current = true;
    setExtras(true);
    setIndex(i);
    if (focus) pills.current[i]?.focus();
  };
  const onPillKey = (e: React.KeyboardEvent, i: number) => {
    const last = looks.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i === last ? 0 : i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i === 0 ? last : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(next, true);
  };

  const look = looks[index]!;

  return (
    <div
      onPointerDownCapture={() => (stopped.current = true)}
      onKeyDownCapture={() => (stopped.current = true)}
      onFocusCapture={() => (stopped.current = true)}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
    >
      <div
        className="relative aspect-4/5 max-h-[56vh] touch-pan-y cursor-ew-resize overflow-hidden rounded-card bg-peach shadow-raised select-none has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-focus md:aspect-3/4 md:max-h-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {looks.map((l, i) =>
          i === start || extras ? (
            <Image
              key={l.id}
              src={l.src}
              alt={i === index ? l.alt : ""}
              aria-hidden={i !== index}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className={`object-cover object-[50%_22%] transition-opacity duration-500 ${i === index ? "opacity-100" : "opacity-0"}`}
              data-generated-image=""
            />
          ) : null,
        )}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Image
            src="/mock/personas/amara.jpg"
            alt={beforeAlt}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-[50%_22%]"
          />
        </div>

        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-on-photo shadow-pill" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 left-1/2 size-11 -translate-1/2 rounded-full border-2 border-on-photo bg-surface-raised/40 shadow-raised backdrop-blur-sm" />
        </span>

        <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">{beforeLabel}</span>
        <span data-testid="hero-look" className="pointer-events-none absolute top-3 right-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">
          {look.label}
        </span>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">{sampleLabel}</span>
        {look.note && (
          <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">{look.note}</span>
        )}

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(pos)}
          aria-label={landing.heroSliderLabel(look.label)}
          aria-valuetext={landing.heroSliderValue(Math.round(100 - pos))}
          onChange={(e) => {
            touched.current = true;
            setPos(Number(e.target.value));
          }}
          className="sr-only"
        />
      </div>

      <div role="radiogroup" aria-label={looksLabel} className="mt-3 flex gap-1 rounded-full bg-surface p-1">
        {looks.map((l, i) => (
          <button
            key={l.id}
            ref={(el) => {
              pills.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === index}
            aria-label={l.label}
            tabIndex={i === index ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={(e) => onPillKey(e, i)}
            className={`flex h-11 flex-1 items-center justify-center rounded-full px-1 text-xs font-semibold whitespace-nowrap md:px-2 md:text-sm ${i === index ? "bg-surface-raised text-text shadow-pill" : "text-text-soft"}`}
          >
            {l.short}
          </button>
        ))}
      </div>
    </div>
  );
}
