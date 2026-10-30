import type { ReactNode } from "react";
import { CloudOffIcon, InboxIcon, InfoIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { messageFor } from "@/lib/client/messages";
import { cn } from "@/lib/utils";

/* Shared shells. Errors are calm: neutral surface, no red, no alarm (master plan §3 Module M). */

function Shell({
  icon: Icon,
  title,
  body,
  children,
  className,
  headingLevel = 2,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-card bg-surface p-6 text-center", className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-peach text-text" aria-hidden="true">
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <Heading className="text-lg">{title}</Heading>
        {body && <p className="text-text-soft">{body}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Shell icon={InboxIcon} title={title} body={body} className={className}>
      {action}
    </Shell>
  );
}

/** Takes a backend messageKey, or explicit words. Retry only when it can help. */
export function ErrorState({
  messageKey,
  title,
  body,
  onRetry,
  retryLabel = copy.common.retry,
  children,
  className,
  headingLevel,
}: {
  messageKey?: string;
  title?: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const words = messageKey ? messageFor(messageKey) : { title: title ?? copy.states.errorTitle, body };
  return (
    <div role="alert" className="contents">
      <Shell icon={RefreshCwIcon} title={words.title} body={words.body} className={className} headingLevel={headingLevel}>
        {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
        {children}
      </Shell>
    </div>
  );
}

/** Persistent, polite: generation is disabled, saved things still work. */
export function OfflineBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-start gap-3 rounded-card bg-surface px-5 py-4 text-sm text-text-soft", className)}
    >
      <CloudOffIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text" />
      <p>{copy.states.offline}</p>
    </div>
  );
}

/** Demo mode: the people are AI-generated and the results were made earlier. */
export function SampleModeBanner({ mock = false, className }: { mock?: boolean; className?: string }) {
  return (
    <div
      role="note"
      className={cn("flex items-start gap-3 rounded-card bg-peach px-5 py-4 text-sm text-text-soft", className)}
    >
      <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text" />
      <p>{mock ? copy.states.mockBanner : copy.states.sampleBanner}</p>
    </div>
  );
}
