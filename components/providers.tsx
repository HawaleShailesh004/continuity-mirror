"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { api, ApiError } from "@/lib/client/api";
import { db, type JobRow } from "@/lib/client/db";
import { applyJob, isTerminal, needsPolling, resumeUnsent, storeResult } from "@/lib/client/jobs";
import { useJourney } from "@/lib/client/store";

/*
 * One poller per active job. It asks the server about the job every
 * `job.retryAfterMs` (the server's own pacing hint), writes the latest copy to
 * IndexedDB, and copies the finished image onto the device the moment it's
 * ready. Screens never poll: they read IndexedDB, so a reload resumes here.
 */
function JobPoller({ row }: { row: JobRow }) {
  const query = useQuery({
    queryKey: ["job", row.jobId],
    queryFn: () => api.job(row.jobId!),
    gcTime: 0,
    staleTime: 0,
    refetchInterval: (q) => {
      const job = q.state.data?.job ?? row.job;
      if (!job) return 2000;
      if (!isTerminal(job.status)) return Math.max(job.retryAfterMs, 1000);
      return job.status === "succeeded" && row.result === "none" ? 2000 : false;
    },
    retry: (count, error) => (error instanceof ApiError ? error.body.retryable && count < 5 : count < 3),
    retryDelay: (_, error) => (error instanceof ApiError && error.retryAfterMs ? error.retryAfterMs : 2000),
  });

  // Latest server copy → IndexedDB.
  useEffect(() => {
    if (query.data) void applyJob(row.clientRequestId, query.data.job);
  }, [query.data, row.clientRequestId]);

  // The job is gone or refused for good (e.g. expired after 24 h): surface it, let the user retry.
  useEffect(() => {
    if (query.error instanceof ApiError && !query.error.body.retryable) {
      void db.jobs.update(row.clientRequestId, { sendError: query.error.body });
    }
  }, [query.error, row.clientRequestId]);

  // Result ready → copy it onto the device straight away.
  useEffect(() => {
    if (row.job?.resultReady && row.result === "none") void storeResult(row);
  }, [row]);

  return null;
}

function JobPollers() {
  const rows = useLiveQuery(() => db.jobs.filter(needsPolling).toArray(), []);
  return (
    <>
      {rows?.map((row) => (
        <JobPoller key={row.clientRequestId} row={row} />
      ))}
    </>
  );
}

/** After a reload, anything that never got an answer is sent again (same id, so no duplicate). */
function ResumeUnsent() {
  const { hydrated, baselineId } = useJourney();
  useEffect(() => {
    if (hydrated && baselineId) void resumeUnsent(baselineId);
  }, [hydrated, baselineId]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <JobPollers />
      <ResumeUnsent />
    </QueryClientProvider>
  );
}
