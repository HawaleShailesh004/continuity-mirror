import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import { TopBar } from "./top-bar";
import { cn } from "@/lib/utils";

/** The five washes of "The light rises": consent 1 → snapshot 2 → capture 3 → paths 4 → plan 5. */
export type Dawn = 1 | 2 | 3 | 4 | 5;

const DAWN_BG: Record<Dawn, string> = { 1: "bg-dawn-1", 2: "bg-dawn-2", 3: "bg-dawn-3", 4: "bg-dawn-4", 5: "bg-dawn-5" };

/*
 * The frame of every flow and app screen: TopBar, content, optional
 * BottomBar, on a dawn wash. Mobile is a single column. `wide` opens to 1200 px,
 * and `stage` (a PhotoStage, usually) makes the desktop two columns: the photo
 * stays in view on the left while the decisions scroll on the right (plan §2.1).
 *
 * The ViewTransition lives here, in each page's tree, not in a layout:
 * layouts persist across navigations so enter/exit would never fire. Without
 * a transition type (browser back, refresh) nothing animates.
 */
export function Screen({
  title,
  backHref,
  step,
  baselineSrc,
  wide = false,
  dawn,
  stage,
  bottom,
  children,
}: {
  title: string;
  backHref?: string;
  step?: { n: number; total: number };
  baselineSrc?: string;
  wide?: boolean;
  dawn?: Dawn;
  /** Desktop left column (sticky); on a phone it comes first. Implies `wide`. */
  stage?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  const open = wide || Boolean(stage);
  // Each step of the journey is a little brighter than the last; screens outside it sit at the clear morning.
  const wash = (dawn ?? step?.n ?? 5) as Dawn;
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div
        className={cn("grain flex min-h-dvh w-full flex-1 flex-col", DAWN_BG[wash])}
        style={{ "--shell-top": `var(--dawn-${wash})` } as CSSProperties}
      >
        <div className={cn("mx-auto flex w-full flex-1 flex-col", open ? "max-w-300" : "max-w-180")}>
          <TopBar title={title} backHref={backHref} step={step} baselineSrc={baselineSrc} />
          <main
            id="main"
            className={cn(
              "flex flex-1 flex-col gap-6 px-5 pt-2 pb-8 md:px-8",
              stage && "md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-x-14",
            )}
          >
            {stage && <div className="md:sticky md:top-24">{stage}</div>}
            {stage ? <div className="flex min-w-0 flex-col gap-6">{children}</div> : children}
          </main>
          {bottom}
        </div>
      </div>
    </ViewTransition>
  );
}
