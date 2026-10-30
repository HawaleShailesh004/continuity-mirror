import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { catalog, SRC_BASELINE, SRC_PREVIOUS, SRC_SOURCE_RESULT, SRC_STYLE_REF, type CatalogLookup } from "@/lib/catalog";
import type { MockScenario } from "@/lib/contracts/api";
import { keys, TTL } from "../keys";
import type { KV } from "../store/kv";
import type { YouCamAdapter } from "../youcam/adapter";

/**
 * Fill a planned step body's placeholders with real sources. Bodies come only from
 * lib/catalog/pipeline (an allowlist), so nothing the client sent reaches YouCam unmapped.
 */
export function fillBody(body: Record<string, unknown>, src: { baselineFileId: string; previousResultUrl?: string; styleRefFileId?: string; sourceResultUrl?: string }) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === SRC_BASELINE) out[key] = src.baselineFileId;
    else if (value === SRC_PREVIOUS) {
      if (!src.previousResultUrl) throw new Error(`no previous result for ${key}`);
      out[key] = src.previousResultUrl;
    } else if (value === SRC_SOURCE_RESULT) {
      if (!src.sourceResultUrl) throw new Error(`no source result for ${key}`);
      out[key] = src.sourceResultUrl;
    } else if (value === SRC_STYLE_REF) {
      if (!src.styleRefFileId) throw new Error(`no style reference for ${key}`);
      out[key] = src.styleRefFileId;
    } else out[key] = value;
  }
  return out;
}

export function needsStyleRef(body: Record<string, unknown>) {
  return Object.values(body).includes(SRC_STYLE_REF);
}

/**
 * Upload a catalog style reference (public/catalog/refs) once and cache its file id. The images ship
 * with the functions via outputFileTracingIncludes in next.config.ts.
 */
export async function styleRefFileId(
  ctx: { kv: KV; youcam: YouCamAdapter },
  styleId: string,
  meta: { mockScenario?: MockScenario },
  lookup: CatalogLookup = catalog,
): Promise<string> {
  const cached = await ctx.kv.get<string>(keys.styleRef(styleId));
  if (cached) return cached;
  const style = lookup.style(styleId)?.style;
  if (style?.source !== "reference") throw new Error(`style ${styleId} has no reference image`);
  const bytes = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), "public", style.refPath));
  const { fileId } = await ctx.youcam.uploadImage(new Uint8Array(bytes), { fileName: style.refPath.split("/").pop()!, contentType: "image/jpeg" }, meta);
  await ctx.kv.set(keys.styleRef(styleId), fileId, { ttlMs: TTL.styleRef });
  return fileId;
}
