"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { styles, type StyleCatalogItem } from "@/lib/catalog";
import { db, type JobRow, type PlanRow } from "./db";
import { useObjectUrl, useObjectUrls } from "./hooks";
import { useJourney } from "./store";
import type { IdentitySnapshot } from "@/lib/contracts";

export type PlanLook = {
  row: JobRow;
  style: StyleCatalogItem;
  /** True when the preview kept the user's own colour. */
  ownColour: boolean;
  imageUrl: string | undefined;
  imageBlob: Blob | undefined;
  /** Set for a regrowth stage ("regrowth-3m" …), which the plan labels. */
  stage?: "regrowth-3m" | "regrowth-6m" | "regrowth-12m";
};

/**
 * The plan as the user sees it: settings, the saved looks resolved to their
 * style and stored preview, the baseline photo and the answers they gave.
 * `ready` is false until IndexedDB has answered, so screens never flash "empty".
 */
export function usePlan() {
  const baselineId = useJourney((j) => j.baselineId);
  const plan = useLiveQuery(async () => (await db.plan.get("current")) ?? null, []);
  const rows = useLiveQuery(async () => (plan ? await db.jobs.bulkGet(plan.looks) : []), [plan?.looks.join(",")]);
  const results = useLiveQuery(async () => (plan ? await db.results.bulkGet(plan.looks) : []), [plan?.looks.join(",")]);
  const baseline = useLiveQuery(async () => (baselineId ? ((await db.baselines.get(baselineId)) ?? null) : null), [baselineId]);
  const snapshot = useLiveQuery(
    async () => (baselineId ? ((await db.snapshots.get(baselineId))?.snapshot ?? null) : null),
    [baselineId],
  );

  const entries = useMemo(
    () => (results ?? []).flatMap((r) => (r ? [{ key: r.clientRequestId, blob: r.image }] : [])),
    [results],
  );
  const urls = useObjectUrls(entries);
  const baselineUrl = useObjectUrl(baseline?.image);
  const browRecord = useLiveQuery(async () => (baselineId ? ((await db.browRecords.get(baselineId)) ?? null) : null), [baselineId]);
  const browUrl = useObjectUrl(browRecord?.image);

  const looks: PlanLook[] = useMemo(
    () =>
      (plan?.looks ?? []).flatMap((id, i) => {
        const row = rows?.[i];
        if (!row || row.spec.kind !== "route") return [];
        const styleId = row.spec.styleId;
        const style = styles.find((s) => s.id === styleId);
        if (!style) return [];
        const routeId = row.spec.routeId;
        return [
          {
            row,
            style,
            ownColour: row.spec.colour.source === "own",
            imageUrl: urls.get(id),
            imageBlob: results?.[i]?.image,
            stage: routeId === "regrowth-3m" || routeId === "regrowth-6m" || routeId === "regrowth-12m" ? routeId : undefined,
          },
        ];
      }),
    [plan?.looks, rows, urls, results],
  );

  return {
    ready: plan !== undefined && rows !== undefined && results !== undefined,
    plan: plan as PlanRow | null | undefined,
    looks,
    baselineUrl,
    baselineBlob: baseline?.image,
    /** The cropped photo of the user's own brows, once they have made a Brow Record. */
    browBlob: browRecord?.image,
    browUrl,
    snapshot: snapshot as IdentitySnapshot | null | undefined,
    isSample: useJourney((j) => j.isSample),
    personaId: useJourney((j) => j.personaId),
  };
}
