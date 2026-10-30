/*
 * data: URL → Blob without fetch(). The production CSP has `connect-src 'self'`,
 * which (rightly) forbids fetching data: URLs, so `await (await fetch(dataUrl)).blob()`
 * works in dev and fails in production. Decoding the base64 ourselves needs no
 * network permission at all.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) throw new Error("not a data URL");

  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = meta.split(";")[0] || "application/octet-stream";

  if (!meta.endsWith(";base64")) return new Blob([decodeURIComponent(payload)], { type: mime });

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
