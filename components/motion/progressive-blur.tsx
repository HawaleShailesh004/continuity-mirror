/*
 * ProgressiveBlur: layered backdrop blur that fades in one direction
 * (the "developing photo" card while a route generates, moment 5).
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: plain divs (nothing animates here, so no motion dependency);
 * stacked layers are aria-hidden.
 * Plan risk §14: drop it on low-end devices (hardwareConcurrency ≤ 4) in F7.
 */
import { cn } from "@/lib/utils";

const ANGLES = { top: 0, right: 90, bottom: 180, left: 270 } as const;

export type ProgressiveBlurProps = {
  direction?: keyof typeof ANGLES;
  blurLayers?: number;
  /** px of blur added per layer. */
  blurIntensity?: number;
  className?: string;
};

export function ProgressiveBlur({
  direction = "bottom",
  blurLayers = 8,
  blurIntensity = 0.25,
  className,
}: ProgressiveBlurProps) {
  const layers = Math.max(blurLayers, 2);
  const segment = 1 / (blurLayers + 1);
  const angle = ANGLES[direction];

  return (
    <div aria-hidden="true" className={cn("pointer-events-none relative", className)}>
      {Array.from({ length: layers }).map((_, index) => {
        const stops = [index, index + 1, index + 2, index + 3]
          .map((step, i) => `rgb(0 0 0 / ${i === 1 || i === 2 ? 1 : 0}) ${step * segment * 100}%`)
          .join(", ");
        const mask = `linear-gradient(${angle}deg, ${stops})`;
        const blur = `blur(${index * blurIntensity}px)`;
        return (
          <div
            key={index}
            className="absolute inset-0 rounded-[inherit]"
            style={{
              maskImage: mask,
              WebkitMaskImage: mask,
              backdropFilter: blur,
              WebkitBackdropFilter: blur,
            }}
          />
        );
      })}
    </div>
  );
}
