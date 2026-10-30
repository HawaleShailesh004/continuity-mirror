/*
 * AnimatedCircularProgressBar: ring for the 3-2-1 capture countdown
 * (signature moment 3) and quiet progress.
 * Adapted from Magic UI (MIT), see docs/THIRD_PARTY.md.
 * Changes: token colours via stroke utilities instead of colour props;
 * children in the centre instead of a forced percentage; no dependency on
 * tailwindcss-animate; transition length is a prop (reduced motion is
 * handled globally in app/globals.css).
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AnimatedCircularProgressBarProps = {
  value: number;
  min?: number;
  max?: number;
  /** Centre content (countdown digit, icon). Decorative unless labelled. */
  children?: ReactNode;
  className?: string;
  /** e.g. "stroke-action". */
  primaryClassName?: string;
  /** e.g. "stroke-selected". */
  secondaryClassName?: string;
  /** CSS time for each step, e.g. "1s" for a countdown. */
  transitionLength?: string;
  /** When set, the ring is exposed as a progressbar with this name. */
  label?: string;
};

const CIRCUMFERENCE = 2 * Math.PI * 45;

export function AnimatedCircularProgressBar({
  value,
  min = 0,
  max = 100,
  children,
  className,
  primaryClassName = "stroke-action",
  secondaryClassName = "stroke-selected",
  transitionLength = "1s",
  label,
}: AnimatedCircularProgressBarProps) {
  const percent = Math.round(((value - min) / (max - min)) * 100);
  const a11y = label
    ? {
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": min,
        "aria-valuemax": max,
        "aria-valuenow": value,
      }
    : { "aria-hidden": true as const };

  return (
    <div
      {...a11y}
      className={cn("relative size-40 text-2xl font-semibold", className)}
      style={
        {
          "--circle-size": "100px",
          "--circumference": CIRCUMFERENCE,
          "--percent-to-px": `${CIRCUMFERENCE / 100}px`,
          "--gap-percent": "5",
          "--offset-factor": "0",
          "--transition-length": transitionLength,
          "--percent-to-deg": "3.6deg",
          transform: "translateZ(0)",
        } as CSSProperties
      }
    >
      <svg fill="none" className="size-full" viewBox="0 0 100 100" aria-hidden="true">
        {percent <= 90 && percent >= 0 && (
          <circle
            cx="50"
            cy="50"
            r="45"
            strokeWidth="10"
            strokeLinecap="round"
            className={secondaryClassName}
            style={
              {
                "--stroke-percent": 90 - percent,
                "--offset-factor-secondary": "calc(1 - var(--offset-factor))",
                strokeDasharray:
                  "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
                transform:
                  "rotate(calc(1turn - 90deg - (var(--gap-percent) * var(--percent-to-deg) * var(--offset-factor-secondary)))) scaleY(-1)",
                transition: "all var(--transition-length) linear",
                transformOrigin: "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
              } as CSSProperties
            }
          />
        )}
        <circle
          cx="50"
          cy="50"
          r="45"
          strokeWidth="10"
          strokeLinecap="round"
          className={primaryClassName}
          style={
            {
              "--stroke-percent": percent,
              strokeDasharray:
                "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
              transition: "stroke-dasharray var(--transition-length) linear, transform var(--transition-length) linear",
              transform:
                "rotate(calc(-90deg + var(--gap-percent) * var(--offset-factor) * var(--percent-to-deg)))",
              transformOrigin: "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
            } as CSSProperties
          }
        />
      </svg>
      {children != null && (
        <span className="absolute inset-0 m-auto flex size-fit items-center justify-center">
          {children}
        </span>
      )}
    </div>
  );
}
