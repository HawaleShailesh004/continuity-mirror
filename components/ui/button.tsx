import Link from "next/link";
import type { ComponentProps } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet";
type Size = "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold " +
  "transition-transform duration-(--dur-quick) ease-out active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-action text-on-action",
  secondary: "bg-surface text-text",
  quiet: "bg-transparent text-action",
};

// 56 px in bottom bars, 48 px elsewhere; never below the 44 px target.
const sizes: Record<Size, string> = {
  md: "h-12 px-6 text-base",
  lg: "h-14 px-6 text-base",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  full = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  className?: string;
}) {
  return cn(base, variants[variant], sizes[size], full && "w-full", className);
}

type Shared = { variant?: Variant; size?: Size; full?: boolean };

export function Button({
  variant,
  size,
  full,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & Shared & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, full, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2Icon aria-hidden="true" className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * A link that looks like a button. `direction` tags the navigation for the
 * View Transitions CSS in app/globals.css (forward slides in, back slides out).
 */
export function ButtonLink({
  variant,
  size,
  full,
  direction = "forward",
  className,
  ...props
}: ComponentProps<typeof Link> & Shared & { direction?: "forward" | "back" | "none" }) {
  return (
    <Link
      className={buttonClass({ variant, size, full, className })}
      transitionTypes={direction === "none" ? undefined : [direction === "forward" ? "nav-forward" : "nav-back"]}
      {...props}
    />
  );
}
