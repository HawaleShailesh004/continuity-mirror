/**
 * "26 Oct 2026". For calendar dates ("checked on"): fixed locale and UTC, so
 * the server and the browser always render the same text.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

/** Server-safe fallback for a moment in time: "26 Oct 2026, 12:30 UTC". */
export function formatDateTimeUtc(iso: string): string {
  return `${new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

/** A moment in time in the user's own locale and time zone. Browser only (see LocalTime). */
export function formatDateTimeLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
