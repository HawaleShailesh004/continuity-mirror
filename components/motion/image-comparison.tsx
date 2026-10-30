"use client";
/*
 * ImageComparison: "You, before" vs a route, with a drag handle
 * (CompareView, signature moment 6).
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes:
 *  - keyboard + screen reader: a visually hidden native range input drives
 *    the position (arrow keys, Home/End) and announces `getValueText`;
 *  - pointer events with capture instead of mouse/touch pairs, and
 *    `touch-action: pan-y` so vertical page scroll still works on phones;
 *  - `hint`: the handle glides 50 → 35 → 50 once to teach the gesture;
 *  - sides named `before` (left of the handle) / `after` (right);
 *  - `m` components, spring.ui, reduced motion → no hint, no spring.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import { ease, spring } from "@/lib/client/motion";
import { useCalmMotion } from "./motion-provider";

const Ctx = createContext<MotionValue<number> | null>(null);

function usePosition() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ImageComparison parts must be inside <ImageComparison>");
  return ctx;
}

export type ImageComparisonProps = {
  children: ReactNode;
  className?: string;
  /** Accessible name of the slider, e.g. "Compare with you, before". */
  label: string;
  /** Spoken value, e.g. (p) => `Showing ${100 - p}% new style`. */
  getValueText: (position: number) => string;
  /** Play the one-time teaching glide. */
  hint?: boolean;
  /** Start position, % from the left. */
  defaultPosition?: number;
};

export function ImageComparison({
  children,
  className,
  label,
  getValueText,
  hint = false,
  defaultPosition = 50,
}: ImageComparisonProps) {
  const calm = useCalmMotion();
  const target = useMotionValue(defaultPosition);
  const smooth = useSpring(target, spring.ui);
  const [position, setPosition] = useState(defaultPosition);
  const [dragging, setDragging] = useState(false);

  useMotionValueEvent(target, "change", (v) => setPosition(Math.round(v)));

  useEffect(() => {
    if (!hint || calm) return;
    const controls = animate(target, [defaultPosition, 35, defaultPosition], {
      duration: 1.6,
      ease: ease.inOut,
      delay: 0.6,
    });
    return () => controls.stop();
  }, [hint, calm, target, defaultPosition]);

  const setFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    target.set(Math.min(100, Math.max(0, pct)));
  };

  return (
    <Ctx.Provider value={calm ? target : smooth}>
      <div
        className={cn(
          "relative touch-pan-y overflow-hidden select-none",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus",
          className,
        )}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFromPointer(e);
        }}
        onPointerMove={(e) => dragging && setFromPointer(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {children}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          aria-label={label}
          aria-valuetext={getValueText(position)}
          onChange={(e) => target.set(Number(e.target.value))}
          className="sr-only"
        />
      </div>
    </Ctx.Provider>
  );
}

export function ImageComparisonImage({
  src,
  alt,
  side,
  className,
  dataAttrs,
}: {
  src: string;
  alt: string;
  /** `before` shows left of the handle, `after` right of it. */
  side: "before" | "after";
  className?: string;
  /** Extra data-* attributes, e.g. the guardrail marker for generated images. */
  dataAttrs?: Record<string, string>;
}) {
  const position = usePosition();
  const clipPath = useTransform(position, (v) =>
    side === "before" ? `inset(0 ${100 - v}% 0 0)` : `inset(0 0 0 ${v}%)`,
  );
  // Results are local object URLs from IndexedDB: next/image adds nothing here.
  return (
    <m.img
      src={src}
      alt={alt}
      draggable={false}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      style={{ clipPath }}
      {...dataAttrs}
    />
  );
}

export function ImageComparisonSlider({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const position = usePosition();
  const left = useTransform(position, (v) => `${v}%`);
  return (
    <m.div
      aria-hidden="true"
      className={cn("absolute top-0 bottom-0 w-0.5 -translate-x-1/2 cursor-ew-resize", className)}
      style={{ left }}
    >
      {children}
    </m.div>
  );
}
