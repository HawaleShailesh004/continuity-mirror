import { describe, expect, it } from "vitest";
import { CreateJobRequest, JobSpec, MockScenario } from "@/lib/contracts/api";
import { Hex, IdentitySnapshot } from "@/lib/contracts/domain";
import { ERROR_DEFAULTS, ErrorCode, MESSAGE_KEYS, YOUCAM_ERROR_MAP, fromYoucamCode } from "@/lib/contracts/errors";
import { buildOpenApiDocument } from "@/lib/contracts/openapi";

const baselineId = "a".repeat(64);
const clientRequestId = "6f1c1e5e-2b8a-4c7e-9a43-0f5a0c8a1d2e";

describe("domain", () => {
  it("normalises hex to upper case and rejects shorthand", () => {
    expect(Hex.parse("#1c1714")).toBe("#1C1714");
    expect(Hex.safeParse("#fff").success).toBe(false);
  });

  it("rejects unknown snapshot fields (user-authored data only)", () => {
    const snapshot = {
      colourFamily: "black",
      length: "chin",
      parting: "none",
      fringe: false,
      texture: "coily",
      brows: { shape: "soft-arch", darkness: "dark" },
    };
    expect(IdentitySnapshot.safeParse(snapshot).success).toBe(true);
    expect(IdentitySnapshot.safeParse({ ...snapshot, age: 40 }).success).toBe(false);
  });
});

describe("job specs", () => {
  it("defaults attempt to 0 and accepts every colour source", () => {
    for (const colour of [{ source: "own", hex: "#3b2a20" }, { source: "template" }, { source: "preset", presetId: "soft-copper", mode: "ombre" }]) {
      const spec = JobSpec.parse({ kind: "route", routeId: "closest", styleId: "short-bob", colour });
      expect(spec.kind === "route" && spec.attempt).toBe(0);
    }
  });

  it("rejects raw YouCam parameters smuggled into a spec", () => {
    const req = { baselineId, clientRequestId, spec: { kind: "route", routeId: "closest", styleId: "short-bob", colour: { source: "template" }, template_id: "x" } };
    expect(CreateJobRequest.safeParse(req).success).toBe(false);
  });

  it("clamps brow sliders to documented ranges", () => {
    const base = { kind: "brows", browShapeId: "SoftArch1", curvature: 0, thickness: 0, definition: 50, colourHex: "#2B1E16", intensity: 60 };
    expect(JobSpec.safeParse(base).success).toBe(true);
    expect(JobSpec.safeParse({ ...base, curvature: 101 }).success).toBe(false);
    expect(JobSpec.safeParse({ ...base, definition: -1 }).success).toBe(false);
  });

  it("rejects headwear jobs (out of core since B0)", () => {
    expect(JobSpec.safeParse({ kind: "headwear", headwearId: "beanie" }).success).toBe(false);
  });
});

describe("errors", () => {
  it("every message key the backend can emit is listed", () => {
    const emitted = [...Object.values(ERROR_DEFAULTS), ...Object.values(YOUCAM_ERROR_MAP)].map((e) => e.messageKey);
    for (const key of emitted) expect(MESSAGE_KEYS).toContain(key);
  });

  it("covers every error code", () => {
    expect(Object.keys(ERROR_DEFAULTS).sort()).toEqual([...ErrorCode.options].sort());
  });

  it("maps observed and unknown YouCam codes", () => {
    expect(fromYoucamCode("error_no_face")).toMatchObject({ code: "YOUCAM_REJECTED", messageKey: "capture.retake.faceVisible", retryable: false, youcamCode: "error_no_face" });
    expect(fromYoucamCode("error_hair_too_short").messageKey).toBe("capture.hairTooShort");
    expect(fromYoucamCode("something_new")).toMatchObject({ code: "YOUCAM_UNAVAILABLE", retryable: true });
  });
});

describe("openapi", () => {
  it("documents every endpoint and mock scenario", () => {
    const doc = buildOpenApiDocument();
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining(["/api/status", "/api/baselines", "/api/baselines/{id}", "/api/jobs", "/api/jobs/{id}", "/api/jobs/{id}/result", "/api/privacy/receipt", "/api/shares"]),
    );
    expect(JSON.stringify(doc.components?.schemas?.MockScenario)).toContain(MockScenario.options.at(-1)!);
  });
});
