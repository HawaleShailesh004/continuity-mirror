import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEverything, db, type JobRow } from "@/lib/client/db";
import { fixtureJob } from "@/lib/client/fixtures";
import { applyJob, send, storeResult, whenIdle } from "@/lib/client/jobs";
import { afterRepair, checkEnabled, checkStored } from "@/lib/client/check/run";
import { hexToLab } from "@/lib/client/check/colour";
import type { Measurement } from "@/lib/client/check/measure";
import type { Point } from "@/lib/client/capture/checks";
import { ApiError } from "@/lib/client/api";
import { errorBody } from "@/lib/contracts/errors";
import type { JobSpec } from "@/lib/contracts";

const mockApi = vi.hoisted(() => ({ createJob: vi.fn(), job: vi.fn(), result: vi.fn() }));
vi.mock("@/lib/client/api", async (original) => ({ ...(await original<typeof import("@/lib/client/api")>()), api: mockApi }));

// measure() is replaced by a lookup on the blob's text, so no MediaPipe and no pixels are needed.
const MEASURES = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/client/check/measure", () => ({
  measure: async (blob: Blob) => {
    const m = MEASURES.get(await blob.text());
    if (!m) throw new Error("no measurement for this blob");
    return m;
  },
}));

const BASELINE = "b".repeat(64);
const ID = "33333333-3333-4333-8333-333333333333";
const REPAIR_ID = "44444444-4444-4444-8444-444444444444";
const SIZE = { width: 768, height: 1024 };
const FACE: Record<number, [number, number]> = {
  33: [300, 400], 133: [345, 402], 159: [322, 392], 145: [322, 410], 362: [425, 402], 263: [470, 400], 386: [448, 392], 374: [448, 410],
  6: [384, 400], 1: [384, 470], 98: [360, 490], 327: [408, 490], 61: [340, 560], 291: [430, 558], 13: [385, 552], 14: [385, 572], 152: [384, 680],
};
const landmarks = (): Point[] => {
  const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [i, [x, y]] of Object.entries(FACE)) pts[Number(i)] = { x: x / SIZE.width, y: y / SIZE.height };
  return pts;
};
const measurement = (hex: string): Measurement => ({ size: SIZE, landmarks: landmarks(), hair: { lab: hexToLab(hex), hex, coverage: 0.25 } });

const spec: JobSpec = { kind: "route", routeId: "closest", styleId: "short-bob", colour: { source: "own", hex: "#2A1D18" }, attempt: 0 };
const sourceJob = () => ({ ...fixtureJob({ id: "job-1", routeId: "closest", styleId: "short-bob" }), resultReady: true });

beforeEach(async () => {
  vi.resetAllMocks();
  MEASURES.clear();
  await clearEverything();
  MEASURES.set("baseline", measurement("#211B13"));
});

async function seed(resultText: string, check?: JobRow["check"]) {
  await db.baselines.put({ id: BASELINE, image: new Blob(["baseline"]), width: 768, height: 1024, source: "camera", createdAt: "", expiresAt: "" });
  await db.jobs.add({ clientRequestId: ID, baselineId: BASELINE, routeKey: "closest", spec, jobId: "job-1", job: sourceJob(), result: "stored", check, createdAt: new Date().toISOString() });
  await db.results.put({ clientRequestId: ID, baselineId: BASELINE, image: new Blob([resultText]), provenance: sourceJob().provenance, createdAt: "" });
}

describe("checkStored", () => {
  it("records a pass and spends nothing when the colour was kept", async () => {
    MEASURES.set("kept", measurement("#251F16"));
    await seed("kept");

    await checkStored(ID);

    expect((await db.jobs.get(ID))?.check).toMatchObject({ outcome: "checked", colour: { status: "kept" }, face: { status: "unchanged" } });
    expect(mockApi.createJob).not.toHaveBeenCalled();
  });

  it("asks for one repair with the baseline's measured colour when the colour drifted", async () => {
    MEASURES.set("drifted", measurement("#33261D"));
    mockApi.createJob.mockResolvedValue({ job: fixtureJob({ id: "job-2", routeId: "closest", styleId: "short-bob", status: "running" }) });
    await seed("drifted");

    await checkStored(ID);
    await whenIdle();

    const source = await db.jobs.get(ID);
    expect(source?.check).toMatchObject({ outcome: "repairable", repaired: { state: "queued" } });
    expect(mockApi.createJob).toHaveBeenCalledTimes(1);
    const sent = mockApi.createJob.mock.calls[0]![0].spec;
    expect(sent).toMatchObject({ kind: "repair", fromJobId: "job-1" });
    expect(sent.colourHex).toBe(source?.check?.repairHex); // the nudged colour, not the raw baseline hex
    const repairRow = (await db.jobs.toArray()).find((r) => r.repairOf === ID)!;
    expect(repairRow.routeKey).toBe(`repair~${ID}`); // matches no path, so no screen lists it
  });

  it("checks a result only once", async () => {
    MEASURES.set("kept", measurement("#251F16"));
    await seed("kept");
    await checkStored(ID);
    const first = (await db.jobs.get(ID))?.check?.checkedAt;
    MEASURES.set("kept", measurement("#000000"));
    await checkStored(ID);
    expect((await db.jobs.get(ID))?.check?.checkedAt).toBe(first);
  });

  it("leaves the result alone if measuring fails", async () => {
    await seed("unknown-blob");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkStored(ID);
    expect((await db.jobs.get(ID))?.check).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("is off in mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKS", "1");
    expect(checkEnabled()).toBe(false);
    vi.unstubAllEnvs();
    expect(checkEnabled()).toBe(true);
  });
});

describe("repair rows", () => {
  const repairing: NonNullable<JobRow["check"]> = {
    outcome: "repairable",
    face: { status: "unchanged", drift: 0.01 },
    colour: { status: "drifted", baselineHex: "#211B13", resultHex: "#33261D", deltaE: 7 },
    repairHex: "#211B13",
    repaired: { state: "queued" },
    checkedAt: "",
  };

  async function addRepairRow() {
    const job = { ...fixtureJob({ id: "job-2", routeId: "closest", styleId: "short-bob" }), resultReady: true };
    await db.jobs.add({ clientRequestId: REPAIR_ID, baselineId: BASELINE, routeKey: `repair~${ID}`, spec: { kind: "repair", fromJobId: "job-1", colourHex: "#211B13" }, repairOf: ID, jobId: "job-2", job, result: "none", createdAt: "" });
    return (await db.jobs.get(REPAIR_ID))!;
  }

  it("a finished repair replaces the source image, keeps the original and adds its step to the provenance", async () => {
    await seed("drifted", repairing);
    mockApi.result.mockResolvedValue(new Blob(["fixed"], { type: "image/jpeg" }));
    const before = (await db.results.get(ID))!.provenance.steps.length;

    await storeResult(await addRepairRow());

    const result = (await db.results.get(ID))!;
    expect(await result.image.text()).toBe("fixed");
    expect(await result.original!.text()).toBe("drifted");
    expect(result.provenance.steps.length).toBeGreaterThan(before);
    expect(await db.results.count()).toBe(1); // the repair is not a result of its own
  });

  it("keeps the corrected image and marks the check adjusted when the colour got closer", async () => {
    MEASURES.set("fixed", measurement("#231C14"));
    await seed("fixed", repairing);
    await db.results.update(ID, { original: new Blob(["drifted"]) });

    await afterRepair(ID);

    const check = (await db.jobs.get(ID))!.check!;
    expect(check).toMatchObject({ outcome: "checked", repaired: { state: "adjusted" } });
    expect(check.repaired!.deltaEAfter).toBeLessThan(2);
    expect(await (await db.results.get(ID))!.image.text()).toBe("fixed");
  });

  it("puts the first image back when the repair did not help", async () => {
    MEASURES.set("worse", measurement("#4A3226"));
    await seed("worse", repairing);
    await db.results.update(ID, { original: new Blob(["drifted"]) });

    await afterRepair(ID);

    expect((await db.jobs.get(ID))!.check!.repaired!.state).toBe("failed");
    const result = (await db.results.get(ID))!;
    expect(await result.image.text()).toBe("drifted");
    expect(result.original).toBeUndefined();
  });

  it("a repair that could not be created, or failed upstream, is recorded on the source", async () => {
    await seed("drifted", repairing);
    mockApi.createJob.mockRejectedValue(new ApiError(errorBody("SESSION_BUDGET_EXHAUSTED"), 403));
    await send(await addRepairRow());
    expect((await db.jobs.get(ID))!.check!.repaired!.state).toBe("failed");

    await db.jobs.update(ID, { check: { ...repairing } });
    await applyJob(REPAIR_ID, fixtureJob({ id: "job-2", routeId: "closest", styleId: "short-bob", status: "failed", error: errorBody("INTERNAL") }));
    expect((await db.jobs.get(ID))!.check!.repaired!.state).toBe("failed");
  });
});
