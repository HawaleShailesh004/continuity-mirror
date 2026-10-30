"use client";

import type { ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CheckCircle2Icon } from "lucide-react";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { LocalTime } from "./local-time";
import { formatDateTimeUtc } from "@/lib/client/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { copy } from "@/content/copy";
import { dissolve, dur, fadeRise } from "@/lib/client/motion";
import type { PrivacyReceipt as Receipt } from "@/lib/contracts";

function Section({ title, children, body }: { title: string; body: string; children?: ReactNode }) {
  return (
    <>
      <h2 className="text-lg">{title}</h2>
      <p className="text-text-soft">{body}</p>
      {children}
    </>
  );
}

/*
 * A true receipt: what's on this device, what went to YouCam (IDs and times),
 * and what's on our server (short-lived records, never photos). Delete
 * everything dissolves the list, then shows a calm done state. The parent does
 * the actual deleting (DELETE /api/baselines/:id, Dexie clear).
 */
export function PrivacyReceipt({
  receipt,
  serverKnown,
  device,
  deleted,
  onDeleteAll,
}: {
  receipt: Receipt | null;
  /** False when we couldn't ask the server (offline). A sample person's receipt is null but known. */
  serverKnown: boolean;
  device: { photos: number; previews: number };
  deleted: boolean;
  onDeleteAll: () => void;
}) {
  const calm = useCalmMotion();
  const sections = calm ? dissolve.calm : dissolve.full;
  // Sections dissolve one after another, then the done state fades in.
  const exitFor = (i: number) =>
    calm
      ? { opacity: 0, transition: { duration: dur.reduced } }
      : { opacity: 0, filter: "blur(6px)", transition: { duration: dur.base, delay: i * 0.08 } };
  const nothing = !receipt && device.photos === 0;
  const tasks = receipt?.jobs.flatMap((j) => j.youcamTaskIds) ?? [];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {deleted || nothing ? (
        <m.div
          key="done"
          variants={calm ? fadeRise.calm : fadeRise.full}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-4 rounded-card bg-surface p-8 text-center"
        >
          <CheckCircle2Icon aria-hidden="true" className="size-10 text-action" />
          <div className="flex flex-col gap-1.5" role="status">
            <h2 className="text-xl">{deleted ? copy.privacy.deleteDoneTitle : copy.privacy.emptyTitle}</h2>
            <p className="text-text-soft">{deleted ? copy.privacy.deleteDoneBody : copy.privacy.emptyBody}</p>
          </div>
          <ButtonLink href="/" size="lg" direction="back">
            {copy.privacy.deleteDoneCta}
          </ButtonLink>
        </m.div>
      ) : (
        <m.div key="receipt" className="flex flex-col gap-8">
          {[
            <Section key="device" title={copy.privacy.deviceTitle} body={copy.privacy.deviceBody}>
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold">
                {copy.privacy.deviceCounts(device.photos, device.previews)}
              </p>
            </Section>,

            <Section key="youcam" title={copy.privacy.youcamTitle} body={copy.privacy.youcamBody}>
              <ul className="flex flex-col gap-2">
                {receipt?.baselines.map((b) => (
                  <li key={b.baselineId} className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-3 text-sm">
                    <span className="text-text-muted">{copy.privacy.youcamPhoto}</span>
                    <span className="font-mono text-xs break-all">{b.youcamFileId}</span>
                    <span className="text-text-muted">
                      {copy.privacy.sentAt} <LocalTime iso={b.createdAt} /> · {copy.privacy.expires}{" "}
                      <LocalTime iso={b.expiresAt} />
                    </span>
                  </li>
                ))}
                {tasks.length > 0 && (
                  <li className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-3 text-sm">
                    <span className="text-text-muted">{copy.privacy.youcamTasks}</span>
                    <span className="font-mono text-xs leading-relaxed break-all">{tasks.join(", ")}</span>
                  </li>
                )}
              </ul>
            </Section>,

            <Section
              key="server"
              title={copy.privacy.serverTitle}
              body={
                !serverKnown
                  ? copy.privacy.serverUnreachable
                  : receipt?.serverStoresImages
                    ? copy.privacy.serverSharedImages(
                        receipt.shares.length,
                        formatDateTimeUtc(receipt.shares.map((s) => s.expiresAt).sort()[0] ?? new Date().toISOString()),
                      )
                    : copy.privacy.serverNone
              }
            >
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 rounded-2xl bg-surface px-4 py-3 text-sm">
                <dt className="text-text-muted">{copy.privacy.serverRecordsLabel}</dt>
                <dd className="font-semibold">{copy.privacy.serverRecords((receipt?.jobs.length ?? 0) + (receipt?.baselines.length ?? 0))}</dd>
                <dt className="text-text-muted">{copy.privacy.serverShares}</dt>
                <dd className="font-semibold">
                  {receipt && receipt.shares.length > 0 ? receipt.shares.length : copy.privacy.serverSharesNone}
                </dd>
              </dl>
            </Section>,
          ].map((section, i) => (
            <m.section
              key={section.key}
              variants={sections}
              initial="visible"
              exit={exitFor(i)}
              className="flex flex-col gap-3"
            >
              {section}
            </m.section>
          ))}

          <m.section variants={sections} initial="visible" exit={exitFor(3)} className="flex flex-col gap-3 rounded-card bg-surface p-5">
            <h2 className="text-lg">{copy.privacy.deleteTitle}</h2>
            <p className="text-text-soft">{copy.privacy.deleteBody}</p>
            <ConfirmDialog
              trigger={
                <Button variant="secondary" size="lg" full>
                  {copy.privacy.deleteCta}
                </Button>
              }
              title={copy.privacy.deleteConfirmTitle}
              body={copy.privacy.deleteConfirmBody}
              confirmLabel={copy.privacy.deleteConfirm}
              onConfirm={onDeleteAll}
            />
          </m.section>
        </m.div>
      )}
    </AnimatePresence>
  );
}
