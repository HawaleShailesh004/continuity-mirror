/*
 * Support Circle (P1): the owner's side of a share link. Sharing is the one
 * time a photo leaves the device for a reason other than making a preview, so
 * everything here is explicit: the caller must have the person's consent
 * (`consent: true` is part of the request, never defaulted), links expire, and
 * "stop sharing" deletes the images on our server straight away.
 *
 * What a helper sees is one picture per look: the person's own photo on the
 * left, the style on the right. The baseline is never separated from the
 * result (frontend plan §1, principle 2), and the helper needs no
 * explanation of what "before" means.
 */
import { api, ApiError } from "./api";
import { db, type ShareRow } from "./db";

export const SHARE_MAX_ITEMS = 4;
export const SHARE_DAYS = [1, 3, 7] as const;
export type ShareDays = (typeof SHARE_DAYS)[number];

/** Each half is 3:4 like the baseline. The pair is 1024 × 683: the size our server keeps, so nothing is resampled twice. */
export const SHARE_CELL = { width: 512, height: 683 } as const;
const BACKDROP = "#F4F7FB"; // drawn into pixels the helper sees: not themed

export type Box = { x: number; y: number; width: number; height: number };

/**
 * The largest box with the source's proportions that fits the cell, centred in
 * it. Nothing is cropped, so a face is never cut off.
 */
export function containBox(srcWidth: number, srcHeight: number, cell: { width: number; height: number }, originX = 0): Box {
  const scale = Math.min(cell.width / srcWidth, cell.height / srcHeight);
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);
  return { x: originX + Math.round((cell.width - width) / 2), y: Math.round((cell.height - height) / 2), width, height };
}

/** The label a helper reads under a picture: plain text, 80 characters at most, never two the same. */
export function uniqueLabels(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((raw) => {
    const base = raw.replace(/\s+/g, " ").trim().slice(0, 72) || "Option";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** "You, before" beside a style, as one JPEG. */
export async function composeShareImage(before: Blob, after: Blob): Promise<Blob> {
  const [left, right] = await Promise.all([createImageBitmap(before), createImageBitmap(after)]);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SHARE_CELL.width * 2;
    canvas.height = SHARE_CELL.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [bitmap, originX] of [[left, 0], [right, SHARE_CELL.width]] as const) {
      const box = containBox(bitmap.width, bitmap.height, SHARE_CELL, originX);
      ctx.drawImage(bitmap, box.x, box.y, box.width, box.height);
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
    );
  } finally {
    left.close();
    right.close();
  }
}

/**
 * Make the link. The caller has already shown what is shared and got a clear
 * yes; the server stores only what is sent here, until `days` run out or the
 * person stops sharing.
 */
export async function createShareLink(input: {
  baseline: Blob;
  looks: readonly { label: string; image: Blob }[];
  days: ShareDays;
}): Promise<ShareRow> {
  const labels = uniqueLabels(input.looks.map((l) => l.label));
  const images = await Promise.all(input.looks.map((l) => composeShareImage(input.baseline, l.image)));
  const created = await api.createShare(
    { consent: true, items: labels.map((label) => ({ label })), expiresInDays: input.days },
    images,
  );
  const row: ShareRow = {
    token: created.token,
    ownerKey: created.ownerKey,
    url: created.url,
    labels,
    expiresAt: created.expiresAt,
    createdAt: new Date().toISOString(),
  };
  await db.shares.put(row);
  return row;
}

/** Stop sharing now: the images and votes are deleted on our server. A link that is already gone counts as stopped. */
export async function stopSharing(row: ShareRow): Promise<void> {
  try {
    await api.revokeShare(row.token, row.ownerKey);
  } catch (error) {
    if (!(error instanceof ApiError && error.body.code === "EXPIRED")) throw error;
  }
  await db.shares.delete(row.token);
}

/** For "delete everything": stop every link, best effort (a link we can't reach still expires on its own). */
export async function stopAllSharing(): Promise<void> {
  const rows = await db.shares.toArray();
  await Promise.allSettled(rows.map((row) => stopSharing(row)));
}

/* ------------------------------------------------------------- helper side */

const votedKey = (token: string) => `cm-voted:${token}`;

/** Did this browser already send an answer for this link? Storage may be blocked: then we just don't know. */
export function hasVoted(token: string): boolean {
  try {
    return localStorage.getItem(votedKey(token)) !== null;
  } catch {
    return false;
  }
}

export function rememberVote(token: string, itemKey: string): void {
  try {
    localStorage.setItem(votedKey(token), itemKey);
  } catch {
    /* private mode: they can still vote, we just can't remember it */
  }
}
