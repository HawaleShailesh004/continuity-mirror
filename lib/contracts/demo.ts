// Shape of public/demo/manifest.json: the sample people and their genuine, precomputed YouCam results
// (built by scripts/build-demo-personas.ts in live mode). Browser-safe.
import { z } from "zod";
import { JobSpec, Provenance } from "./api";
import { IdentitySnapshot, RouteId } from "./domain";
import { ErrorBody } from "./errors";

const IsoDate = z.iso.datetime();
const DemoPath = z.string().regex(/^\/demo\/[a-z0-9_/-]+\.jpg$/);

/** What the on-device result check found for a sample (lib/client/check/judge.ts ResultCheck, same shape). */
export const DemoCheck = z
  .object({
    outcome: z.enum(["checked", "repairable", "needs-look", "unchecked"]),
    face: z.object({ status: z.enum(["unchanged", "changed", "unknown"]), drift: z.number().nullable() }),
    colour: z.object({
      status: z.enum(["kept", "drifted", "skipped"]),
      baselineHex: z.string().nullable(),
      resultHex: z.string().nullable(),
      deltaE: z.number().nullable(),
    }),
    repairHex: z.string().optional(),
    repaired: z.object({ state: z.enum(["queued", "adjusted", "failed"]), deltaEAfter: z.number().optional() }).optional(),
    checkedAt: IsoDate,
  })
  .meta({ id: "DemoCheck" });
export type DemoCheck = z.infer<typeof DemoCheck>;

export const DemoItemKind = z.enum(["route", "variant", "colour", "brows", "regrowth"]).meta({ id: "DemoItemKind" });

/** One genuine result image. `provenance` is exactly what "How this was made" shows (placeholders, real task ids). */
export const DemoItem = z
  .object({
    /** Stable within a persona: closest, easier, new-chapter, variant-1, colour-<preset>, brows, regrowth-3m … */
    key: z.string().regex(/^[a-z0-9-]+$/),
    kind: DemoItemKind,
    routeId: RouteId.optional(),
    label: z.string(),
    spec: JobSpec,
    image: DemoPath,
    units: z.int().nonnegative(),
    seconds: z.number().nonnegative(),
    jobId: z.string(),
    provenance: Provenance,
    /** Anything the UI should say about this image (e.g. brow previews are subtle on brows that are still there). */
    note: z.string().optional(),
    /** The result check, measured when the samples were built (scripts/repair-demo.ts). */
    check: DemoCheck.optional(),
    /** The image YouCam first returned, kept when a colour repair replaced it (`image` is the repaired one). */
    original: DemoPath.optional(),
    /** The Hair Color step that repaired it, shown in "How this was made" after the item's own steps. */
    repairStep: Provenance.shape.steps.element.optional(),
    createdAt: IsoDate,
  })
  .meta({ id: "DemoItem" });
export type DemoItem = z.infer<typeof DemoItem>;

export const DemoFailure = z
  .object({ key: z.string(), kind: DemoItemKind, label: z.string(), spec: JobSpec, error: ErrorBody, createdAt: IsoDate })
  .meta({ id: "DemoFailure" });

export const DemoPersona = z
  .object({
    id: z.enum(["meera", "amara", "daniel", "grace"]),
    name: z.string(),
    pronouns: z.string(),
    age: z.int(),
    /** The normalised baseline YouCam saw (JPEG, long side 1024). AI-generated sample person. */
    baseline: DemoPath,
    /** Provisional tags; hairHex was sampled from the photo. */
    snapshot: IdentitySnapshot,
    items: z.array(DemoItem),
    failures: z.array(DemoFailure),
  })
  .meta({ id: "DemoPersona" });
export type DemoPersona = z.infer<typeof DemoPersona>;

/** A reference style run through Hair Style custom mode on a sample person, to see which ones work. */
export const DemoRefCheck = z
  .object({
    styleId: z.string(),
    personaId: DemoPersona.shape.id,
    image: DemoPath.optional(),
    error: ErrorBody.optional(),
    units: z.int().nonnegative(),
    createdAt: IsoDate,
    /** Set by a human (or the build reviewer) after looking at the image. */
    verdict: z.enum(["good", "usable", "poor"]).optional(),
    note: z.string().optional(),
  })
  .meta({ id: "DemoRefCheck" });

export const DemoManifest = z
  .object({
    version: z.literal(1),
    generatedAt: IsoDate,
    mode: z.literal("live"),
    unitsSpent: z.int().nonnegative(),
    personas: z.array(DemoPersona),
    refChecks: z.array(DemoRefCheck),
  })
  .meta({ id: "DemoManifest" });
export type DemoManifest = z.infer<typeof DemoManifest>;
