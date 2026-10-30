"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { BottomBar } from "@/components/cm/bottom-bar";
import { BudgetNote } from "@/components/cm/budget-note";
import { CompareView } from "@/components/cm/compare-view";
import { HowMadeDrawer } from "@/components/cm/how-made-drawer";
import { PathCard } from "@/components/cm/path-card";
import { PlanPill } from "@/components/cm/plan-pill";
import { Screen } from "@/components/cm/screen";
import { SampleModeBanner } from "@/components/cm/states";
import { VerdictControl } from "@/components/cm/verdict-control";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Sheet } from "@/components/ui/sheet";
import { copy } from "@/content/copy";
import { colours, styles } from "@/lib/catalog";
import { cuesFromSnapshot, type CueKey } from "@/lib/client/cues";
import { db, type JobRow } from "@/lib/client/db";
import { useJourneyGuard, useNavigate, useNow, useObjectUrl, useStatus } from "@/lib/client/hooks";
import { viewRow } from "@/lib/client/job-view";
import { enqueueVariant, retryRow, toggleLook } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";
import { planAlternatives, ROUTE_KEYS } from "@/lib/planner";
import type { Verdict } from "@/lib/contracts";
import { errorBody } from "@/lib/contracts/errors";
import { cn } from "@/lib/utils";

/** One preview costs about this many units (a route is 2–3); only used to word the budget note. */
const UNITS_PER_PREVIEW = 3;

/** A short name for a try: the original, the style a variant used, or the colour it changed to. */
function tryLabel(row: JobRow, isOriginal: boolean): string {
  if (isOriginal) return copy.compare.original;
  const spec = row.spec;
  if (spec.kind !== "route") return copy.compare.variant;
  if (spec.colour.source === "preset") {
    const presetId = spec.colour.presetId;
    return colours.find((c) => c.id === presetId)?.label ?? presetId;
  }
  return styles.find((s) => s.id === spec.styleId)?.label ?? spec.styleId;
}

/*
 * Compare + verdict for one path. The path's original and any variants or
 * colour changes are all stored jobs, so each shows real progress or its own
 * failure, and the baseline is always beside the result. The verdict and the
 * saved looks are written to IndexedDB the moment they change.
 */
export function CompareScreen({ routeKey }: { routeKey: string }) {
  const ready = useJourneyGuard("routes");
  const navigate = useNavigate();
  const { baselineId, routes, isSample, audience } = useJourney();
  const route = routes.find((r) => r.routeKey === routeKey);
  const status = useStatus();
  const now = useNow();

  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  const snapshot = useLiveQuery(async () => (baselineId ? db.snapshots.get(baselineId) : undefined), [baselineId]);
  const rows = useLiveQuery(
    async () => (baselineId ? db.jobs.where("baselineId").equals(baselineId).toArray() : []),
    [baselineId],
  );
  const verdictRow = useLiveQuery(() => db.verdicts.get(routeKey), [routeKey]);
  const plan = useLiveQuery(() => db.plan.get("current"), []);

  // Original first, then variants in the order they were made.
  const tries = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !r.superseded && (r.variantOf === routeKey || (r.routeKey === routeKey && !r.variantOf)))
        .sort(
          (a, b) => Number(Boolean(a.variantOf)) - Number(Boolean(b.variantOf)) || a.createdAt.localeCompare(b.createdAt),
        ),
    [rows, routeKey],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const current = tries.find((t) => t.clientRequestId === pickedId) ?? tries[0];

  const result = useLiveQuery(
    async () => (current ? db.results.get(current.clientRequestId) : undefined),
    [current?.clientRequestId],
  );
  const baselineUrl = useObjectUrl(baseline?.image);
  const resultUrl = useObjectUrl(result?.image);

  const [variantOpen, setVariantOpen] = useState(false);
  const [colourOpen, setColourOpen] = useState(false);

  // A path that isn't in this journey (e.g. a stale link) goes back to the three paths.
  useEffect(() => {
    if (ready && !route) navigate("/paths", "back");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is recreated each render
  }, [ready, route]);

  if (!ready || !route || !snapshot || !baselineUrl || !baselineId) {
    return (
      <Screen title={copy.compare.title} backHref="/paths" step={{ n: 5, total: 5 }} wide>
        {null}
      </Screen>
    );
  }

  const name = copy.paths.routes[route.routeId].name;
  const cues = cuesFromSnapshot(snapshot.snapshot);
  // The planner picks which other styles are worth trying from this snapshot.
  const alternatives = planAlternatives(snapshot.snapshot, route, { max: 6, audience }).flatMap((id) => styles.find((s) => s.id === id) ?? []);
  const view = current ? viewRow(current, now) : undefined;
  const spec = current?.spec.kind === "route" ? current.spec : undefined;
  const style = styles.find((s) => s.id === (spec?.styleId ?? route.styleId));
  const own = spec?.colour.source === "own";
  const expired = current?.result === "expired";
  const saved = Boolean(current && plan?.looks.includes(current.clientRequestId));
  const savedCount = plan?.looks.length ?? 0;
  const stored = Boolean(current?.result === "stored" && resultUrl);
  const unitsLeft = status.data ? Math.max(0, status.data.session.unitsCap - status.data.session.unitsUsed) : undefined;

  const setVerdict = (feelsLikeMe: Verdict["feelsLikeMe"]) =>
    db.verdicts.put({
      routeKey,
      baselineId,
      feelsLikeMe,
      unwantedChanges: verdictRow?.unwantedChanges ?? [],
      updatedAt: new Date().toISOString(),
    });
  const setChanged = (unwantedChanges: CueKey[]) =>
    verdictRow && db.verdicts.put({ ...verdictRow, unwantedChanges, updatedAt: new Date().toISOString() });

  const save = async () => {
    if (!current) return;
    if (await toggleLook(current.clientRequestId)) toast(copy.compare.saved);
  };

  const makeTry = async (key: string, styleId: string, colour: typeof route.colour) => {
    const existing = tries.find((t) => t.routeKey === `${routeKey}~${key}`);
    const row =
      existing ??
      (await enqueueVariant(
        baselineId,
        route.routeKey,
        { kind: "route", routeId: "custom", styleId, colour, attempt: 0 },
        key,
      ));
    setPickedId(row.clientRequestId);
  };

  return (
    <Screen
      title={name}
      backHref="/paths"
      step={{ n: 5, total: 5 }}
      baselineSrc={baselineUrl}
      wide
      bottom={
        <BottomBar className="flex-row md:justify-end">
          {!isSample && (
            <Button variant="secondary" size="lg" onClick={() => setVariantOpen(true)}>
              {copy.compare.variant}
            </Button>
          )}
          <Button size="lg" onClick={save} disabled={!stored} aria-pressed={saved} className="flex-1 md:max-w-xs md:flex-none">
            {copy.compare.save}
          </Button>
        </BottomBar>
      }
    >
      {isSample ? <SampleModeBanner /> : status.data?.mode === "mock" && <SampleModeBanner mock />}

      <nav aria-label={copy.paths.title} className="flex gap-1 rounded-full bg-surface p-1">
        {ROUTE_KEYS.map((key) => (
          <Link
            key={key}
            href={`/paths/${key}`}
            transitionTypes={["nav-forward"]}
            aria-current={key === routeKey ? "page" : undefined}
            className={cn(
              "flex h-11 flex-1 items-center justify-center rounded-full px-2 text-center text-sm leading-tight font-semibold",
              key === routeKey ? "bg-surface-raised text-text shadow-pill" : "text-text-soft",
            )}
          >
            {copy.paths.routes[key].name}
          </Link>
        ))}
      </nav>

      {tries.length > 1 && (
        <ChoiceChips
          label={copy.compare.versionsLabel}
          value={current?.clientRequestId ?? null}
          onValueChange={setPickedId}
          options={tries.map((t, i) => ({ value: t.clientRequestId, label: tryLabel(t, i === 0) }))}
        />
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-12">
        {stored && resultUrl ? (
          <CompareView
            beforeSrc={baselineUrl}
            afterSrc={resultUrl}
            afterAlt={copy.compare.alt(style?.label ?? route.styleId, own)}
            routeName={name}
            sample={isSample}
            hint
          />
        ) : (
          <div className="mx-auto w-full max-w-md">
            <PathCard
              name={name}
              blurb={copy.paths.routes[route.routeId].blurb}
              baselineSrc={baselineUrl}
              status={expired ? "failed" : (view?.status ?? "queued")}
              steps={view?.steps ?? []}
              error={expired ? { ...errorBody("EXPIRED"), retryable: true } : view?.error}
              slow={view?.slow}
              href="#"
              onRetry={current ? () => void retryRow(current).then((row) => setPickedId(row.clientRequestId)) : undefined}
            />
          </div>
        )}

        <div className="flex flex-col gap-6">
          <VerdictControl
            value={verdictRow?.feelsLikeMe ?? null}
            onValueChange={(v) => void setVerdict(v)}
            cues={cues}
            changed={verdictRow?.unwantedChanges ?? []}
            onChangedChange={(c) => void setChanged(c)}
          />
          {!isSample && (
            <Button variant="secondary" onClick={() => setColourOpen(true)} className="self-start">
              {copy.compare.colour}
            </Button>
          )}
          <div className="flex flex-col items-start gap-1">
            {!isSample && unitsLeft !== undefined && <BudgetNote remaining={Math.floor(unitsLeft / UNITS_PER_PREVIEW)} />}
            {current?.job && result && (
              <HowMadeDrawer provenance={result.provenance} units={current.job.steps.map((s) => s.units)} />
            )}
          </div>
        </div>
      </div>

      <PlanPill count={savedCount} />

      <Sheet open={variantOpen} onOpenChange={setVariantOpen} title={copy.compare.variantTitle} description={copy.compare.variantBody}>
        <ul className="grid grid-cols-2 gap-3">
          {alternatives.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setVariantOpen(false);
                    void makeTry(`style-${s.id}`, s.id, route.colour);
                  }}
                  className="flex w-full flex-col gap-2 rounded-card bg-surface p-2 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumbnail} alt="" className="aspect-3/4 w-full rounded-image object-cover" />
                  <span className="px-1 pb-1 text-sm font-semibold">{s.label}</span>
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      <Sheet open={colourOpen} onOpenChange={setColourOpen} title={copy.compare.colourTitle} description={copy.compare.colourBody}>
        <ul className="grid grid-cols-2 gap-3">
          {colours.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setColourOpen(false);
                  void makeTry(`colour-${c.id}`, style?.id ?? route.styleId, { source: "preset", presetId: c.id, mode: "full" });
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-full bg-surface px-4 text-left text-sm font-semibold"
              >
                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 rounded-full border border-line"
                  style={{ background: c.hexes.length > 1 ? `linear-gradient(${c.hexes.join(", ")})` : c.hexes[0] }}
                />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Screen>
  );
}
