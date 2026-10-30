/*
 * Fixture data for the static screens (F1) and /dev/states. Everything here is
 * a valid contract object, so screens built on it keep working when the real
 * API replaces it in F2. Images are the AI-generated sample person Amara and
 * genuine B0 YouCam results (docs/ASSETS.md). Provenance is built by the real
 * step planner but labelled `mock`: these fixtures are not live task records.
 */
import { catalog, planSteps, styles, type StyleCatalogItem } from "@/lib/catalog";
import type { IdentitySnapshot, Job, JobSpec, PrivacyReceipt, RouteId } from "@/lib/contracts";
import { errorBody } from "@/lib/contracts/errors";
import { PERSONAS, RESULT_IMAGES } from "@/lib/contracts/mocks/fixtures";

export const persona = PERSONAS.find((p) => p.id === "amara")!;
export const personaSnapshot: IdentitySnapshot = persona.snapshot;

const BASELINE_ID = "a".repeat(64);
const WHEN = "2026-10-26T12:30:00.000Z";

export const styleById = (id: string): StyleCatalogItem => {
  const style = styles.find((s) => s.id === id);
  if (!style) throw new Error(`fixture style missing from catalog: ${id}`);
  return style;
};

export type FixtureRoute = {
  routeId: RouteId;
  styleId: string;
  /** Genuine B0 result shown for this route. */
  image: string;
  hex: string;
};

/** The three paths for Amara, each backed by a real YouCam output. */
export const fixtureRoutes: readonly FixtureRoute[] = [
  { routeId: "closest", styleId: "coily-chin", image: RESULT_IMAGES.coilyChin, hex: "#1C1714" },
  { routeId: "easier", styleId: "bob-curly", image: RESULT_IMAGES.curlyBobOwnColour, hex: "#1C1714" },
  { routeId: "new-chapter", styleId: "bob-curly", image: RESULT_IMAGES.curlyBobTemplateColour, hex: "#1C1714" },
];

export function fixtureJob({
  id,
  routeId,
  styleId,
  status = "succeeded",
  runningStep = 0,
  error,
}: {
  id: string;
  routeId: RouteId;
  styleId: string;
  status?: Job["status"];
  /** Index of the step that is running (when status is `running`). */
  runningStep?: number;
  error?: Job["error"];
}): Job {
  const spec: JobSpec = {
    kind: "route",
    routeId,
    styleId,
    colour: { source: "own", hex: "#1C1714" },
    attempt: 0,
  };
  const planned = planSteps(spec, catalog);
  const steps = planned.map((p, i): Job["steps"][number] => ({
    kind: p.kind,
    units: p.units,
    status:
      status === "succeeded"
        ? "succeeded"
        : status === "queued"
          ? "pending"
          : status === "failed"
            ? i === 0
              ? "failed"
              : "pending"
            : i < runningStep
              ? "succeeded"
              : i === runningStep
                ? "running"
                : "pending",
  }));

  return {
    id,
    baselineId: BASELINE_ID,
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    spec,
    status,
    steps,
    error,
    resultReady: status === "succeeded",
    provenance: {
      mode: "mock",
      steps: planned.map((p) => ({
        kind: p.kind,
        endpoint: p.endpoint,
        apiVersion: p.apiVersion,
        params: p.body,
        finishedAt: status === "succeeded" ? WHEN : undefined,
      })),
    },
    retryAfterMs: status === "running" || status === "queued" ? 2000 : 0,
    createdAt: WHEN,
    updatedAt: WHEN,
  };
}

export const failedError = errorBody("YOUCAM_UNAVAILABLE");

export const fixtureReceipt: PrivacyReceipt = {
  baselines: [{ baselineId: BASELINE_ID, youcamFileId: "fixture-file-0001", createdAt: WHEN, expiresAt: "2026-10-27T12:30:00.000Z" }],
  jobs: ["closest", "easier", "new-chapter"].map((kind, i) => ({
    id: `fixture-job-${i + 1}`,
    baselineId: BASELINE_ID,
    kind: "route" as const,
    endpoints: ["/s2s/v2.1/task/hair-transfer", "/s2s/v2.0/task/hair-color"],
    youcamTaskIds: [`fixture-task-${kind}-1`, `fixture-task-${kind}-2`],
    createdAt: WHEN,
    expiresAt: "2026-10-27T12:30:00.000Z",
  })),
  shares: [],
  serverStoresImages: false,
  upstream: { provider: "YouCam", retentionDays: 30 },
};
