import { Suspense } from "react";
import { ConsentScreen } from "./consent-screen";

export const metadata = { title: "Before we start" };

export default function ConsentPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <ConsentScreen />
    </Suspense>
  );
}
