// Generates lib/catalog/styles.json from the compact table below (tags were assigned by eye from the
// template thumbnails on 26 Oct; a human must review before `reviewed` flips to true).
// Usage: node scripts/build-style-catalog.mjs
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const templates = JSON.parse(readFileSync(join(root, "lib/catalog/youcam-templates.json"), "utf8"));
const byId = new Map(templates.map((t) => [t.id, t]));

const FIBRES = {
  straight: ["synthetic", "heat-friendly synthetic", "human hair"],
  wavy: ["synthetic", "heat-friendly synthetic", "human hair"],
  curly: ["curl-set synthetic", "human hair"],
  coily: ["kinky-curly synthetic", "human hair"],
};
const CAPS = { basic: ["basic cap"], mono: ["monofilament top"], lace: ["lace front", "monofilament top"], topper: ["hair system / topper"] };
const COMFORT = {
  light: ["lightweight cap", "adjustable straps"],
  hot: ["breathable cap, cooler in hot weather"],
  tender: ["soft lining for a tender scalp", "adjustable straps"],
  volume: ["more hair volume means more warmth: ask about a ventilated cap"],
};

// id, label, audience, length, fringe, parting, texture, care(1-3), price, caps, comfort, askFor
const T = [
  // buzz / very short
  ["female_buzz_cut", "Buzz cut", "female", "buzz", false, "none", "straight", 1, "low", null, "hot", "Very short even buzz, no styling needed"],
  ["all_buzz_cut", "Buzz cut", "all", "buzz", false, "none", "straight", 1, "low", null, "hot", "Even buzz cut"],
  ["female_crewcut", "Crew cut", "female", "short", false, "none", "straight", 1, "low", null, "hot", "Short crew cut, slightly longer on top"],
  // short
  ["all_pixie", "Pixie", "female", "short", true, "none", "straight", 1, "low", "mono", "hot", "Short pixie cut, soft fringe, textured crown"],
  ["all_wispy_fringe_pixie", "Wispy fringe pixie", "female", "short", true, "none", "straight", 1, "low", "mono", "hot", "Pixie with a long wispy fringe"],
  ["all_short_feather_cut", "Short feather cut", "female", "chin", true, "centre", "straight", 2, "mid", "mono", "light", "Chin-length feathered bob with a fringe"],
  ["all_bixie_cut", "Bixie", "female", "short", true, "none", "straight", 1, "low", "mono", "light", "Bixie: between a pixie and a bob, ear length"],
  ["male_textured_comma", "Textured comma", "male", "short", true, "none", "wavy", 1, "mid", "topper", "tender", "Short textured cut with a comma fringe"],
  ["male_tousled_cut", "Tousled cut", "male", "short", true, "none", "wavy", 1, "mid", "topper", "tender", "Short tousled cut, messy fringe"],
  ["male_wavy_undercut", "Wavy undercut", "male", "short", true, "none", "wavy", 2, "mid", "topper", "tender", "Undercut sides with a longer wavy top"],
  ["all_side_swept_undercut", "Side-swept undercut", "male", "short", true, "left", "straight", 2, "mid", "topper", "tender", "Classic side-swept undercut"],
  ["male_afro", "Afro", "male", "short", false, "none", "coily", 2, "mid", "topper", "volume", "Natural afro, rounded shape, medium density"],
  // chin
  ["all_short_bob", "Short bob", "female", "chin", true, "none", "straight", 2, "mid", "mono", "light", "Chin-length bob, blunt ends, light fringe"],
  ["all_french_bob", "French bob", "female", "chin", true, "none", "straight", 2, "mid", "mono", "light", "Jaw-length French bob with a soft fringe"],
  ["all_bobcut", "Bob with fringe", "female", "chin", true, "none", "straight", 2, "mid", "mono", "light", "Rounded bob with a full fringe"],
  ["female_blunt_bob", "Blunt bob", "female", "chin", true, "none", "straight", 2, "mid", "mono", "light", "Blunt chin-length bob with a straight fringe"],
  ["all_modern_mid_part_bob", "Mid-part bob", "female", "chin", false, "centre", "straight", 2, "mid", "mono", "light", "Chin-length bob with a centre parting"],
  ["female_slicked_back_bob", "Slicked-back bob", "female", "chin", false, "none", "straight", 2, "mid", "mono", "light", "Chin-length bob combed back off the face"],
  ["all_hush_cut", "Hush cut", "female", "shoulder", true, "centre", "straight", 2, "mid", "mono", "light", "Soft layers with a curtain fringe, shoulder length"],
  ["female_bobcut_curly", "Curly bob", "female", "chin", false, "none", "wavy", 2, "mid", "mono", "light", "Chin-length bob with loose curls"],
  ["female_bobcut_wavy", "Wavy bob with fringe", "female", "chin", true, "none", "wavy", 2, "mid", "mono", "light", "Wavy chin-length bob with a fringe"],
  ["all_wavy_bob_with_bangs", "Wavy bob, bangs", "female", "chin", true, "none", "wavy", 2, "mid", "mono", "light", "Wavy bob with bangs"],
  ["all_tousled_bob", "Tousled bob", "female", "chin", false, "none", "wavy", 2, "mid", "mono", "light", "Tousled, textured bob"],
  ["all_wolf_cut", "Wolf cut", "female", "chin", true, "none", "wavy", 3, "mid", "mono", "light", "Short wolf cut: shaggy layers, short fringe"],
  // shoulder
  ["female_medium_straight", "Medium straight", "female", "shoulder", false, "centre", "straight", 1, "mid", "basic", "light", "Shoulder-length straight, centre parting"],
  ["female_choppy_bob", "Choppy lob", "female", "shoulder", true, "none", "straight", 2, "mid", "mono", "light", "Choppy lob with a fringe"],
  ["all_soft_flipped_layers", "Soft flipped layers", "female", "shoulder", true, "centre", "straight", 2, "mid", "mono", "light", "Shoulder-length layers flipped at the ends"],
  ["female_modern_wavy_lob", "Wavy lob", "female", "shoulder", false, "left", "wavy", 2, "mid", "mono", "light", "Wavy long bob, side parting"],
  ["all_aura_waves", "Aura waves", "female", "shoulder", false, "centre", "wavy", 2, "mid", "mono", "light", "Shoulder-length loose waves, centre parting"],
  ["all_wavy_shag", "Wavy shag", "female", "shoulder", true, "none", "wavy", 3, "mid", "mono", "light", "Shoulder-length shag with a fringe and soft waves"],
  ["all_face_framing_shag_cut", "Face-framing shag", "female", "long", true, "centre", "straight", 3, "mid", "mono", "volume", "Long shag with face-framing layers and a fringe"],
  ["all_defined_waves", "Defined waves", "female", "shoulder", false, "centre", "wavy", 2, "mid", "mono", "light", "Shoulder-length defined waves"],
  ["all_classic_hollywood_waves", "Hollywood waves", "female", "shoulder", false, "left", "wavy", 3, "high", "lace", "volume", "Shoulder-length Hollywood waves, side parting"],
  ["all_medium_curve_hair", "Medium layers", "female", "shoulder", true, "centre", "straight", 2, "mid", "mono", "light", "Medium layers with curved ends and a fringe"],
  // long
  ["female_long_straight", "Long straight with fringe", "female", "long", true, "none", "straight", 2, "mid", "mono", "volume", "Long straight hair with a fringe"],
  ["female_side_part_straight", "Long side-part straight", "female", "long", false, "left", "straight", 2, "mid", "mono", "volume", "Long straight hair, side parting"],
  ["female_long_wavy", "Long wavy", "female", "long", false, "centre", "wavy", 2, "mid", "mono", "volume", "Long wavy hair, centre parting"],
  ["all_loose_waves", "Long loose waves", "female", "long", true, "none", "wavy", 2, "mid", "mono", "volume", "Long loose waves with a curtain fringe"],
  ["all_hime_cut", "Hime cut", "female", "long", true, "none", "straight", 3, "mid", "mono", "volume", "Hime cut: cheek-length side locks, full fringe, long back"],
  ["female_long_spiral_curls", "Long spiral curls", "female", "long", false, "none", "curly", 3, "high", "lace", "volume", "Long spiral curls, defined, full volume"],
  ["female_bouncy_curls", "Bouncy curls", "female", "long", false, "centre", "curly", 3, "high", "lace", "volume", "Long bouncy curls, centre parting"],
];

// Ids already used by fixtures and the frontend stay stable.
const STABLE_ID = {
  all_short_bob: "short-bob",
  all_french_bob: "french-bob",
  all_pixie: "pixie",
  all_bixie_cut: "bixie",
  female_bobcut_curly: "bob-curly",
  male_textured_comma: "textured-comma",
  all_buzz_cut: "buzz",
};

const styles = T.map(([id, label, audience, length, fringe, parting, texture, care, price, caps, comfort, askFor]) => {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown template ${id}`);
  if (!t.keepUsersColour) throw new Error(`${id} does not keep the user's colour`);
  const slug = id.replace(/^(all|female|male)_/, "").replace(/_/g, "-");
  const thumb = `/catalog/thumbs/${id}.jpg`;
  const dest = join(root, "public", thumb);
  if (!existsSync(dest)) {
    const src = join(root, "spike-output", "thumbnails", `${id}.jpg`);
    if (!existsSync(src)) throw new Error(`missing thumbnail for ${id}`);
    copyFileSync(src, dest);
  }
  return {
    id: STABLE_ID[id] ?? `${audience === "all" ? "" : audience[0] + "-"}${slug}`,
    label,
    style: { source: "template", templateId: id, keepsUsersColour: true },
    thumbnail: thumb,
    audience,
    length,
    fringe,
    parting,
    texture,
    careEffort: care,
    askFor,
    wigNotes: { fibres: length === "buzz" ? [] : FIBRES[texture], caps: caps ? CAPS[caps] : [], comfort: COMFORT[comfort] },
    priceBand: price,
    protective: false,
    reviewed: false,
  };
});

// Reference-based styles: images made with YouCam Image Generator (scripts/build-style-refs.mjs).
// coily-chin was generated in B0 stage 3; the rest are appended from lib/catalog/style-refs.json.
styles.push({
  id: "coily-chin",
  label: "Chin-length coils",
  style: { source: "reference", refPath: "/catalog/refs/ref-coily-chin.jpg" },
  thumbnail: "/catalog/refs/ref-coily-chin.jpg",
  audience: "female",
  length: "chin",
  fringe: true,
  parting: "none",
  texture: "coily",
  careEffort: 2,
  askFor: "Chin-length 4C coily unit, natural density",
  wigNotes: { fibres: FIBRES.coily, caps: CAPS.lace, comfort: COMFORT.light },
  priceBand: "mid",
  protective: false,
  reviewed: false,
});
const refsPath = join(root, "lib/catalog/style-refs.json");
if (existsSync(refsPath)) styles.push(...JSON.parse(readFileSync(refsPath, "utf8")));

const ids = new Set();
for (const s of styles) {
  if (ids.has(s.id)) throw new Error(`duplicate id ${s.id}`);
  ids.add(s.id);
}
writeFileSync(join(root, "lib/catalog/styles.json"), JSON.stringify(styles, null, 2) + "\n");
console.log(`${styles.length} styles`);
