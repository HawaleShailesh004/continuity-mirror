"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ShieldCheckIcon } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { StepProgress } from "./step-progress";
import { copy } from "@/content/copy";

const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text " +
  "transition-transform duration-(--dur-quick) active:scale-[0.98]";

/*
 * Back, the screen's one h1, step indicator, the "You, before" thumbnail
 * (which travels with the user through the journey) and a privacy shortcut.
 * It keeps its place during page transitions (viewTransitionName, globals.css).
 * On every screen change focus moves to the h1 so screen readers announce it.
 */
export function TopBar({
  title,
  backHref,
  step,
  baselineSrc,
}: {
  title: string;
  backHref?: string;
  step?: { n: number; total: number };
  baselineSrc?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <header
      style={{ viewTransitionName: "app-topbar" }}
      className="sticky top-0 z-30 flex items-center gap-3 bg-(--shell-top)/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md md:px-8"
    >
      <Link href="/" aria-label={copy.nav.home} className="hidden min-h-11 items-center gap-2 pr-3 font-display text-lg font-medium md:flex">
        <BrandMark className="size-7" />
        {copy.nav.brand}
      </Link>
      <span aria-hidden="true" className="hidden h-6 w-px bg-line md:block" />
      {backHref && (
        <Link href={backHref} transitionTypes={["nav-back"]} aria-label={copy.nav.back} className={iconButton}>
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </Link>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 ref={heading} tabIndex={-1} className="text-lg leading-tight outline-none md:text-xl">
          {title}
        </h1>
        {step && <StepProgress step={step.n} total={step.total} />}
      </div>
      {baselineSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={baselineSrc}
          alt={copy.common.youBefore}
          className="size-11 shrink-0 rounded-full border border-line object-cover object-[50%_20%]"
        />
      )}
      <Link href="/privacy" aria-label={copy.nav.privacy} className={iconButton}>
        <ShieldCheckIcon aria-hidden="true" className="size-5" />
      </Link>
    </header>
  );
}
