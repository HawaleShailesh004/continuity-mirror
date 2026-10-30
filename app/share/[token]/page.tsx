import { Suspense } from "react";
import type { Metadata } from "next";
import { HelperScreen } from "./helper-screen";

// A private link: never indexed, and the address is not passed on to anything the page links to.
export const metadata: Metadata = {
  title: "Which one feels most like them?",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Next 16 (cacheComponents): reading params outside <Suspense> blocks instant navigation.
async function Helper({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HelperScreen token={token} />;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Helper params={params} />
    </Suspense>
  );
}
