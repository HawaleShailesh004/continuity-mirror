"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useScroll } from "motion/react";
import * as m from "motion/react-m";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { BottomBar } from "@/components/cm/bottom-bar";
import { BudgetNote } from "@/components/cm/budget-note";
import { HowMadeDrawer } from "@/components/cm/how-made-drawer";
import { RegrowthStage } from "@/components/cm/regrowth-stage";
import { TimeScrubber } from "@/components/cm/time-scrubber";
import { Screen } from "@/components/cm/screen";
import { EmptyState, ErrorState, OfflineBanner, SampleModeBanner } from "@/components/cm/states";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { styles } from "@/lib/catalog";
import { db } from "@/lib/client/db";
import { useJourneyGuard, useNow, useObjectUrl, useObjectUrls, useStatus } from "@/lib/client/hooks";
import { viewRow } from "@/lib/client/job-view";
import { regrowthCost, regrowthStages, retryRow, startRegrowth, toggleLook } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";

const KEYS = ["regrowth-3m", "regrowth-6m", "regrowth-12m"] as const;
const UNITS_PER_PREVIEW = 3;

/**
 * The stages with their timeline. The scroll-linked line lives here, not in the
 * screen, because useScroll needs the list to be mounted when it starts (the
 * list only appears once the person has asked to see the stages).
 */
function Timeline({ label, children }: { label: string; children: ReactNode }) {
  const calm = useCalmMotion();
  const list = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 75%", "end 60%"] });
  return (
    <div className="relative">
      {/* The line draws as you scroll (signature moment 8); with reduced motion it is simply there. */}
      <span aria-hidden="true" className="absolute top-3 bottom-3 left-1.75 w-0.5 rounded-full bg-line" />
      <m.span
        aria-hidden="true"
        className="absolute top-3 bottom-3 left-1.75 w-0.5 origin-top rounded-full bg-action"
        style={{ scaleY: calm ? 1 : scrollYProgress }}
      />
      <ol ref={list} aria-label={label} className="relative flex flex-col gap-10">
        {children}
      </ol>
    </div>
  );
}

/*
 * Regrowth roadmap (Module G): three stages, each previewed from the person's
 * own baseline, always labelled a possibility and never a prediction. Nothing
 * is made until they ask, and they can leave without it: it is not needed for
 * the plan. A stage can be added to the plan like any look.
 */
export function RegrowthScreen() {
  const ready = useJourneyGuard("routes");
  const status = useStatus();
  const now = useNow();
  const { baselineId, isSample, personaId, audience } = useJourney();

  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  const snapshot = useLiveQuery(async () => (baselineId ? db.snapshots.get(baselineId) : undefined), [baselineId]);
  const rows = useLiveQuery(async () => (baselineId ? db.jobs.where("baselineId").equals(baselineId).toArray() : []), [baselineId]);
  const results = useLiveQuery(async () => (baselineId ? db.results.where("baselineId").equals(baselineId).toArray() : []), [baselineId]);
  const plan = useLiveQuery(() => db.plan.get("current"), []);

  const baselineUrl = useObjectUrl(baseline?.image);
  // Stable between renders, or the object URLs would be remade on every one.
  const resultEntries = useMemo(() => results?.map((r) => ({ key: r.clientRequestId, blob: r.image })), [results]);
  const resultUrls = useObjectUrls(resultEntries);

  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(0);
  const autoStarted = useRef(false);

  const stageRows = KEYS.map((key) => rows?.find((r) => r.routeKey === key && !r.superseded));
  const started = stageRows.some(Boolean);
  const unitsLeft = status.data ? Math.max(0, status.data.session.unitsCap - status.data.session.unitsUsed) : undefined;
  const planned = snapshot ? regrowthStages(snapshot.snapshot, audience) : [];
  const cost = regrowthCost(planned);
  const capability = status.data?.capabilities.regrowth;
  const liveOff = !isSample && status.data?.live === false;
  const tooFew = !isSample && unitsLeft !== undefined && unitsLeft < cost;
  const firstStored = stageRows.find((r) => r?.result === "stored" && r.job);
  const firstProvenance = firstStored ? results?.find((r) => r.clientRequestId === firstStored.clientRequestId)?.provenance : undefined;

  // A sample person's stages are genuine results we already hold: nothing is generated, so they are simply there.
  useEffect(() => {
    if (!isSample || !ready || !baselineId || !snapshot || started || autoStarted.current) return;
    autoStarted.current = true;
    void startRegrowth({ baselineId, snapshot: snapshot.snapshot, audience, personaId });
  }, [isSample, ready, baselineId, snapshot, started, audience, personaId]);

  if (!ready || !baselineUrl || !snapshot || !baselineId) {
    return (
      <Screen title={copy.regrowth.title} backHref="/plan">
        {null}
      </Screen>
    );
  }

  const t = copy.regrowth;
  const start = async () => {
    setStarting(true);
    try {
      await startRegrowth({ baselineId, snapshot: snapshot.snapshot, audience, personaId });
    } finally {
      setStarting(false);
    }
  };

  // Show what exists even if the module has since been switched off; only block starting a new one.
  const blocked = !started && capability === false;
  const waiting = (!started && capability === undefined && !status.isError) || (isSample && !started);
  const stageUrls = stageRows.map((r) => (r?.result === "stored" ? resultUrls.get(r.clientRequestId) : undefined));
  const allReady = started && stageUrls.every(Boolean);
  const scrubStages = KEYS.map((key, i) => {
    const style = styles.find((s) => s.id === (stageRows[i]?.spec.kind === "route" ? stageRows[i]!.spec.styleId : ""));
    return { key, when: t.stages[key].when, short: t.stages[key].short, src: stageUrls[i] ?? "", alt: t.alt(t.stages[key].when, style?.label ?? ""), styleName: style?.label ?? "" };
  });
  const activeRow = stageRows[active];
  const activeSaved = Boolean(activeRow && plan?.looks.includes(activeRow.clientRequestId));

  return (
    <Screen
      title={t.title}
      backHref="/plan"
      baselineSrc={baselineUrl}
      stage={allReady ? <TimeScrubber stages={scrubStages} beforeSrc={baselineUrl} active={active} onActive={setActive} /> : undefined}
      bottom={
        !blocked &&
        !waiting && (
          <BottomBar className="md:items-center">
            {started ? (
              <ButtonLink href="/plan" size="lg" full className="md:max-w-sm" direction="back">
                {t.planLink}
              </ButtonLink>
            ) : (
              <Button size="lg" full className="md:max-w-sm" onClick={() => void start()} loading={starting} disabled={liveOff || tooFew || (status.isError && !isSample)}>
                {t.startCta}
              </Button>
            )}
          </BottomBar>
        )
      }
    >
      {isSample && <SampleModeBanner />}
      <p className="text-text-soft">{t.intro}</p>
      <p className="rounded-card bg-peach px-5 py-4 text-sm font-semibold text-text-soft">{t.possibility}</p>

      {blocked ? (
        <EmptyState
          title={t.unavailableTitle}
          body={t.unavailableBody}
          action={
            <ButtonLink href="/plan" size="lg" direction="back">
              {t.planLink}
            </ButtonLink>
          }
        />
      ) : waiting ? null : !started ? (
        <section aria-labelledby="start-title" className="flex flex-col gap-4 rounded-card bg-surface p-5">
          <h2 id="start-title" className="text-lg">
            {t.startTitle}
          </h2>
          <p className="text-text-soft">{t.startBody}</p>
          <ul className="flex flex-col gap-1.5 text-sm font-semibold">
            {KEYS.map((key) => (
              <li key={key}>{t.stages[key].when}</li>
            ))}
          </ul>
          <p className="text-sm text-text-muted">{t.rough}</p>
          {!isSample && <p className="text-sm text-text-soft">{t.makes}</p>}
          {!isSample && unitsLeft !== undefined && <BudgetNote remaining={Math.floor(unitsLeft / UNITS_PER_PREVIEW)} />}
          {tooFew && !liveOff && <p role="status" className="text-sm font-semibold">{t.notEnough}</p>}
          {liveOff && <ErrorState messageKey="live.disabled" headingLevel={3} />}
          {status.isError && !isSample && <OfflineBanner />}
          <p className="text-sm text-text-muted">{t.skip}</p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {allReady && activeRow && (
            <section aria-labelledby="scrub-title" className="flex flex-col gap-2">
              <h2 id="scrub-title" className="font-display text-xl font-medium md:text-2xl">
                {t.scrubTitle}
              </h2>
              <p className="text-lg font-semibold" aria-live="polite">
                {scrubStages[active]!.when}
              </p>
              <p className="text-sm text-text-soft">{t.stageStyle(scrubStages[active]!.styleName)}</p>
              {activeRow.note && <p className="text-xs text-text-muted">{activeRow.note}</p>}
              <Button
                variant={activeSaved ? "primary" : "secondary"}
                className="mt-2 self-start"
                onClick={() => void toggleLook(activeRow.clientRequestId).then((added) => added && toast(t.addedToast))}
              >
                {activeSaved ? <CheckIcon aria-hidden="true" className="size-5" /> : <PlusIcon aria-hidden="true" className="size-5" />}
                {activeSaved ? t.inPlan : t.addToPlan}
                <span className="sr-only"> · {scrubStages[active]!.short}</span>
              </Button>
            </section>
          )}
          {!allReady && (
          <Timeline label={t.timelineLabel}>
              {KEYS.map((key, i) => {
                const row = stageRows[i];
                if (!row) return null;
                const view = viewRow(row, now);
                const style = styles.find((s) => s.id === (row.spec.kind === "route" ? row.spec.styleId : ""));
                const url = row.result === "stored" ? resultUrls.get(row.clientRequestId) : undefined;
                const expired = row.result === "expired";
                return (
                  <RegrowthStage
                    key={key}
                    when={t.stages[key].when}
                    styleName={style?.label ?? ""}
                    beforeSrc={baselineUrl}
                    resultSrc={url}
                    resultAlt={t.alt(t.stages[key].when, style?.label ?? "")}
                    status={expired ? "failed" : view.status}
                    steps={view.steps}
                    error={view.error}
                    slow={view.slow}
                    note={row.note}
                    saved={Boolean(plan?.looks.includes(row.clientRequestId))}
                    onToggleSaved={() => void toggleLook(row.clientRequestId).then((added) => added && toast(t.addedToast))}
                    onRetry={() => void retryRow(row)}
                  />
                );
              })}
          </Timeline>
          )}

          <section aria-labelledby="wig-title" className="flex flex-col gap-2 rounded-card bg-surface p-5">
            <h2 id="wig-title" className="text-lg">
              {t.wigTitle}
            </h2>
            <p className="text-text-soft">{t.wigBody}</p>
          </section>
          <p className="text-sm text-text-muted">{t.rough}</p>
          {firstProvenance && <HowMadeDrawer provenance={firstProvenance} units={firstStored?.job?.steps.map((s) => s.units)} />}
        </div>
      )}
    </Screen>
  );
}
