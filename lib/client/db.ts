/*
 * Local-first storage (frontend plan §5.1). Images are Blobs in IndexedDB, never
 * in localStorage, and nothing here leaves the device. Dexie is the single
 * source of truth for the journey: screens read it with live queries and the
 * job poller writes to it, so a reload resumes exactly where it was.
 */
import Dexie, { type EntityTable } from "dexie";
import type { ErrorBody, IdentitySnapshot, Job, JobSpec, Plan, Provenance, Verdict } from "@/lib/contracts";

export type BaselineRow = {
  /** baselineId from the server (sha256 of the normalised bytes). */
  id: string;
  /** The exact pixels YouCam sees: the server-normalised JPEG. */
  image: Blob;
  width: number;
  height: number;
  source: "camera" | "upload" | "sample";
  personaId?: string;
  createdAt: string;
  /** Server-side expiry of the uploaded copy. */
  expiresAt: string;
};

export type JobRow = {
  /**
   * Primary key. Generated and stored BEFORE the request is sent, so a reload
   * mid-send re-sends the same id and the server returns the same job (no
   * duplicate, no extra units). A retry after failure gets a new row.
   */
  clientRequestId: string;
  baselineId: string;
  /** Which path this belongs to: "closest" | "easier" | "new-chapter" | "tweak:<n>". */
  routeKey: string;
  /** Set for variants and colour tries of a path; the originals have none. */
  variantOf?: string;
  spec: JobSpec;
  /** Server job id once the create request has been accepted. */
  jobId?: string;
  /** Last copy of the server's job. */
  job?: Job;
  /** The create request itself failed (budget, rate limit, live disabled, offline). */
  sendError?: ErrorBody;
  /** Replaced by a retry; hidden from the UI. */
  superseded?: boolean;
  /** The result image was fetched and stored (or is gone). */
  result: "none" | "stored" | "expired";
  /** Anything to say about this image (a sample result that reuses an identical earlier one). */
  note?: string;
  createdAt: string;
};

export type ResultRow = {
  clientRequestId: string;
  baselineId: string;
  image: Blob;
  provenance: Provenance;
  createdAt: string;
};

export type VerdictRow = Verdict & { baselineId: string };

export type PlanRow = Plan & {
  id: "current";
  /** clientRequestIds of the saved looks, in the order saved. */
  looks: string[];
};

export type SettingRow = { key: string; value: unknown };

/**
 * The Brow Record: the user's own brows, cropped from their baseline, and the
 * recipe they are building from it. The cropped photo never leaves the device.
 */
export type BrowRecordRow = {
  baselineId: string;
  /** JPEG crop of the brow area of the baseline. */
  image: Blob;
  /** The crop, as fractions of the baseline (0–1), so a preview can be cropped the same way. */
  rect: { x: number; y: number; w: number; h: number };
  /** "face": found with the on-device face model. "guess": the model could not run, so this is where brows usually are. */
  found: "face" | "guess";
  shapeId: string;
  darkness: "light" | "medium" | "dark";
  note: string;
  createdAt: string;
};

/**
 * A share link the user made. The owner key is the only way to see the votes or
 * stop sharing (we store only its hash on the server), so it lives here.
 */
export type ShareRow = {
  token: string;
  ownerKey: string;
  url: string;
  /** Labels in the order shared; item keys are i1, i2 … */
  labels: string[];
  expiresAt: string;
  createdAt: string;
};

class CmDatabase extends Dexie {
  baselines!: EntityTable<BaselineRow, "id">;
  snapshots!: EntityTable<{ baselineId: string; snapshot: IdentitySnapshot }, "baselineId">;
  jobs!: EntityTable<JobRow, "clientRequestId">;
  results!: EntityTable<ResultRow, "clientRequestId">;
  verdicts!: EntityTable<VerdictRow, "routeKey">;
  plan!: EntityTable<PlanRow, "id">;
  settings!: EntityTable<SettingRow, "key">;
  browRecords!: EntityTable<BrowRecordRow, "baselineId">;
  shares!: EntityTable<ShareRow, "token">;

  constructor() {
    super("continuity-mirror");
    this.version(1).stores({
      baselines: "&id, createdAt",
      snapshots: "&baselineId",
      jobs: "&clientRequestId, baselineId, routeKey, jobId, createdAt",
      results: "&clientRequestId, baselineId",
      verdicts: "&routeKey, baselineId",
      plan: "&id",
      settings: "&key",
    });
    // F6 (P1 modules): adds tables only; nothing in version 1 changes.
    this.version(2).stores({
      browRecords: "&baselineId",
      shares: "&token",
    });
  }
}

export const db = new CmDatabase();

/** Erase everything on this device (Privacy Centre "delete everything"). */
export async function clearEverything() {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

/** Statuses a job can be in from the UI's point of view. */
export type RowStatus = "sending" | "queued" | "running" | "succeeded" | "failed";

export function rowStatus(row: JobRow): RowStatus {
  if (row.sendError) return "failed";
  if (!row.job) return "sending";
  return row.job.status;
}

/** The error to show for a failed row: a send error, or the job's own. */
export function rowError(row: JobRow): ErrorBody | undefined {
  return row.sendError ?? row.job?.error;
}
