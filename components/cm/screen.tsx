import { ViewTransition, type ReactNode } from "react";
import { TopBar } from "./top-bar";
import { cn } from "@/lib/utils";

/*
 * The frame of every flow and app screen: TopBar, content, optional
 * BottomBar. Mobile is a single column; `wide` lets Compare and Plan open
 * into two columns from 768 px (plan §3.3).
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
  bottom,
  children,
}: {
  title: string;
  backHref?: string;
  step?: { n: number; total: number };
  baselineSrc?: string;
  wide?: boolean;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div className={cn("mx-auto flex min-h-dvh w-full flex-1 flex-col", wide ? "max-w-280" : "max-w-180")}>
        <TopBar title={title} backHref={backHref} step={step} baselineSrc={baselineSrc} />
        <main id="main" className="flex flex-1 flex-col gap-6 px-5 pt-2 pb-8 md:px-8">
          {children}
        </main>
        {bottom}
      </div>
    </ViewTransition>
  );
}
