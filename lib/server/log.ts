import "server-only";

// One JSON line per event. Never log image data, signed URLs, raw IPs, cookies or keys.
type Fields = Record<string, string | number | boolean | null | undefined>;

let sink: ((line: Fields) => void) | undefined;

/** Tests capture log lines instead of printing them. */
export function setLogSink(fn: ((line: Fields) => void) | undefined) {
  sink = fn;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = { level, event, at: new Date().toISOString(), ...fields };
  if (sink) return sink(line);
  if (process.env.NODE_ENV === "test") return;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(line));
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};
