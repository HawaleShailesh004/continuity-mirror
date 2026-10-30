"use client";

import dynamic from "next/dynamic";

/*
 * Toasts only appear after something the user did, so the toast library
 * (~10 KB gzip) loads in its own chunk after first paint instead of weighing
 * on the landing page's first load (budget: 180 KB gzip for `/`).
 */
const Toaster = dynamic(() => import("./toaster").then((mod) => mod.Toaster), { ssr: false });

export function LazyToaster() {
  return <Toaster />;
}
