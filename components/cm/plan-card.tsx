import { XIcon } from "lucide-react";
import { PhotoFrame } from "./photo-frame";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import type { StyleCatalogItem } from "@/lib/catalog";

/** A saved look in the plan: its preview, name, upkeep and price range. Removing it needs a deliberate tap. */
export function PlanCard({
  style,
  imageSrc,
  imageAlt,
  notes = [],
  badge,
  onRemove,
}: {
  style: StyleCatalogItem;
  imageSrc: string;
  imageAlt: string;
  /** Marks a look that is a stage of the regrowth roadmap, e.g. "Regrowth · 6 months". */
  badge?: string;
  /** Gentle flags from the user's own filters, e.g. "Takes more upkeep than you chose". */
  notes?: readonly string[];
  onRemove: () => void;
}) {
  return (
    <li className="flex gap-4 rounded-card bg-surface p-3">
      <PhotoFrame src={imageSrc} alt={imageAlt} generated hideLabel className="w-24 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        {badge && <span className="self-start rounded-full bg-peach px-3 py-1 text-xs font-semibold text-text-soft">{badge}</span>}
        <h3 className="text-base">{style.label}</h3>
        <p className="text-sm text-text-soft">
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
      <button
        type="button"
        onClick={onRemove}
        aria-label={copy.plan.removeLook(style.label)}
        className="flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-bg text-text-muted"
      >
        <XIcon aria-hidden="true" className="size-5" />
      </button>
    </li>
  );
}
