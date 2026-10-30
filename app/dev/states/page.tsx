import { notFound } from "next/navigation";
import { StatesGallery } from "./gallery";

export const metadata = { title: "Dev states" };

/*
 * Dev-only review surface (frontend plan §3.2): tokens, motion primitives and,
 * from F1, every component in every state. Not shipped in production.
 * Labels here are developer-facing, so they are not in content/copy.ts.
 */
export default function DevStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StatesGallery />;
}
