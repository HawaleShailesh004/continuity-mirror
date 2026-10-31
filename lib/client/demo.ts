/*
 * Sample mode: the four AI-generated sample people with their GENUINE YouCam
 * results (public/demo/manifest.json, made by Backend's B5 in live mode). The
 * results are installed in IndexedDB as already-finished jobs, so every screen
 * (Paths, Compare, Plan, Export) works on them exactly as on a real session:
 * no API call, instant, and it works offline. Nothing is made up: each image
 * carries its real task ids in "How this was made".
 */
import { DemoManifest, type DemoItem, type DemoPersona } from "@/lib/contracts/demo";
import type { Job } from "@/lib/contracts";
import { STEP_META } from "@/lib/catalog";
import { db, type JobRow } from "./db";
import { newRequestId } from "./jobs";

export const DEMO_PREFIX = "demo-";
export const isDemoBaseline = (id: string | undefined): id is string => Boolean(id?.startsWith(DEMO_PREFIX));

let manifest: Promise<DemoManifest> | undefined;

/** Fetched once per page (not bundled: it holds every provenance record). */
export function loadManifest(): Promise<DemoManifest> {
  manifest ??= fetch("/demo/manifest.json", { credentials: "same-origin" })
    .then((res) => {
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      return res.json();
    })
    .then((json) => DemoManifest.parse(json))
    .catch((error) => {
      manifest = undefined; // allow a retry
      throw error;
    });
  return manifest;
}

/** The originals of the three paths, and the one precomputed variant of the first. */
const ROUTE_KEYS = new Set(["closest", "easier", "new-chapter"]);

/** Installed only when the person opens that module (like a live session, where they are made on request). */
export const DEMO_REGROWTH_KEYS = ["regrowth-3m", "regrowth-6m", "regrowth-12m"] as const;
export const DEMO_BROWS_KEY = "brows";

function toJob(baselineId: string, item: DemoItem): Job {
  return {
    id: item.jobId,
    baselineId,
    clientRequestId: newRequestId(),
    spec: item.spec,
    status: "succeeded",
    steps: item.provenance.steps.map((step) => ({
      kind: step.kind,
      status: "succeeded" as const,
      units: STEP_META[step.kind].units,
      youcamTaskId: step.youcamTaskId,
      finishedAt: step.finishedAt,
    })),
    resultReady: true,
    provenance: item.provenance,
    retryAfterMs: 0,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
  };
}

/** What a repair appends in a live session (`storeResult` in jobs.ts): the source's steps, then the Hair Color pass. */
const provenanceOf = (item: DemoItem) =>
  item.repairStep ? { ...item.provenance, steps: [...item.provenance.steps, item.repairStep] } : item.provenance;

/** The first version YouCam returned, for the items a colour repair replaced. */
const fetchOriginals = (items: readonly DemoItem[]) =>
  Promise.all(items.map(async (item) => (item.original ? await (await fetch(item.original)).blob() : undefined)));

/**
 * Put a sample person's baseline, answers and genuine results on the device.
 * Returns the baseline id (`demo-<persona>`: never sent to the API).
 */
export async function installDemo(persona: DemoPersona): Promise<string> {
  const baselineId = `${DEMO_PREFIX}${persona.id}`;
  const baselineImage = await (await fetch(persona.baseline)).blob();

  const wanted = persona.items.filter(
    (item) =>
      item.spec.kind === "route" && ((item.kind === "route" && ROUTE_KEYS.has(item.key)) || item.kind === "variant"),
  );
  const images = await Promise.all(wanted.map(async (item) => (await fetch(item.image)).blob()));
  const originals = await fetchOriginals(wanted);

  await db.transaction("rw", [db.baselines, db.snapshots, db.jobs, db.results], async () => {
    await db.baselines.put({
      id: baselineId,
      image: baselineImage,
      width: 768,
      height: 1024,
      source: "sample",
      personaId: persona.id,
      createdAt: new Date().toISOString(),
      // A sample lives only on this device: it never expires server-side.
      expiresAt: "9999-12-31T00:00:00.000Z",
    });
    await db.snapshots.put({ baselineId, snapshot: persona.snapshot });
    await db.jobs.where("baselineId").equals(baselineId).delete();
    await db.results.where("baselineId").equals(baselineId).delete();

    for (const [i, item] of wanted.entries()) {
      const job = toJob(baselineId, item);
      const isVariant = item.kind === "variant";
      const row: JobRow = {
        clientRequestId: job.clientRequestId,
        baselineId,
        routeKey: isVariant ? `closest~${item.key}` : item.key,
        variantOf: isVariant ? "closest" : undefined,
        spec: item.spec,
        jobId: job.id,
        job,
        result: "stored",
        note: item.note,
        // Measured when the samples were built, so the Checked row shows and nothing re-runs on the device.
        check: item.check,
        createdAt: item.createdAt,
      };
      await db.jobs.put(row);
      await db.results.put({
        clientRequestId: job.clientRequestId,
        baselineId,
        image: images[i]!,
        original: originals[i],
        provenance: provenanceOf(item),
        createdAt: item.createdAt,
      });
    }
  });
  return baselineId;
}

/**
 * Put some more of a sample person's genuine results on the device (their
 * brow preview, their regrowth stages). Called when the person asks for them,
 * the way a live session makes them on request. Already-installed keys are
 * left alone, so tapping twice is harmless.
 */
export async function installDemoItems(personaId: string, keys: readonly string[]): Promise<void> {
  const manifest = await loadManifest();
  const persona = manifest.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error(`unknown persona ${personaId}`);
  const baselineId = `${DEMO_PREFIX}${persona.id}`;

  const have = new Set((await db.jobs.where("baselineId").equals(baselineId).toArray()).map((r) => r.routeKey));
  const wanted = persona.items.filter((item) => keys.includes(item.key) && !have.has(item.key));
  const images = await Promise.all(wanted.map(async (item) => (await fetch(item.image)).blob()));
  const originals = await fetchOriginals(wanted);

  await db.transaction("rw", [db.jobs, db.results], async () => {
    for (const [i, item] of wanted.entries()) {
      const job = toJob(baselineId, item);
      await db.jobs.put({
        clientRequestId: job.clientRequestId,
        baselineId,
        routeKey: item.key,
        spec: item.spec,
        jobId: job.id,
        job,
        result: "stored",
        note: item.note,
        check: item.check,
        createdAt: item.createdAt,
      });
      await db.results.put({
        clientRequestId: job.clientRequestId,
        baselineId,
        image: images[i]!,
        original: originals[i],
        provenance: provenanceOf(item),
        createdAt: item.createdAt,
      });
    }
  });
}

/** The three planned paths of an installed sample person, from the very specs their results were made with. */
export async function demoRoutes(baselineId: string) {
  const rows = await db.jobs.where("baselineId").equals(baselineId).toArray();
  return rows
    // Regrowth stages are route jobs too: only the three paths belong here.
    .filter((r) => !r.variantOf && r.spec.kind === "route" && ROUTE_KEYS.has(r.routeKey))
    .sort((a, b) => ["closest", "easier", "new-chapter"].indexOf(a.routeKey) - ["closest", "easier", "new-chapter"].indexOf(b.routeKey))
    .map((r) => {
      const spec = r.spec as Extract<typeof r.spec, { kind: "route" }>;
      return {
        routeKey: r.routeKey as "closest" | "easier" | "new-chapter",
        routeId: spec.routeId,
        styleId: spec.styleId,
        colour: spec.colour,
      };
    });
}

/** Which of these baselines are samples (they never reach the server or YouCam). */
export const demoBaselineIds = (baselines: readonly { id: string }[]) =>
  new Set(baselines.filter((b) => isDemoBaseline(b.id)).map((b) => b.id));
