import { notFound } from "next/navigation";
import { CheckHarness } from "./harness";

export const metadata = { title: "Dev result check" };

/** Dev-only: measures every demo pair with the result check (elite-plan B2). Not shipped in production. */
export default function DevCheckPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CheckHarness />;
}
