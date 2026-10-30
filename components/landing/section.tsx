import type { ReactNode } from "react";
import { BlurFade } from "@/components/motion/blur-fade";
import { cn } from "@/lib/utils";

/**
 * One band of the landing page: a kicker, an h2, an optional lead paragraph,
 * then the content. `tone` alternates the backdrop so sections read apart.
 */
export function Section({
  id,
  kicker,
  title,
  lead,
  tone = "plain",
  children,
  className,
}: {
  id: string;
  kicker?: string;
  title: string;
  lead?: string;
  tone?: "plain" | "surface" | "peach";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-4 px-5 py-16 md:px-8 md:py-24",
        tone === "surface" && "bg-surface",
        tone === "peach" && "bg-peach",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-280 flex-col gap-10">
        <BlurFade inView className="flex max-w-170 flex-col gap-3">
          {kicker && <p className="text-sm font-semibold text-action">{kicker}</p>}
          <h2 id={`${id}-title`} className="text-2xl md:text-3xl">
            {title}
          </h2>
          {lead && <p className="text-lg text-text-soft">{lead}</p>}
        </BlurFade>
        {children}
      </div>
    </section>
  );
}
