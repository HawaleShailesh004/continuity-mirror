"use client";

import { useSyncExternalStore } from "react";
import { formatDateTimeLocal, formatDateTimeUtc } from "@/lib/client/format";

const noop = () => () => {};

/*
 * A moment in the user's own locale and time zone. The server can't know
 * either, so it renders UTC and the browser swaps to local right after
 * hydrating (useSyncExternalStore keeps hydration matched, no flash of error).
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noop,
    () => formatDateTimeLocal(iso),
    () => formatDateTimeUtc(iso),
  );
  return <time dateTime={iso}>{text}</time>;
}
