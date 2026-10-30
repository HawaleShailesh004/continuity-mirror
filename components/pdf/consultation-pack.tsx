"use client";

/* eslint-disable jsx-a11y/alt-text -- react-pdf's Image draws into a PDF; it is not an HTML <img> and takes no alt. */

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { brows as browsCopy } from "@/content/copy/brows";
import { exportPack } from "@/content/copy/exportPack";
import { label } from "@/content/copy/label";
import type { PackModel } from "@/lib/client/pack";

/*
 * The consultation pack (Module I). Drawn with react-pdf in the browser, with
 * built-in fonts, so no photo and no request leaves the device. A PDF has no
 * CSS variables: these values mirror the Morning Light light theme
 * (app/theme.css) and are the one place they are repeated.
 */
const c = {
  text: "#16202E",
  soft: "#3A4556",
  muted: "#556070",
  action: "#2F5E9E",
  surface: "#F4F7FB",
  peach: "#FBE3D3",
  line: "#E1E6EE",
};

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontFamily: "Helvetica", fontSize: 10.5, color: c.text, lineHeight: 1.4 },
  header: { marginBottom: 14 },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 11, color: c.muted, marginTop: 2 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  row: { flexDirection: "row", gap: 10 },
  photoCol: { flex: 1 },
  photo: { width: "100%", aspectRatio: 0.75, borderRadius: 8, objectFit: "cover" },
  caption: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 4 },
  label: { fontSize: 8, color: c.soft, backgroundColor: c.peach, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 3, alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 9.5 },
  card: { backgroundColor: c.surface, borderRadius: 8, padding: 10, marginBottom: 8 },
  cardTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 3 },
  k: { fontSize: 8.5, color: c.muted, marginTop: 5 },
  v: { fontSize: 10.5 },
  quote: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  dot: { width: 10, color: c.action },
  small: { fontSize: 9, color: c.muted },
  note: { fontSize: 9, color: c.soft, backgroundColor: c.peach, padding: 8, borderRadius: 6, marginTop: 6 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: c.muted, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 6 },
});

/** A JPEG data URL (see pdfImage), or null when the photo is missing. */
type Img = string | null;

const Bullets = ({ items }: { items: readonly string[] }) => (
  <>
    {items.map((t, i) => (
      <View key={i} style={s.bullet} wrap={false}>
        <Text style={s.dot}>•</Text>
        <Text style={{ flex: 1 }}>{t}</Text>
      </View>
    ))}
  </>
);

export function ConsultationPack({
  model,
  before,
  images,
  browImage = null,
  date,
}: {
  model: PackModel;
  before: Img;
  /** One per look, same order as `model.looks`. */
  images: readonly Img[];
  /** The cropped photo of the person's own brows, for the brow page. */
  browImage?: Img;
  /** Already formatted, e.g. "26 Oct 2026". */
  date: string;
}) {
  const t = exportPack.pdf;
  const footer = (
    <View style={s.footer} fixed>
      <Text>{t.footer}</Text>
      <Text render={({ pageNumber, totalPages }) => t.pageOf(pageNumber, totalPages)} />
    </View>
  );

  return (
    <Document title={exportPack.title} author="Continuity Mirror" subject={t.subheading}>
      {/* Page 1: me, the looks, my own words */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.h1}>{t.heading}</Text>
          <Text style={s.sub}>
            {t.subheading} · {t.madeOn(date)}
            {model.sample ? ` · ${t.sample}` : ""}
          </Text>
        </View>

        <View style={s.row}>
          {before && (
            <View style={s.photoCol}>
              <Image style={s.photo} src={before} />
              <Text style={s.caption}>{t.before}</Text>
            </View>
          )}
          {model.looks.slice(0, 2).map((look, i) => (
            <View key={i} style={s.photoCol}>
              {images[i] && <Image style={s.photo} src={images[i]!} />}
              <Text style={s.caption}>
                {look.name}
                {look.ownColour ? ` (${t.ownColour})` : ""}
              </Text>
              <Text style={s.label}>{label.styleDirection}</Text>
            </View>
          ))}
        </View>
        {model.looks.length > 2 && (
          <View style={[s.row, { marginTop: 10 }]}>
            {model.looks.slice(2, 4).map((look, i) => (
              <View key={i} style={s.photoCol}>
                {images[i + 2] && <Image style={s.photo} src={images[i + 2]!} />}
                <Text style={s.caption}>
                  {look.name}
                  {look.ownColour ? ` (${t.ownColour})` : ""}
                </Text>
                <Text style={s.label}>{label.styleDirection}</Text>
              </View>
            ))}
            <View style={s.photoCol} />
          </View>
        )}

        {model.cues.length > 0 && (
          <>
            <Text style={s.h2}>{t.words}</Text>
            <View style={s.chips}>
              {model.cues.map((cue) => (
                <Text key={cue} style={s.chip}>
                  {cue}
                </Text>
              ))}
            </View>
            {model.note ? <Text style={[s.small, { marginTop: 6 }]}>“{model.note}”</Text> : null}
          </>
        )}

        <Text style={s.h2}>{t.situation}</Text>
        <View style={s.chips}>
          <Text style={s.chip}>{model.situation.budget}</Text>
          <Text style={s.chip}>{model.situation.climate}</Text>
          <Text style={s.chip}>{model.situation.upkeep}</Text>
        </View>
        {footer}
      </Page>

      {/* Page 2: what to say, what to ask, money */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t.ask}</Text>
        {model.looks.map((look, i) => (
          <View key={i} style={[s.card, { marginTop: i === 0 ? 10 : 0 }]} wrap={false}>
            <Text style={s.cardTitle}>{look.name}</Text>
            <Text style={s.k}>{t.askLabel}</Text>
            <Text style={s.quote}>“{look.askFor}”</Text>
            {look.fibres.length > 0 && (
              <>
                <Text style={s.k}>{t.fibres}</Text>
                <Text style={s.v}>{look.fibres.join(", ")}</Text>
              </>
            )}
            {look.caps.length > 0 && (
              <>
                <Text style={s.k}>{t.caps}</Text>
                <Text style={s.v}>{look.caps.join(", ")}</Text>
              </>
            )}
            {look.comfort.length > 0 && (
              <>
                <Text style={s.k}>{t.comfort}</Text>
                <Text style={s.v}>{look.comfort.join(", ")}</Text>
              </>
            )}
            <Text style={[s.small, { marginTop: 5 }]}>
              {look.upkeep} · {look.price}
            </Text>
          </View>
        ))}
        <Text style={s.note}>
          {model.climateNote} {t.ourGuidance}
        </Text>

        <Text style={s.h2}>{t.questions}</Text>
        <Bullets items={model.questions} />
        <Text style={[s.small, { marginTop: 2 }]}>{t.ourGuidance}</Text>

        {(model.guide || model.programmes.length > 0) && <Text style={s.h2}>{t.money}</Text>}
        {model.guide && (
          <View wrap={false} style={{ marginBottom: 6 }}>
            <Text style={s.cardTitle}>
              {model.guide.title} <Text style={s.small}>({t.asOf(model.guide.asOf)})</Text>
            </Text>
            <Bullets items={model.guide.steps.map((step) => (step.ours ? `${step.text} (${exportPack.pdf.ourGuidance.replace(".", "")})` : step.text))} />
          </View>
        )}
        {model.programmes.map((p, i) => (
          <View key={i} wrap={false} style={{ marginBottom: 5 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {p.name} <Text style={s.small}>({t.asOf(p.asOf)})</Text>
            </Text>
            <Text style={s.v}>{p.summary}</Text>
            {p.contact ? <Text style={s.small}>{p.contact}</Text> : null}
            {p.checkNote ? <Text style={s.small}>{p.checkNote}</Text> : null}
          </View>
        ))}
        {footer}
      </Page>

      {/* Page 3 (only with a saved brow recipe): my own brows, and how to practise */}
      {model.brows && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>{browsCopy.pdf.heading}</Text>
          <Text style={s.sub}>{browsCopy.pdf.intro}</Text>
          {browImage && <Image style={[s.photo, { aspectRatio: 2.2, marginTop: 12 }]} src={browImage} />}
          <View style={[s.card, { marginTop: 12 }]} wrap={false}>
            <Text style={s.k}>{browsCopy.pdf.shape}</Text>
            <Text style={s.quote}>{model.brows.shape}</Text>
            <Text style={s.k}>{browsCopy.pdf.thickness}</Text>
            <Text style={s.v}>{model.brows.thickness}</Text>
            <Text style={s.k}>{browsCopy.pdf.colour}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: model.brows.colourHex, borderWidth: 0.5, borderColor: c.line }} />
              <Text style={s.v}>{model.brows.colourHex}</Text>
            </View>
            {model.brows.note ? (
              <>
                <Text style={s.k}>{browsCopy.pdf.note}</Text>
                <Text style={s.v}>{model.brows.note}</Text>
              </>
            ) : null}
          </View>
          <Text style={s.h2}>{browsCopy.pdf.steps}</Text>
          <Bullets items={model.brows.steps} />
          <Text style={[s.small, { marginTop: 4 }]}>{browsCopy.pdf.ourGuidance}</Text>
          {footer}
        </Page>
      )}
    </Document>
  );
}
