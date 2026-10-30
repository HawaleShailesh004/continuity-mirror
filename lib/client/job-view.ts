/*
 * How a stored job row looks to a screen: a status, the steps to show, the
 * error if any, and whether it is "taking longer". Rows that haven't had an
 * answer yet (still sending) show the steps the pipeline WILL take, pending.
 */
import { catalog, planSteps } from "@/lib/catalog";
import type { ErrorBody, Job } from "@/lib/contracts";
import { rowError, rowStatus, type JobRow } from "./db";

/** After this long without a result, say so calmly (plan §3.2 JobProgress). */
export const SLOW_AFTER_MS = 45_000;

export type RowView = {
  status: Job["status"];
  steps: Job["steps"];
  error?: ErrorBody;
  slow: boolean;
};

export function viewRow(row: JobRow, now: number): RowView {
  const state = rowStatus(row);
  const status: Job["status"] = state === "sending" ? "queued" : state;
  const steps: Job["steps"] =
    row.job?.steps ??
    planSteps(row.spec, catalog).map((p) => ({ kind: p.kind, units: p.units, status: "pending" as const }));
  // now is 0 until the screen has mounted: never "slow" before we know the time.
  const slow = now > 0 && (status === "queued" || status === "running") && now - Date.parse(row.createdAt) > SLOW_AFTER_MS;
  return { status, steps, error: rowError(row), slow };
}
