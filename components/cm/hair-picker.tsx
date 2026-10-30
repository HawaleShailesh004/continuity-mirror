"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PipetteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

const PATCH = 9; // px, in the photo's own pixels
const LOUPE = 96; // px on screen
const ZOOM_SPAN = 24; // photo px shown in the loupe (4× zoom)

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Pointer position on screen (x, y, frame width w) and in the photo's own pixels (nx, ny). */
type Spot = { x: number; y: number; w: number; nx: number; ny: number };

/*
 * "Tap your hair": the exact colour of the user's own hair, read from their
 * own photo (a 9×9 px average, so one stray strand or highlight doesn't
 * skew it). It drives the Hair Color pass that keeps every route in their own
 * colour (YouCam facts, stage 2). Press the button, then touch or drag over
 * your hair; a loupe shows what is under your finger; lifting commits.
 * The colour-family chip is the always-available fallback (the picker needs a
 * pointer), so this is an enhancement, never a gate.
 */
export function HairPicker({
  src,
  alt,
  value,
  fallbackHex,
  onChange,
}: {
  src: string;
  alt: string;
  /** Picked colour, if any. */
  value?: string;
  /** Colour-family default, shown until the user picks. */
  fallbackHex: string;
  onChange: (hex: string | undefined) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const source = useRef<HTMLCanvasElement | null>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [picking, setPicking] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  // The last colour picked from the photo, so the user can switch between it and the default.
  const [lastPicked, setLastPicked] = useState<string | undefined>(value);
  const [ratio, setRatio] = useState(3 / 4);

  // Copy the photo's pixels once, at natural size, so sampling is exact.
  const prepare = useCallback(() => {
    const el = img.current;
    if (!el || !el.naturalWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    canvas.getContext("2d", { willReadFrequently: true })?.drawImage(el, 0, 0);
    source.current = canvas;
    setRatio(el.naturalWidth / el.naturalHeight);
  }, []);

  useEffect(() => {
    if (img.current?.complete) prepare();
  }, [prepare, src]);

  const locate = (event: React.PointerEvent): Spot | null => {
    const rect = frame.current?.getBoundingClientRect();
    const canvas = source.current;
    if (!rect || !canvas) return null;
    const fx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x: fx * rect.width, y: fy * rect.height, w: rect.width, nx: fx * canvas.width, ny: fy * canvas.height };
  };

  // Redraw the loupe whenever the spot moves.
  useEffect(() => {
    const canvas = source.current;
    const view = loupe.current;
    if (!spot || !canvas || !view) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(canvas, spot.nx - ZOOM_SPAN / 2, spot.ny - ZOOM_SPAN / 2, ZOOM_SPAN, ZOOM_SPAN, 0, 0, LOUPE, LOUPE);
    const box = (PATCH / ZOOM_SPAN) * LOUPE;
    ctx.strokeStyle = "#ffffff"; // drawn on pixels, not themed: must read on any hair colour
    ctx.lineWidth = 2;
    ctx.strokeRect((LOUPE - box) / 2, (LOUPE - box) / 2, box, box);
    ctx.strokeStyle = "rgb(0 0 0 / 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect((LOUPE - box) / 2 - 1.5, (LOUPE - box) / 2 - 1.5, box + 3, box + 3);
  }, [spot]);

  const sample = (s: Spot) => {
    const canvas = source.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const x = Math.round(Math.min(canvas.width - PATCH, Math.max(0, s.nx - PATCH / 2)));
    const y = Math.round(Math.min(canvas.height - PATCH, Math.max(0, s.ny - PATCH / 2)));
    const { data } = ctx.getImageData(x, y, PATCH, PATCH);
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
    }
    const hex = toHex(r / n, g / n, b / n);
    setLastPicked(hex);
    onChange(hex);
  };

  const shown = value ?? fallbackHex;
  // Keep the loupe on screen: above the finger, flipped below near the top edge.
  const loupeStyle = spot
    ? {
        left: Math.min(Math.max(spot.x - LOUPE / 2, 4), spot.w - LOUPE - 4),
        top: spot.y - LOUPE - 28 < 0 ? spot.y + 28 : spot.y - LOUPE - 28,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frame}
        data-vaul-no-drag=""
        style={{ aspectRatio: ratio }}
        className={cn(
          "relative max-h-80 w-full max-w-60 self-center overflow-hidden rounded-image bg-peach",
          picking && "cursor-crosshair touch-none ring-2 ring-action",
        )}
        onPointerDown={(e) => {
          if (!picking) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setSpot(locate(e));
        }}
        onPointerMove={(e) => picking && e.buttons !== 0 && setSpot(locate(e))}
        onPointerUp={(e) => {
          if (!picking) return;
          const s = locate(e);
          if (s) sample(s);
          setSpot(null);
          setPicking(false);
        }}
        onPointerCancel={() => setSpot(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img}
          src={src}
          alt={alt}
          onLoad={prepare}
          draggable={false}
          className="size-full object-cover select-none"
        />
        {spot && (
          <canvas
            ref={loupe}
            width={LOUPE}
            height={LOUPE}
            aria-label={copy.snapshot.tapHairLoupe}
            role="img"
            style={loupeStyle}
            className="pointer-events-none absolute size-24 rounded-full border-2 border-on-photo shadow-raised"
          />
        )}
      </div>

      <div className="flex items-center gap-3 rounded-card bg-surface p-4">
        <span
          aria-hidden="true"
          className="size-12 shrink-0 rounded-full border border-line"
          style={{ background: shown }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-semibold">{copy.snapshot.tapHairTitle}</p>
          <p className="text-sm text-text-soft">
            {picking ? copy.snapshot.tapHairActive : value ? copy.snapshot.tapHairPicked : copy.snapshot.tapHairAdvice}
          </p>
        </div>
        {value && !picking ? (
          <Button variant="secondary" className="h-11 px-4 text-sm" onClick={() => setPicking(true)}>
            <PipetteIcon aria-hidden="true" className="size-4" />
            {copy.snapshot.tapHairReset}
          </Button>
        ) : (
          <Button
            variant={picking ? "secondary" : "primary"}
            className="h-11 px-4 text-sm"
            aria-pressed={picking}
            onClick={() => setPicking((p) => !p)}
          >
            <PipetteIcon aria-hidden="true" className="size-4" />
            {copy.snapshot.tapHairCta}
          </Button>
        )}
      </div>

      {lastPicked && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text-soft">{copy.snapshot.tapHairChoose}</p>
          <ChoiceChips
            label={copy.snapshot.tapHairChoose}
            value={value ? "picked" : "default"}
            onValueChange={(v) => onChange(v === "picked" ? lastPicked : undefined)}
            options={[
              { value: "picked", label: copy.snapshot.tapHairUsePicked, swatch: lastPicked },
              { value: "default", label: copy.snapshot.tapHairUseDefault, swatch: fallbackHex },
            ]}
          />
        </div>
      )}
    </div>
  );
}
