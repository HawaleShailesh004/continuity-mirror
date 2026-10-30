"use client";

import { RadioGroup } from "radix-ui";
import { BrowGlyph } from "./brow-glyph";
import { cn } from "@/lib/utils";
import type { GlyphFamily, GlyphThickness } from "@/lib/client/brow-path";

export type BrowShapeOption = { id: string; name: string; family: GlyphFamily; thickness: GlyphThickness; thicknessLabel: string };

/*
 * Brow shapes as small drawings with their plain names ("Soft arch, gentle").
 * Radix RadioGroup supplies the semantics and arrow keys; the catalog code
 * behind each shape is never shown.
 */
export function BrowShapePicker({
  label,
  options,
  value,
  onValueChange,
  colour,
}: {
  label: string;
  options: readonly BrowShapeOption[];
  value: string;
  onValueChange: (id: string) => void;
  colour: string;
}) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={onValueChange} className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <RadioGroup.Item
            key={o.id}
            value={o.id}
            aria-label={`${o.name}, ${o.thicknessLabel}`}
            className={cn(
              "flex min-h-11 flex-col gap-1.5 rounded-card bg-surface px-4 pt-3 pb-3 text-left transition-[box-shadow,background-color] duration-(--dur-base)",
              on ? "bg-selected ring-2 ring-action" : "hover:bg-selected/60",
            )}
          >
            <BrowGlyph family={o.family} thickness={o.thickness} colour={colour} className="h-9" />
            <span className="text-sm leading-tight font-semibold">{o.name}</span>
            <span className="text-xs text-text-muted">{o.thicknessLabel}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
