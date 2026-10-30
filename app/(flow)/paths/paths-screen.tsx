"use client";

import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BottomBar } from "@/components/cm/bottom-bar";
import { BudgetNote } from "@/components/cm/budget-note";
import { HowMadeDrawer } from "@/components/cm/how-made-drawer";
import { PathCard } from "@/components/cm/path-card";
import { Screen } from "@/components/cm/screen";
import { RetakeCoach } from "@/components/cm/retake-coach";
import { ErrorState, SampleModeBanner } from "@/components/cm/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { styles } from "@/lib/catalog";
import { db, rowError, type JobRow } from "@/lib/client/db";
import { useJourneyGuard, useNavigate, useNow, useObjectUrl, useObjectUrls, useStatus } from "@/lib/client/hooks";
import { viewRow } from "@/lib/client/job-view";
import { ensureRouteJobs, retryRow } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";
import { errorBody } from "@/lib/contracts/errors";

/** One preview costs about this many units (a route is 2–3); only used to word the budget note. */
const UNITS_PER_PREVIEW = 3;

/*
 * Three Paths, driven by stored jobs. On entry each planned path gets a job
 * (once: reloads and revisits re-use them); the page just reads IndexedDB, so
 * progress, partial failure and resume-after-reload all come from the same
 * rows the poller keeps current. A failed path offers its own retry and leaves
 * the others usable.
 */
export function PathsScreen() {
  const ready = useJourneyGuard("routes");
  const { baselineId, routes, isSample } = useJourney();
  const status = useStatus();
  const now = useNow();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && baselineId) void ensureRouteJobs(baselineId, routes);
  }, [ready, baselineId, routes]);

  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  const rows = useLiveQuery(async () => (baselineId ? db.jobs.where("baselineId").equals(baselineId).toArray() : []), [baselineId]);
  const results = useLiveQuery(async () => (baselineId ? db.results.where("baselineId").equals(baselineId).toArray() : []), [baselineId]);

  const baselineUrl = useObjectUrl(baseline?.image);
  const resultEntries = useMemo(() => results?.map((r) => ({ key: r.clientRequestId, blob: r.image })), [results]);
  const resultUrls = useObjectUrls(resultEntries);

  const live = (key: string): JobRow | undefined => rows?.find((r) => r.routeKey === key && !r.superseded && !r.variantOf);
  const cards = routes.map((route) => {
    const row = live(route.routeKey);
    return { route, row, view: row ? viewRow(row, now) : undefined };
  });

  const stored = cards.filter((c) => c.row?.result === "stored" && resultUrls.get(c.row.clientRequestId));
  const firstReady = stored[0]?.route;
  // YouCam refused the PHOTO (no shoulders, bad angle, hair too short): that's one problem
  // with one fix, not three failed cards.
  const photoProblem = cards
    .map((c) => c.view?.error)
    .find((e) => e?.code === "YOUCAM_REJECTED" && e.messageKey.startsWith("capture."));
  const everyFailed = cards.length > 0 && cards.every((c) => c.view?.status === "failed");
  const blockingError = everyFailed ? rowError(cards[0]!.row!) : undefined;
  const liveOff = status.data?.live === false;

  const unitsLeft = status.data ? Math.max(0, status.data.session.unitsCap - status.data.session.unitsUsed) : undefined;
  const firstProvenance = stored[0]?.row?.job?.provenance;

  return (
    <Screen
      title={copy.paths.title}
      backHref="/start/snapshot"
      step={{ n: 4, total: 5 }}
      baselineSrc={baselineUrl}
      wide
      bottom={
        <BottomBar className="md:items-center">
          {firstReady ? (
            <ButtonLink href={`/paths/${firstReady.routeKey}`} size="lg" full className="md:max-w-sm">
              {`${copy.paths.open}: ${copy.paths.routes[firstReady.routeId].name}`}
            </ButtonLink>
          ) : (
            <Button size="lg" full disabled className="md:max-w-sm">
              {copy.paths.making}
            </Button>
          )}
        </BottomBar>
      }
    >
      <p className="text-text-soft">{copy.paths.intro}</p>
      <p role="status" className="sr-only">
        {copy.paths.readyCount(stored.length, routes.length)}
      </p>
      {isSample ? <SampleModeBanner /> : status.data?.mode === "mock" && <SampleModeBanner mock />}

      {photoProblem && (
        <RetakeCoach messageKey={photoProblem.messageKey} onRetake={() => navigate("/start/capture", "back")}>
          {photoProblem.messageKey === "capture.hairTooShort" && (
            <ButtonLink href="/plan" size="lg" full>
              {copy.plan.title}
            </ButtonLink>
          )}
        </RetakeCoach>
      )}
      {liveOff && cards.every((c) => !c.row?.jobId) && <ErrorState messageKey="live.disabled" />}
      {blockingError && !liveOff && !photoProblem && (
        <ErrorState messageKey={blockingError.messageKey} onRetry={blockingError.retryable ? () => cards.forEach((c) => c.row && void retryRow(c.row)) : undefined} />
      )}

      {baselineUrl && !blockingError && !photoProblem && !(liveOff && cards.every((c) => !c.row?.jobId)) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map(({ route, row, view }) => {
            const style = styles.find((s) => s.id === route.styleId);
            const url = row ? resultUrls.get(row.clientRequestId) : undefined;
            const expired = row?.result === "expired";
            return (
              <PathCard
                key={route.routeKey}
                name={copy.paths.routes[route.routeId].name}
                blurb={copy.paths.routes[route.routeId].blurb}
                baselineSrc={baselineUrl}
                resultSrc={url}
                resultAlt={copy.compare.alt(style?.label ?? route.styleId, route.colour.source === "own")}
                status={expired ? "failed" : (view?.status ?? "queued")}
                steps={view?.steps ?? []}
                error={expired ? { ...errorBody("EXPIRED"), retryable: true } : view?.error}
                slow={view?.slow}
                href={`/paths/${route.routeKey}`}
                onRetry={row ? () => void retryRow(row) : undefined}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isSample && unitsLeft !== undefined && <BudgetNote remaining={Math.floor(unitsLeft / UNITS_PER_PREVIEW)} />}
        {firstProvenance && (
          <HowMadeDrawer provenance={firstProvenance} units={stored[0]?.row?.job?.steps.map((s) => s.units)} />
        )}
      </div>
    </Screen>
  );
}
