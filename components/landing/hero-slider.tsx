"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { landing } from "@/content/copy/landing";

const reducedMotion = () => {
  const root = document.documentElement;
  if (root.dataset.motion === "reduce") return true;
  return root.dataset.motion !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/**
 * Hero (signature moment 1): "You, before" and a real "Closest to me" preview
 * of the same sample person in one slider. It glides once, 50 → 35 → 50, to
 * show it can be moved, and stops the moment anyone touches it. Mouse, touch
 * and keyboard (a native range input, arrow keys, Home/End) all work.
 * Plain pointer events and CSS: the landing page keeps a small script budget, so this island
 * takes its words as props and imports no copy (the server wrapper, hero-visual.tsx, owns them,
 * and renders the StyleDirectionLabel for the generated image below this slider).
 */
export function HeroSlider({
  beforeAlt,
  afterAlt,
  beforeLabel,
  afterLabel,
  sampleLabel,
}: {
  beforeAlt: string;
  afterAlt: string;
  beforeLabel: string;
  afterLabel: string;
  sampleLabel: string;
}) {  const [pos, setPos] = useState(50);
  const touched = useRef(false);
  const dragging = useRef(false);

  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    let start = 0;
    const DURATION = 1800;
    const begin = setTimeout(() => {
      const tick = (now: number) => {
        if (touched.current) return;
        start ||= now;
        const p = Math.min(1, (now - start) / DURATION);
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

  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    touched.current = true;
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  return (
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
        <Image
          src="/demo/amara/closest.jpg"
          alt={afterAlt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover object-[50%_22%]"
          data-generated-image=""
        />
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
        <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-bold text-text">{afterLabel}</span>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">{sampleLabel}</span>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(pos)}
          aria-label={landing.heroSliderLabel}
          aria-valuetext={landing.heroSliderValue(Math.round(100 - pos))}
          onChange={(e) => {
            touched.current = true;
            setPos(Number(e.target.value));
          }}
          className="sr-only"
        />
    </div>
  );
}
