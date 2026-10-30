// Money-help data for the Plan screen: wig programmes and insurance guidance. Data only: the frontend
// owns presentation. Every entry carries its source and the date it was checked ("as of").
import { z } from "zod";
import insuranceJson from "./resources/insurance.json";
import programmesJson from "./resources/programmes.json";

export const Country = z.enum(["US", "CA", "IN", "UK"]);
export type Country = z.infer<typeof Country>;

const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Matches the frontend's `Programme` (id, country, name, summary, sourceUrl, asOf) plus optional extras. */
export const Programme = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  country: Country,
  name: z.string().min(1),
  /** One plain sentence or two on what it offers. */
  summary: z.string().min(1),
  /** Phone number to call, if the source gives one. */
  contact: z.string().optional(),
  sourceUrl: z.url(),
  asOf: IsoDay,
  /** What to double-check, shown quietly ("check before you go"). */
  checkNote: z.string().optional(),
});
export type Programme = z.infer<typeof Programme>;

export const InsuranceGuide = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  country: Country,
  title: z.string().min(1),
  intro: z.string().min(1),
  steps: z.array(
    z.strictObject({
      text: z.string().min(1),
      /** `cited`: stated by one of `sources`. `guidance`: our own suggestion, say so in the UI. */
      basis: z.enum(["cited", "guidance"]),
    }),
  ),
  sources: z.array(z.strictObject({ title: z.string(), url: z.url() })).min(1),
  asOf: IsoDay,
});
export type InsuranceGuide = z.infer<typeof InsuranceGuide>;

export const programmes: readonly Programme[] = z.array(Programme).parse(programmesJson);
export const insuranceGuides: readonly InsuranceGuide[] = z.array(InsuranceGuide).parse(insuranceJson);
