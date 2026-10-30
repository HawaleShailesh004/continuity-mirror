import type { ReactNode } from "react";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/*
 * Rounded photo on a peach backdrop: the photo is the hero, UI recedes.
 * Generated results (`generated`) always get the StyleDirectionLabel under
 * them and carry data-generated-image for the guardrail. `sample` adds the
 * "Sample person" badge shown in demo mode. Images are local blobs or static
 * files, so plain <img> (next/image has nothing to optimise).
 */
export function PhotoFrame({
  src,
  alt,
  generated = false,
  sample = false,
  hideLabel = false,
  aspect = "aspect-3/4",
  position = "object-[50%_20%]",
  className,
  children,
}: {
  src: string;
  /** Describe the look: "Preview: chin-length bob, your own colour". */
  alt: string;
  generated?: boolean;
  sample?: boolean;
  /** Only when a parent already shows the label for this same image. */
  hideLabel?: boolean;
  aspect?: string;
  position?: string;
  className?: string;
  /** Overlay content (progress, badges). */
  children?: ReactNode;
}) {
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className={cn("relative overflow-hidden rounded-image bg-peach", aspect)}>
        {/* An empty src makes the browser fetch the whole page again: wait for the image URL instead. */}
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className={cn("absolute inset-0 size-full object-cover", position)}
            data-generated-image={generated ? "" : undefined}
          />
        )}
        {sample && (
          <span className="absolute bottom-3 left-3 rounded-full bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold text-text-soft">
            {copy.common.sampleBadge}
          </span>
        )}
        {children}
      </div>
      {generated && !hideLabel && <StyleDirectionLabel />}
    </figure>
  );
}
