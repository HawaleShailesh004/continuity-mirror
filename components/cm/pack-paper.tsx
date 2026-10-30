"use client";

import * as m from "motion/react-m";
import type { Variants } from "motion/react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { PhotoFrame } from "./photo-frame";
import { StyleDirectionLabel } from "./style-direction-label";
import { copy } from "@/content/copy";
import { askForLine } from "@/lib/client/ask-for";
import type { PlanLook } from "@/lib/client/use-plan";
import type { IdentitySnapshot } from "@/lib/contracts";
import { cuesFromSnapshot } from "@/lib/client/cues";
import { ease } from "@/lib/client/motion";

const pdf = copy.exportPack.pdf;

/*
 * Moment 8: the pack "prints". A sheet slides out of a slot, then its lines
 * fill in one after another. It is drawn from the same data the PDF is made
 * from (the person's photo, their saved looks, what to ask for), so it shows
 * what the PDF says; it is a preview, not a picture of the PDF's pixels. With
 * reduced motion the sheet simply fades in whole.
 */
export function PackPaper({
  beforeSrc,
  looks,
  snapshot,
  date,
  sample,
}: {
  beforeSrc?: string;
  looks: readonly PlanLook[];
  snapshot: IdentitySnapshot | null | undefined;
  date: string;
  sample: boolean;
}) {
  const calm = useCalmMotion();
  const cues = snapshot ? cuesFromSnapshot(snapshot).map((c) => c.label) : [];
  const shown = looks.slice(0, 2);

  const sheet: Variants = calm
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.15 } } }
    : {
        hidden: { y: "-96%" },
        visible: { y: 0, transition: { duration: 1.3, ease: ease.out, when: "beforeChildren", staggerChildren: 0.09, delayChildren: 0.2 } },
      };
  const line: Variants = calm
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.out } } };

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* The slot the sheet comes out of. */}
      <div aria-hidden="true" className="relative z-10 h-3 rounded-full bg-text-muted/50 shadow-pill" />
      <div className="-mt-1.5 overflow-hidden px-3 pb-2">
        <m.div
          variants={sheet}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3 rounded-b-2xl bg-paper px-5 pt-6 pb-5 text-paper-ink shadow-raised"
        >
          <m.div variants={line} className="flex items-baseline justify-between gap-3">
            <div className="flex flex-col">
              <p className="font-display text-lg leading-tight font-medium">{pdf.heading}</p>
              <p className="text-xs text-paper-muted">{pdf.subheading}</p>
            </div>
            <p className="text-xs text-paper-muted">{date}</p>
          </m.div>

          <m.div variants={line} className="grid grid-cols-3 gap-2">
            {beforeSrc && (
              <figure className="flex flex-col gap-1">
                <PhotoFrame src={beforeSrc} alt={copy.compare.altBefore} aspect="aspect-3/4" />
                <figcaption className="text-xs font-semibold">{pdf.before}</figcaption>
              </figure>
            )}
            {shown.map((l) => (
              <figure key={l.row.clientRequestId} className="flex flex-col gap-1">
                <PhotoFrame src={l.imageUrl ?? ""} alt={copy.compare.alt(l.style.label, l.ownColour)} generated hideLabel aspect="aspect-3/4" />
                <figcaption className="text-xs font-semibold">{l.style.label}</figcaption>
              </figure>
            ))}
          </m.div>
          <m.div variants={line}>
            <StyleDirectionLabel />
          </m.div>

          {cues.length > 0 && (
            <m.div variants={line} className="flex flex-col gap-1">
              <p className="text-xs font-semibold">{pdf.words}</p>
              <p className="text-xs text-paper-muted">{cues.join(" · ")}</p>
            </m.div>
          )}

          <m.div variants={line} className="flex flex-col gap-1">
            <p className="text-xs font-semibold">{pdf.ask}</p>
            <ul className="flex flex-col gap-1">
              {shown.map((l) => (
                <li key={l.row.clientRequestId} className="text-xs text-paper-muted">
                  “{askForLine(l.style, snapshot, l.ownColour)}”
                </li>
              ))}
            </ul>
          </m.div>

          <m.p variants={line} className="border-t border-line pt-2 text-xs text-paper-muted">
            {sample ? `${pdf.sample}. ` : ""}
            {pdf.footer}
          </m.p>
        </m.div>
      </div>
    </div>
  );
}
