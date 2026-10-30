import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CompareScreen } from "./compare-screen";
import { ROUTE_KEYS } from "@/lib/planner";

export function generateStaticParams() {
  return ROUTE_KEYS.map((route) => ({ route }));
}

export const metadata = { title: "Compare" };

// Next 16 (cacheComponents): reading params outside <Suspense> blocks instant navigation.
async function Compare({ params }: { params: Promise<{ route: string }> }) {
  const { route } = await params;
  if (!(ROUTE_KEYS as readonly string[]).includes(route)) notFound();
  return <CompareScreen routeKey={route} />;
}

export default function ComparePage({ params }: { params: Promise<{ route: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Compare params={params} />
    </Suspense>
  );
}
