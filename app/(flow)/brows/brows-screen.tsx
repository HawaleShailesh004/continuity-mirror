"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { BottomBar } from "@/components/cm/bottom-bar";
import { BudgetNote } from "@/components/cm/budget-note";
import { HowMadeDrawer } from "@/components/cm/how-made-drawer";
import { JobProgress } from "@/components/cm/job-progress";
import { Screen } from "@/components/cm/screen";
import { EmptyState, ErrorState, SampleModeBanner } from "@/components/cm/states";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { copy } from "@/content/copy";
import { sources } from "@/content/sources";
import {
  BROW_FAMILIES,
  type BrowFamily,
  buildRecipe,
  colourFor,
  cropImage,
  findBrows,
  previewSpec,
  shapeById,
  shapesIn,
  startingPoint,
} from "@/lib/client/brows";
import { db, type BrowRecordRow } from "@/lib/client/db";
import { useJourneyGuard, useNow, useObjectUrl, useStatus } from "@/lib/client/hooks";
import { viewRow } from "@/lib/client/job-view";
import { makeBrowPreview, retryRow, updatePlan } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";


const NOTE_MAX = 280;
const t = copy.brows;
const acsMakeup = sources.find((s) => s.id === "acs-makeup");
const bcnBrows = sources.find((s) => s.id === "bcn-brows");

/*
 * Brow record (Module E). The record is the feature: a close photo of the
 * person's OWN brows, cut from their baseline on this device, with the closest
 * of YouCam's verified shapes and a colour, saved to the plan with practice
 * steps. The YouCam preview is secondary, and says so: on brows that are still
 * there it is subtle.
 */
export function BrowsScreen() {
  const ready = useJourneyGuard("routes");
  const status = useStatus();
  const now = useNow();
  const { baselineId, isSample, personaId } = useJourney();

  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  const snapshot = useLiveQuery(async () => (baselineId ? db.snapshots.get(baselineId) : undefined), [baselineId]);
  // null = loaded and none yet; undefined = still loading.
  const record = useLiveQuery(async () => (baselineId ? ((await db.browRecords.get(baselineId)) ?? null) : undefined), [baselineId]);
  const rows = useLiveQuery(async () => (baselineId ? db.jobs.where("baselineId").equals(baselineId).toArray() : []), [baselineId]);
  const plan = useLiveQuery(() => db.plan.get("current"), []);

  const previewRow = rows?.find((r) => r.routeKey === "brows" && !r.superseded);
  const previewResult = useLiveQuery(async () => (previewRow ? db.results.get(previewRow.clientRequestId) : undefined), [previewRow?.clientRequestId]);

  const baselineUrl = useObjectUrl(baseline?.image);
  const recordUrl = useObjectUrl(record?.image);

  // The preview, cut to the same brows as the record so the two sit side by side.
  const [previewCrop, setPreviewCrop] = useState<Blob>();
  useEffect(() => {
    let cancelled = false;
    if (!previewResult || !record) return;
    void cropImage(previewResult.image, record.rect).then((blob) => !cancelled && setPreviewCrop(blob));
    return () => {
      cancelled = true;
    };
  }, [previewResult, record]);
  const previewUrl = useObjectUrl(previewResult ? previewCrop : undefined);

  // First visit: find the brows and make the record. Once.
  const making = useRef(false);
  useEffect(() => {
    if (!baseline || !snapshot || record !== null || making.current) return;
    making.current = true;
    void (async () => {
      const { rect, found } = await findBrows(baseline.image);
      const image = await cropImage(baseline.image, rect);
      const row: BrowRecordRow = {
        baselineId: baseline.id,
        image,
        rect,
        found,
        ...startingPoint(snapshot.snapshot.brows),
        note: "",
        createdAt: new Date().toISOString(),
      };
      await db.browRecords.put(row);
    })();
  }, [baseline, snapshot, record]);

  const capability = status.data?.capabilities.brows;
  const [working, setWorking] = useState(false);

  if (!ready || !baselineUrl || !snapshot || !baselineId) {
    return (
      <Screen title={t.title} backHref="/plan">
        {null}
      </Screen>
    );
  }

  if (capability === false && !record) {
    return (
      <Screen title={t.title} backHref="/plan">
        <EmptyState
          title={t.unavailableTitle}
          body={t.unavailableBody}
          action={
            <ButtonLink href="/plan" size="lg" direction="back">
              {t.backToPlan}
            </ButtonLink>
          }
        />
      </Screen>
    );
  }

  if (!record || !recordUrl) {
    return (
      <Screen title={t.title} backHref="/plan" baselineSrc={baselineUrl}>
        <p role="status" className="rounded-card bg-surface px-5 py-4 text-sm font-semibold text-text-soft">
          {t.finding}
        </p>
      </Screen>
    );
  }

  const shape = shapeById(record.shapeId) ?? shapesIn("soft-arch")[0]!;
  const family = shape.shape;
  const recipe = buildRecipe(shape, record.darkness, record.note);
  const saved = JSON.stringify(plan?.browRecipe) === JSON.stringify(recipe);

  const update = (patch: Partial<Pick<BrowRecordRow, "shapeId" | "darkness" | "note">>) => db.browRecords.update(record.baselineId, patch);
  const pickFamily = (next: BrowFamily) => {
    const inFamily = shapesIn(next);
    // Keep the same thickness when the new family has one.
    const same = inFamily.find((s) => s.thickness === shape.thickness) ?? inFamily[0]!;
    void update({ shapeId: same.id });
  };
  const save = async () => {
    await updatePlan({ browRecipe: recipe });
    toast(t.savedToast);
  };

  const unitsLeft = status.data ? Math.max(0, status.data.session.unitsCap - status.data.session.unitsUsed) : undefined;
  const liveOff = !isSample && status.data?.live === false;
  const view = previewRow ? viewRow(previewRow, now) : undefined;
  const previewSample = previewRow?.spec.kind === "brows" ? shapeById(previewRow.spec.browShapeId) : undefined;
  const previewDone = previewRow?.result === "stored" && previewUrl;

  const makePreview = async () => {
    setWorking(true);
    try {
      await makeBrowPreview({ baselineId, spec: previewSpec(shape, record.darkness), personaId });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Screen
      title={t.title}
      backHref="/plan"
      baselineSrc={baselineUrl}
      wide
      bottom={
        <BottomBar className="md:items-center">
          {saved ? (
            <ButtonLink href="/plan" size="lg" full className="md:max-w-sm" direction="back">
              {t.backToPlan}
            </ButtonLink>
          ) : (
            <Button size="lg" full className="md:max-w-sm" onClick={() => void save()}>
              {t.save}
            </Button>
          )}
          {saved && <p role="status" className="text-center text-xs text-text-muted">{t.saved}</p>}
        </BottomBar>
      }
    >
      {isSample && <SampleModeBanner />}
      <p className="max-w-prose text-text-soft">{t.intro}</p>

      <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-12">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="record-title" className="flex flex-col gap-3">
            <h2 id="record-title" className="text-lg">
              {t.recordTitle}
            </h2>
            <div className="overflow-hidden rounded-image bg-peach">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={recordUrl} alt={t.recordAlt} className="block w-full" />
            </div>
            <p className="text-sm text-text-muted">{record.found === "face" ? t.found : t.guess}</p>
            {record.found === "guess" && (
              <Link href="/start/capture" className="inline-flex min-h-11 items-center self-start font-semibold text-action">
                {t.retake}
              </Link>
            )}
            <p className="text-sm text-text-muted">{t.recordNote}</p>
            <a href={recordUrl} download={t.fileName} className={buttonClass({ variant: "secondary", className: "self-start" })}>
              <DownloadIcon aria-hidden="true" className="size-5" />
              {t.savePhoto}
            </a>
          </section>

          <section aria-labelledby="steps-title" className="flex flex-col gap-3 rounded-card bg-peach p-5">
            <h2 id="steps-title" className="text-lg">
              {t.stepsTitle}
            </h2>
            <p className="font-semibold">{t.practiseLine}</p>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-text-soft">
              {t.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-sm text-text-muted">{t.stepsOurs}</p>
            <p className="text-sm text-text-soft">{t.citeLead}</p>
            <div className="flex flex-col">
              {[acsMakeup, bcnBrows].map(
                (s) =>
                  s && (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center font-semibold text-action"
                    >
                      {s.publisher}: {s.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ),
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="shape-title" className="flex flex-col gap-3">
            <h2 id="shape-title" className="text-lg">
              {t.shapeTitle}
            </h2>
            <p className="-mt-1 text-sm text-text-muted">{t.shapeHint}</p>
            <ChoiceChips
              label={t.familyLabel}
              value={family}
              onValueChange={pickFamily}
              options={BROW_FAMILIES.map((f) => ({ value: f, label: t.families[f] }))}
            />
            <ChoiceChips
              label={t.styleLabel}
              value={shape.id}
              onValueChange={(id) => void update({ shapeId: id })}
              options={shapesIn(family).map((s) => ({ value: s.id, label: `${t.thickness[s.thickness]}: ${s.name}` }))}
            />
            <p className="text-sm text-text-soft">{shape.description}</p>
          </section>

          <section aria-labelledby="colour-title" className="flex flex-col gap-3">
            <h2 id="colour-title" className="text-lg">
              {t.colourTitle}
            </h2>
            <p className="-mt-1 text-sm text-text-muted">{t.colourHint}</p>
            <ChoiceChips
              label={t.colourLabel}
              value={record.darkness}
              onValueChange={(d) => void update({ darkness: d })}
              options={(["light", "medium", "dark"] as const).map((d) => ({ value: d, label: t.darkness[d], swatch: colourFor(d) }))}
            />
          </section>

          <div className="flex flex-col gap-2">
            <label htmlFor="brow-note" className="text-lg font-bold">
              {t.noteLabel}
            </label>
            <textarea
              id="brow-note"
              rows={3}
              maxLength={NOTE_MAX}
              value={record.note}
              placeholder={t.notePlaceholder}
              onChange={(e) => void update({ note: e.target.value })}
              className="w-full resize-none rounded-card bg-surface px-5 py-4 text-base text-text placeholder:text-text-muted"
            />
            <p className="self-end text-xs text-text-muted">{t.noteCount(record.note.length, NOTE_MAX)}</p>
          </div>

          <section aria-labelledby="preview-title" className="flex flex-col gap-3 rounded-card bg-surface p-5">
            <h2 id="preview-title" className="text-lg">
              {t.previewTitle}
            </h2>
            <p className="text-text-soft">{t.previewBody}</p>

            {previewDone ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <figure className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={recordUrl} alt={t.recordAlt} className="w-full rounded-image" />
                    <figcaption className="text-xs font-semibold text-text-muted">{t.previewBefore}</figcaption>
                  </figure>
                  <figure className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt={t.previewAlt(previewSample?.name ?? shape.name)} className="w-full rounded-image" />
                    <figcaption className="text-xs font-semibold text-text-muted">{t.previewAfter}</figcaption>
                  </figure>
                </div>
                <p className="text-xs font-semibold text-text-muted">{t.previewLabel}</p>
                {isSample && previewSample && <p className="text-sm text-text-muted">{t.previewMadeWith(previewSample.name)}</p>}
                {previewRow?.note && <p className="text-sm text-text-muted">{previewRow.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {previewResult && previewRow?.job && (
                    <HowMadeDrawer provenance={previewResult.provenance} units={previewRow.job.steps.map((s) => s.units)} />
                  )}
                  {!isSample && (
                    <Button variant="quiet" className="h-11 px-3 text-sm" onClick={() => void makePreview()} loading={working} disabled={liveOff}>
                      {t.previewAgain}
                    </Button>
                  )}
                </div>
              </>
            ) : view && view.status === "failed" ? (
              <ErrorState
                messageKey={view.error?.messageKey}
                title={t.previewFailed}
                onRetry={view.error?.retryable && previewRow ? () => void retryRow(previewRow) : undefined}
                headingLevel={3}
              />
            ) : view ? (
              <div className="flex flex-col gap-2">
                <p role="status" className="text-sm font-semibold text-text-soft">
                  {t.previewMaking}
                </p>
                <JobProgress status={view.status} steps={view.steps} slow={view.slow} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="lg" onClick={() => void makePreview()} loading={working} disabled={liveOff || (!isSample && unitsLeft !== undefined && unitsLeft < 1)}>
                  {isSample ? t.previewCtaSample : t.previewCta}
                </Button>
                {!isSample && <p className="text-sm text-text-muted">{t.previewCost}</p>}
                {!isSample && unitsLeft !== undefined && <BudgetNote remaining={Math.floor(unitsLeft / 3)} />}
                {liveOff && <ErrorState messageKey="live.disabled" headingLevel={3} />}
              </div>
            )}
          </section>
        </div>
      </div>
    </Screen>
  );
}
