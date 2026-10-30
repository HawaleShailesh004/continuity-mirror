import { XIcon } from "lucide-react";
import { PhotoFrame } from "./photo-frame";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import type { StyleCatalogItem } from "@/lib/catalog";

/**
 * A saved look in the lookbook: a large preview, its name, the words to ask for
 * (when we have them), upkeep and price range. Removing it needs a deliberate tap.
 */
export function PlanCard({
  style,
  imageSrc,
  imageAlt,
  askLine,
  notes = [],
  badge,
  onRemove,
}: {
  style: StyleCatalogItem;
  imageSrc: string;
  imageAlt: string;
  /** What to say at a wig shop, from the person's own answers (lib/client/ask-for.ts). */
  askLine?: string;
  /** Marks a look that is a stage of the regrowth roadmap, e.g. "Regrowth · 6 months". */
  badge?: string;
  /** Gentle flags from the user's own filters, e.g. "Takes more upkeep than you chose". */
  notes?: readonly string[];
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-3">
      <div className="relative">
        <PhotoFrame src={imageSrc} alt={imageAlt} generated hideLabel aspect="aspect-4/5" />
        {badge && (
          <span className="absolute top-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">{badge}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={copy.plan.removeLook(style.label)}
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-surface-raised/90 text-text-muted backdrop-blur-sm"
        >
          <XIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 px-1">
        <h3 className="font-display text-lg leading-snug font-medium">{style.label}</h3>
        {askLine && (
          <p className="text-sm text-text-soft">
            <span className="text-text-muted">{copy.plan.askFor}: </span>
            <span className="font-semibold text-text">“{askLine}”</span>
          </p>
        )}
        <p className="text-sm text-text-muted">
          {copy.plan.careEffort[style.careEffort]} · {copy.plan.priceBand[style.priceBand]}
        </p>
        {notes.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <StyleDirectionLabel />
      </div>
    </li>
  );
}
