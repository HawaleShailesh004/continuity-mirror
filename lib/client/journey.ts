/*
 * Journey actions: the steps between screens that touch the API and Dexie.
 * Screens call these; they never talk to `fetch` or IndexedDB directly.
 */
import { catalog, planSteps } from "@/lib/catalog";
import type { IdentitySnapshot, JobSpec } from "@/lib/contracts";
import { api } from "./api";
import { dataUrlToBlob } from "./data-url";
import { clearEverything, db, type JobRow, type PlanRow } from "./db";
import { measuredHairHex, prewarmHair } from "./check/hair";
import { enqueue, retry, send } from "./jobs";
import { planRegrowth, planRoutes, type PlannedRoute } from "@/lib/planner";
import { DEMO_BROWS_KEY, DEMO_REGROWTH_KEYS, demoRoutes, installDemo, installDemoItems, isDemoBaseline, loadManifest } from "./demo";
import { stopAllSharing } from "./share";
import { useJourney, type Audience } from "./store";

/**
 * Sample person: their AI-generated photo, their answers and their genuine,
 * precomputed YouCam results, all installed on the device. No API call.
 */
export async function startSample(personaId: string): Promise<void> {
  const manifest = await loadManifest();
  const persona = manifest.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error(`unknown persona ${personaId}`);

  const previous = useJourney.getState().baselineId;
  const baselineId = await installDemo(persona);
  if (previous && previous !== baselineId) await forgetBaseline(previous);
  useJourney.getState().set({ baselineId, isSample: true, personaId, routes: [] });
}

/** Save what the user told us and plan the three paths from it. */
export async function saveSnapshot(baselineId: string, snapshot: IdentitySnapshot): Promise<PlannedRoute[]> {
  await db.snapshots.put({ baselineId, snapshot });
  // A sample person's paths are exactly the ones their genuine results were made with.
  if (isDemoBaseline(baselineId)) {
    const routes = await demoRoutes(baselineId);
    useJourney.getState().set({ routes });
    return routes;
  }
  const { audience } = useJourney.getState();
  const routes = planRoutes(snapshot, { audience });
  useJourney.getState().set({ routes });
  return routes;
}

/** Anything the planner hands back that can become a route job: the three paths, or a regrowth stage. */
type PlannedJob = Pick<PlannedRoute, "routeId" | "styleId" | "colour"> & { routeKey: string };

/** Own-colour routes restore with the hair colour measured from the photo when there is one (see check/hair.ts). */
const routeSpec = (route: PlannedJob, measuredHex?: string | null): JobSpec => ({
  kind: "route",
  routeId: route.routeId,
  styleId: route.styleId,
  colour: route.colour.source === "own" && measuredHex ? { source: "own", hex: measuredHex } : route.colour,
  attempt: 0,
});

/**
 * Make sure each planned path has a live job. Safe to call on every visit:
 * unchanged paths keep their job; a path whose plan changed (the user edited
 * the snapshot) is superseded and re-made; the server also dedupes by spec.
 * The regrowth stages go through here too, under their own route keys.
 */
export async function ensureRouteJobs(baselineId: string, routes: readonly PlannedJob[]): Promise<void> {
  // Sample results are already on the device; there is nothing to make.
  if (isDemoBaseline(baselineId)) return;
  const rows = await db.jobs.where("baselineId").equals(baselineId).toArray();
  const measured = routes.some((r) => r.colour.source === "own") ? await measuredHairHex(baselineId) : null;
  for (const route of routes) {
    const spec = routeSpec(route, measured);
    const current = rows.find((r) => r.routeKey === route.routeKey && !r.superseded && !r.variantOf);
    if (current && JSON.stringify(current.spec) === JSON.stringify(spec)) {
      // Reload mid-send: re-send the same clientRequestId (the server returns the same job).
      if (!current.jobId && !current.sendError) void send(current);
      continue;
    }
    if (current) await db.jobs.update(current.clientRequestId, { superseded: true });
    await enqueue({ baselineId, routeKey: route.routeKey, spec });
  }
}

/** Retry one path (or variant) after it failed. A new clientRequestId; the others are untouched. */
export const retryRow = (row: JobRow) => retry(row);

/** A variant of a path: another style, or the same style in another colour, from the same baseline. */
export function enqueueVariant(
  baselineId: string,
  base: PlannedRoute["routeKey"],
  spec: Extract<JobSpec, { kind: "route" }>,
  key: string,
) {
  return enqueue({ baselineId, routeKey: `${base}~${key}`, variantOf: base, spec });
}

/** "Try a fringe": one YouCam Bangs template on the baseline (1 unit). Its own row key, so no path lists it. */
export function enqueueFringe(baselineId: string, templateId: string) {
  return enqueue({ baselineId, routeKey: `fringe~${templateId}`, spec: { kind: "fringe", templateId, attempt: 0 } });
}

/** Units a spec will cost, for BudgetNote. */
export function unitsFor(spec: JobSpec): number {
  return planSteps(spec, catalog).reduce((sum, s) => sum + s.units, 0);
}

/* ------------------------------------------------------------------ brows */

/**
 * The optional brow preview (1 unit). A new one replaces the old: the old row is
 * hidden, not deleted. A sample person gets their genuine precomputed preview.
 */
export async function makeBrowPreview(input: { baselineId: string; spec: JobSpec; personaId?: string }): Promise<void> {
  if (isDemoBaseline(input.baselineId)) {
    if (!input.personaId) throw new Error("sample person without an id");
    await installDemoItems(input.personaId, [DEMO_BROWS_KEY]);
    return;
  }
  const earlier = await db.jobs.where("baselineId").equals(input.baselineId).filter((r) => r.routeKey === "brows" && !r.superseded).toArray();
  await Promise.all(earlier.map((r) => db.jobs.update(r.clientRequestId, { superseded: true })));
  await enqueue({ baselineId: input.baselineId, routeKey: "brows", spec: input.spec });
}

/* --------------------------------------------------------------- regrowth */

/** The three regrowth stages for this person: the same planner the rest of the app uses. */
export const regrowthStages = (snapshot: IdentitySnapshot, audience: Audience) => planRegrowth(snapshot, { audience });

/** What the three stages would cost, in units, before the person asks for them. */
export const regrowthCost = (stages: readonly PlannedJob[]): number => stages.reduce((n, s) => n + unitsFor(routeSpec(s)), 0);

/**
 * The person asked to see the stages. A real session makes three route jobs
 * (the usual rules: row first, idempotent, retry only the one that failed). A
 * sample person's genuine results are put on the device instead.
 */
export async function startRegrowth(input: {
  baselineId: string;
  snapshot: IdentitySnapshot;
  audience: Audience;
  personaId?: string;
}): Promise<void> {
  if (isDemoBaseline(input.baselineId)) {
    if (!input.personaId) throw new Error("sample person without an id");
    await installDemoItems(input.personaId, DEMO_REGROWTH_KEYS);
    return;
  }
  await ensureRouteJobs(input.baselineId, regrowthStages(input.snapshot, input.audience));
}

/* ------------------------------------------------------------------ plan */

const emptyPlan = (): PlanRow => ({
  id: "current",
  looks: [],
  shortlist: [],
  budget: "mid",
  climate: "temperate",
  careEffort: 2,
  country: "US",
  checklist: {},
});

export async function toggleLook(clientRequestId: string): Promise<boolean> {
  const plan = (await db.plan.get("current")) ?? emptyPlan();
  const saved = !plan.looks.includes(clientRequestId);
  const looks = saved ? [...plan.looks, clientRequestId] : plan.looks.filter((id) => id !== clientRequestId);
  await db.plan.put({ ...plan, looks, shortlist: looks });
  return saved;
}

/** Change the plan's settings (budget, climate, upkeep, country, checklist). Creates the plan if needed. */
export async function updatePlan(patch: Partial<Omit<PlanRow, "id" | "looks">>): Promise<void> {
  const plan = (await db.plan.get("current")) ?? emptyPlan();
  await db.plan.put({ ...plan, ...patch });
}

/* ---------------------------------------------------------------- baseline */

/**
 * Forget a baseline on this device and, best effort, on our server. Used when a
 * photo is replaced (retake) so old previews never sit beside a new face.
 */
export async function forgetBaseline(baselineId: string): Promise<void> {
  void api.deleteBaseline(baselineId).catch(() => undefined);
  await db.transaction("rw", [db.baselines, db.snapshots, db.jobs, db.results, db.verdicts, db.plan, db.browRecords], async () => {
    await db.baselines.delete(baselineId);
    await db.snapshots.delete(baselineId);
    await db.jobs.where("baselineId").equals(baselineId).delete();
    await db.results.where("baselineId").equals(baselineId).delete();
    await db.verdicts.where("baselineId").equals(baselineId).delete();
    await db.browRecords.delete(baselineId);
    // Saved looks and the brow recipe pointed at the old photo.
    const plan = await db.plan.get("current");
    if (plan) await db.plan.put({ ...plan, looks: [], shortlist: [], browRecipe: undefined });
  });
}

/**
 * The user's own photo becomes the baseline. Their earlier answers (if they
 * are retaking) carry over so they don't have to describe their hair twice.
 */
export async function adoptBaseline(photo: Blob, source: "camera" | "upload"): Promise<void> {
  const previous = useJourney.getState().baselineId;
  const created = await api.createBaseline(photo);
  const image = dataUrlToBlob(created.normalisedImage);

  await db.baselines.put({
    id: created.baselineId,
    image,
    width: created.width,
    height: created.height,
    source,
    createdAt: new Date().toISOString(),
    expiresAt: created.expiresAt,
  });
  prewarmHair(created.baselineId);

  if (previous && previous !== created.baselineId) {
    const earlier = await db.snapshots.get(previous);
    if (earlier && !(await db.snapshots.get(created.baselineId))) {
      await db.snapshots.put({ baselineId: created.baselineId, snapshot: earlier.snapshot });
    }
    await forgetBaseline(previous);
  }
  useJourney.getState().set({ baselineId: created.baselineId, isSample: false, personaId: undefined, routes: [] });
}

/* ---------------------------------------------------------- delete everything */

/**
 * "Delete everything": our server's records for each real baseline (best
 * effort; they expire in 24 h anyway), then every table on this device, then
 * the journey itself. YouCam's own 30-day copy can't be deleted by us and the
 * Privacy screen says so.
 */
export async function deleteEverything(): Promise<void> {
  const baselines = await db.baselines.toArray();
  // Share links hold pictures on our server: stop them while we still have their owner keys.
  await stopAllSharing();
  await Promise.allSettled(baselines.filter((b) => !isDemoBaseline(b.id)).map((b) => api.deleteBaseline(b.id)));
  await clearEverything();
  useJourney.getState().reset();
}
