"use client";

import { addTransitionType, startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import type { Capabilities } from "@/lib/contracts";
import { api } from "./api";
import { db } from "./db";
import { useJourney } from "./store";

/** An object URL for a stored Blob, revoked when it changes or the screen unmounts. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    // An object URL is an external resource: created and revoked with the Blob it points at.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

/** Object URLs for many stored Blobs at once, keyed by id. All revoked on change or unmount. */
export function useObjectUrls(entries: readonly { key: string; blob: Blob }[] | undefined): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const next = new Map((entries ?? []).map(({ key, blob }) => [key, URL.createObjectURL(blob)] as const));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URLs are external resources
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [entries]);
  return urls;
}

/**
 * Current time, refreshed every `ms`. For "taking longer than usual" states.
 * 0 until mounted: Date.now() during render would be frozen into the prerender.
 */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}

/**
 * Navigate with the same forward/back page transition a <Link> gets
 * (transitionTypes), for moves that follow an async action.
 */
export function useNavigate() {
  const router = useRouter();
  return (href: string, direction: "forward" | "back" = "forward") => {
    startTransition(() => {
      addTransitionType(direction === "forward" ? "nav-forward" : "nav-back");
      router.push(href);
    });
  };
}

/** What the server will let the UI offer right now. Re-checked every minute on flow screens. */
export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Whether the server offers a module right now (frontend plan §12, F6: an
 * unfinished or switched-off module never shows). `undefined` while the answer
 * is loading, so entry points stay hidden rather than flashing in and out.
 */
export function useCapability(name: keyof Capabilities): boolean | undefined {
  return useStatus().data?.capabilities[name];
}

/** Where a screen's prerequisites are missing, we send the user back to. */
const NEEDS = {
  baseline: "/start/capture",
  snapshot: "/start/snapshot",
  routes: "/start/snapshot",
} as const;

export type Need = keyof typeof NEEDS;

/**
 * Guard for journey screens (plan §5.2): once the persisted journey has loaded,
 * redirect if a prerequisite is missing (e.g. /paths without a baseline goes to
 * capture). Returns true when the screen may render.
 */
export function useJourneyGuard(need: Need): boolean {
  const navigate = useNavigate();
  const { hydrated, baselineId, routes } = useJourney();

  const baseline = useLiveQuery(async () => (baselineId ? ((await db.baselines.get(baselineId)) ?? null) : null), [baselineId]);
  const snapshot = useLiveQuery(
    async () => (baselineId ? ((await db.snapshots.get(baselineId)) ?? null) : null),
    [baselineId],
  );

  const loaded = hydrated && baseline !== undefined && snapshot !== undefined;
  const ok =
    need === "baseline" ? Boolean(baseline) : need === "snapshot" ? Boolean(baseline) : Boolean(baseline && snapshot && routes.length);
  const target = need === "baseline" || !baseline ? NEEDS.baseline : NEEDS[need];

  useEffect(() => {
    if (loaded && !ok) navigate(target, "back");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is recreated each render
  }, [loaded, ok, target]);

  return loaded && ok;
}
