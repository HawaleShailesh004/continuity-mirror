// The route planner (master plan Module C). Pure and deterministic: no LLM, no I/O, no clock, no randomness.
// Same snapshot + catalog in → same routes out. Browser-safe (imports only data and types).
import { colours as defaultColours, styles as defaultStyles, type ColourPreset, type StyleCatalogItem } from "@/lib/catalog";
import type { JobSpecInput, RouteColour } from "@/lib/contracts/api";
import type { ChangedDimension, IdentitySnapshot, RouteId } from "@/lib/contracts/domain";

export const ROUTE_KEYS = ["closest", "easier", "new-chapter"] as const;
export type RouteKey = (typeof ROUTE_KEYS)[number];

export type PlannedRoute = {
  routeKey: RouteKey;
  routeId: RouteId;
  styleId: string;
  colour: RouteColour;
  /** New chapter only: the one dimension this route changes (may differ from the request if the catalog can't offer it). */
  changedDimension?: ChangedDimension;
};

export type RegrowthRoute = Omit<PlannedRoute, "routeKey" | "routeId"> & {
  routeKey: "regrowth-3m" | "regrowth-6m" | "regrowth-12m";
  routeId: "regrowth-3m" | "regrowth-6m" | "regrowth-12m";
};

export type Catalog = { styles: readonly StyleCatalogItem[]; colours: readonly ColourPreset[] };

export type PlanOptions = {
  catalog?: Catalog;
  /**
   * Which styles to draw from. The snapshot has no gender (we never infer it), so the default is
   * "male" when the user said they have a beard and "all" otherwise (no filter). The UI may ask.
   */
  audience?: "female" | "male" | "all";
  /** New chapter: the one thing to change. Default: colour. */
  newChapter?: ChangedDimension;
  /** Demo layer only: force the closest / easier styles (e.g. sample people with genuine results). */
  prefer?: { closest?: string; easier?: string };
};

export const LENGTHS = ["buzz", "short", "chin", "shoulder", "long"] as const;
type Length = IdentitySnapshot["length"];
type Texture = IdentitySnapshot["texture"];

const lengthIndex = (l: Length) => LENGTHS.indexOf(l);

/**
 * Textures a snapshot may be matched with, best first. Coily hair only ever sees coily styles: a
 * template restyles texture, and previewing loose waves on coily hair would mislead.
 */
export const TEXTURE_PREFERENCE: Record<Texture, readonly Texture[]> = {
  straight: ["straight", "wavy"],
  wavy: ["wavy", "straight", "curly"],
  curly: ["curly", "wavy"],
  coily: ["coily"],
};

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function audienceFor(snap: IdentitySnapshot, options: PlanOptions): "female" | "male" | "all" {
  return options.audience ?? (snap.beard && snap.beard !== "none" ? "male" : "all");
}

/** Styles this snapshot may be shown: texture-compatible and audience-compatible, never empty. */
function candidatePool(snap: IdentitySnapshot, catalog: Catalog, audience: "female" | "male" | "all"): StyleCatalogItem[] {
  const textures = TEXTURE_PREFERENCE[snap.texture];
  const fits = (s: StyleCatalogItem) => textures.includes(s.texture);
  const audienceOk = (s: StyleCatalogItem) => audience === "all" || s.audience === "all" || s.audience === audience;
  const strict = catalog.styles.filter((s) => fits(s) && audienceOk(s));
  if (strict.length > 0) return strict;
  const relaxed = catalog.styles.filter(fits);
  return relaxed.length > 0 ? relaxed : [...catalog.styles];
}

function pickNearest(
  pool: readonly StyleCatalogItem[],
  snap: IdentitySnapshot,
  target: Length,
  opts: { exclude?: string[]; maxLength?: Length; prefer?: string; /** Variants may show protective styles; closest/easier/regrowth rank them last. */ allowProtective?: boolean } = {},
): StyleCatalogItem | undefined {
  const textures = TEXTURE_PREFERENCE[snap.texture];
  const rank = (s: StyleCatalogItem) => {
    const i = textures.indexOf(s.texture);
    return i === -1 ? 99 : i;
  };
  const eligible = pool.filter((s) => !opts.exclude?.includes(s.id) && (opts.maxLength === undefined || lengthIndex(s.length) <= lengthIndex(opts.maxLength)));
  const forced = opts.prefer ? eligible.find((s) => s.id === opts.prefer) : undefined;
  if (forced) return forced;
  const protectiveRank = (s: StyleCatalogItem) => (opts.allowProtective ? 0 : Number(s.protective));
  return [...eligible].sort(
    (a, b) =>
      protectiveRank(a) - protectiveRank(b) ||
      Math.abs(lengthIndex(a.length) - lengthIndex(target)) - Math.abs(lengthIndex(b.length) - lengthIndex(target)) ||
      rank(a) - rank(b) ||
      Number(a.fringe !== snap.fringe) - Number(b.fringe !== snap.fringe) ||
      Number(a.parting !== snap.parting) - Number(b.parting !== snap.parting) ||
      a.careEffort - b.careEffort ||
      byId(a, b),
  )[0];
}

/** The user's own colour: their picked hex, else the colour family's default preset. */
export function ownColour(snap: IdentitySnapshot, colours: readonly ColourPreset[] = defaultColours): RouteColour {
  const preset = colours.find((c) => c.family === snap.colourFamily && c.use.includes("family-default"));
  return { source: "own", hex: snap.hairHex ?? preset?.hexes[0] ?? colours[0]!.hexes[0]! };
}

function newChapterColour(snap: IdentitySnapshot, colours: readonly ColourPreset[]): RouteColour {
  const choices = [...colours].sort(byId);
  const preset =
    choices.find((c) => c.use.includes("new-chapter") && c.family !== snap.colourFamily) ??
    choices.find((c) => c.family !== snap.colourFamily) ??
    choices[0]!;
  return { source: "preset", presetId: preset.id, mode: "full" };
}

/** One style that differs from `base` in exactly `dimension` (and matches on the other two), nearest first. */
function changeOneDimension(
  base: StyleCatalogItem,
  dimension: Exclude<ChangedDimension, "colour">,
  pool: readonly StyleCatalogItem[],
): StyleCatalogItem | undefined {
  const same = {
    length: (s: StyleCatalogItem) => s.length === base.length,
    fringe: (s: StyleCatalogItem) => s.fringe === base.fringe,
    texture: (s: StyleCatalogItem) => s.texture === base.texture,
  };
  const others = (["length", "fringe", "texture"] as const).filter((d) => d !== dimension);
  const options = pool.filter((s) => s.id !== base.id && !same[dimension](s) && others.every((d) => same[d](s)));
  const distance = (s: StyleCatalogItem) => (dimension === "length" ? Math.abs(lengthIndex(s.length) - lengthIndex(base.length)) : 0);
  // Shorter wins a tie on length: easier to live with, and the plan is about change on the user's terms.
  const shorter = (s: StyleCatalogItem) => (dimension === "length" ? Number(lengthIndex(s.length) > lengthIndex(base.length)) : 0);
  return [...options].sort((a, b) => distance(a) - distance(b) || shorter(a) - shorter(b) || a.careEffort - b.careEffort || byId(a, b))[0];
}

/** Three routes, always, in order: closest, easier, new chapter. */
export function planRoutes(snap: IdentitySnapshot, options: PlanOptions = {}): PlannedRoute[] {
  const catalog = options.catalog ?? { styles: defaultStyles, colours: defaultColours };
  const pool = candidatePool(snap, catalog, audienceFor(snap, options));

  const closest = pickNearest(pool, snap, snap.length, { prefer: options.prefer?.closest }) ?? catalog.styles[0]!;
  const shorter = LENGTHS[Math.max(0, lengthIndex(closest.length) - 1)]!;
  // Audience is only a labelling hint from the template thumbnails: a buzz cut looks the same on anyone.
  // When no distinct shorter-or-equal style is left, look past the audience filter rather than repeat "closest".
  const easierOptions = { exclude: [closest.id], maxLength: closest.length, prefer: options.prefer?.easier };
  const easier =
    pickNearest(pool, snap, shorter, easierOptions) ??
    pickNearest(candidatePool(snap, catalog, "all"), snap, shorter, easierOptions) ??
    closest;

  const own = ownColour(snap, catalog.colours);
  const requested = options.newChapter ?? "colour";
  const changedStyle = requested === "colour" ? undefined : changeOneDimension(closest, requested, pool);
  const newChapter: PlannedRoute = changedStyle
    ? { routeKey: "new-chapter", routeId: "new-chapter", styleId: changedStyle.id, colour: own, changedDimension: requested }
    : { routeKey: "new-chapter", routeId: "new-chapter", styleId: closest.id, colour: newChapterColour(snap, catalog.colours), changedDimension: "colour" };

  return [
    { routeKey: "closest", routeId: "closest", styleId: closest.id, colour: own },
    { routeKey: "easier", routeId: "easier", styleId: easier.id, colour: own },
    newChapter,
  ];
}

const REGROWTH_STAGES = [
  { key: "regrowth-3m", target: "buzz" },
  { key: "regrowth-6m", target: "short" },
  { key: "regrowth-12m", target: "chin" },
] as const satisfies readonly { key: RegrowthRoute["routeKey"]; target: Length }[];

/**
 * Regrowth Roadmap stages, from the user's own baseline: pixie-length → crop → chin length, in the
 * snapshot's texture where the catalog has it. "A possibility to explore, not a prediction."
 */
export function planRegrowth(snap: IdentitySnapshot, options: PlanOptions = {}): RegrowthRoute[] {
  const catalog = options.catalog ?? { styles: defaultStyles, colours: defaultColours };
  const pool = candidatePool(snap, catalog, audienceFor(snap, options));
  const own = ownColour(snap, catalog.colours);
  const used: string[] = [];
  return REGROWTH_STAGES.map(({ key, target }, i) => {
    // Stages never get longer than the next one, and only repeat a style when the catalog has no other.
    const maxLength = REGROWTH_STAGES[i + 1]?.target ?? "chin";
    const style = pickNearest(pool, snap, target, { exclude: used, maxLength }) ?? pickNearest(pool, snap, target, { maxLength }) ?? catalog.styles[0]!;
    used.push(style.id);
    return { routeKey: key, routeId: key, styleId: style.id, colour: own };
  });
}

/** Up to `max` other styles for "try a variant" on a route: same texture class, nearest length first. */
export function planAlternatives(snap: IdentitySnapshot, route: Pick<PlannedRoute, "styleId">, options: PlanOptions & { max?: number } = {}): string[] {
  const catalog = options.catalog ?? { styles: defaultStyles, colours: defaultColours };
  const pool = candidatePool(snap, catalog, audienceFor(snap, options));
  const current = catalog.styles.find((s) => s.id === route.styleId);
  const target = current?.length ?? snap.length;
  const max = Math.min(options.max ?? 6, 6);
  const ordered: StyleCatalogItem[] = [];
  const rest = pool.filter((s) => s.id !== route.styleId);
  while (ordered.length < max) {
    const next = pickNearest(rest, snap, target, { exclude: ordered.map((s) => s.id), allowProtective: true });
    if (!next) break;
    ordered.push(next);
  }
  return ordered.map((s) => s.id);
}

/** A planned route as the body of POST /api/jobs (`attempt` > 0 for an intentional re-roll). */
export function toJobSpec(route: Pick<PlannedRoute, "routeId" | "styleId" | "colour">, attempt = 0): JobSpecInput {
  return { kind: "route", routeId: route.routeId, styleId: route.styleId, colour: route.colour, attempt };
}
