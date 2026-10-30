import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { BlurFade } from "@/components/motion/blur-fade";
import { home } from "@/content/copy/home";

/** The mark: "you, before" (solid) and "you, through it" (outline), side by side. */
function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8 shrink-0">
      <circle cx="12" cy="16" r="9" className="fill-glow" />
      <circle cx="20" cy="16" r="9" className="fill-none stroke-action" strokeWidth="2.5" />
    </svg>
  );
}

export function SiteHeader() {
  const t = home;

  return (
    <header className="sticky top-0 z-30 bg-(--shell-top)/80 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 backdrop-blur-md md:px-8">
      <div className="mx-auto flex w-full max-w-280 items-center justify-between gap-3">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-bold">
          <Mark />
          {t.brand}
        </Link>
        <nav aria-label={t.headerNav} className="flex items-center gap-1">
          <a href="#how" className="hidden min-h-11 items-center px-3 text-sm font-semibold text-text-soft sm:flex">
            {t.headerHow}
          </a>
          <Link href="/privacy" transitionTypes={["nav-forward"]} className="hidden min-h-11 items-center px-3 text-sm font-semibold text-text-soft sm:flex">
            {t.headerPrivacy}
          </Link>
          <ButtonLink href="/start/consent?sample=1" variant="secondary" className="h-11 px-4 text-sm">
            {t.headerTry}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

export function FinalCall() {
  const t = home.final;

  return (
    <section aria-labelledby="final-title" className="relative isolate overflow-hidden px-5 py-20 md:px-8 md:py-28">
      <div aria-hidden="true" className="bg-morning-glow absolute inset-x-0 -bottom-1/2 -z-10 mx-auto h-full max-w-200" />
      <BlurFade inView className="mx-auto flex max-w-150 flex-col items-center gap-5 text-center">
        <h2 id="final-title" className="font-display text-2xl font-medium md:text-3xl">
          {t.title}
        </h2>
        <p className="text-lg text-text-soft">{t.text}</p>
        <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
          <ButtonLink href="/start/consent?sample=1" size="lg" full className="sm:w-auto sm:px-10">
            {t.cta}
          </ButtonLink>
          <ButtonLink href="/about" variant="quiet">
            {t.secondary}
          </ButtonLink>
        </div>
      </BlurFade>
    </section>
  );
}

export function SiteFooter() {
  const t = home.footer;

  return (
    <footer className="border-t border-line px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8">
      <div className="mx-auto flex w-full max-w-280 flex-col gap-2 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
        <p className="flex items-center gap-2">
          <Mark />
          {t.note}
        </p>
        <nav aria-label={t.navLabel} className="flex gap-1">
          <Link href="/about" transitionTypes={["nav-forward"]} className="flex min-h-11 items-center px-3 font-semibold text-action">
            {t.about}
          </Link>
          <Link href="/privacy" transitionTypes={["nav-forward"]} className="flex min-h-11 items-center px-3 font-semibold text-action">
            {t.privacy}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
