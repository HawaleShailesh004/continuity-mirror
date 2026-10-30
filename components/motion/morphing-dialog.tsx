"use client";
/*
 * MorphingDialog: a card that morphs into a full view and back
 * (path card → Compare, signature moment 6).
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes:
 *  - `m` components; spring.layout by default; token colours for the backdrop;
 *  - fixed upstream focus bugs: the trigger now registers the shared ref
 *    (focus returns to it on close), and focus is no longer pulled to the
 *    trigger on first mount;
 *  - Escape/Tab listener only while open; click-outside inlined;
 *  - accessible names come from props (copy lives in content/copy.ts), not
 *    "Open dialog :r1:"; title/description ids now match aria attributes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, type Transition, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/client/motion";

type Ctx = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  uniqueId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const MorphingDialogContext = createContext<Ctx | null>(null);
/** True inside MorphingDialogContent, so only the open copy carries the ids. */
const InsideContentContext = createContext(false);

function useMorphingDialog() {
  const ctx = useContext(MorphingDialogContext);
  if (!ctx) throw new Error("MorphingDialog parts must be inside <MorphingDialog>");
  return ctx;
}

export function MorphingDialog({
  children,
  transition = spring.layout,
}: {
  children: ReactNode;
  transition?: Transition;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const value = useMemo(() => ({ isOpen, setIsOpen, uniqueId, triggerRef }), [isOpen, uniqueId]);
  return (
    <MorphingDialogContext.Provider value={value}>
      <MotionConfig transition={transition}>{children}</MotionConfig>
    </MorphingDialogContext.Provider>
  );
}

export function MorphingDialogTrigger({
  children,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  const { setIsOpen, isOpen, uniqueId, triggerRef } = useMorphingDialog();
  return (
    <m.button
      ref={triggerRef}
      type="button"
      layoutId={`dialog-${uniqueId}`}
      className={cn("relative cursor-pointer text-left", className)}
      style={style}
      onClick={() => setIsOpen(!isOpen)}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={`dialog-content-${uniqueId}`}
      aria-label={ariaLabel}
    >
      {children}
    </m.button>
  );
}

export function MorphingDialogContainer({ children }: { children: ReactNode }) {
  const { isOpen, uniqueId } = useMorphingDialog();
  const [mounted, setMounted] = useState(false);
  // Portals need document; render nothing on the server pass.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence initial={false} mode="sync">
      {isOpen && (
        <>
          <m.div
            key={`backdrop-${uniqueId}`}
            className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center">{children}</div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function MorphingDialogContent({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { setIsOpen, isOpen, uniqueId, triggerRef } = useMorphingDialog();
  const containerRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setIsOpen(false), [setIsOpen]);

  // Focus in on open, back to the trigger on close (not on first mount).
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      document.body.classList.add("overflow-hidden");
      containerRef.current
        ?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      document.body.classList.remove("overflow-hidden");
      triggerRef.current?.focus();
    }
  }, [isOpen, triggerRef]);

  // Escape closes; Tab is trapped inside.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close();
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, close]);

  return (
    <m.div
      ref={containerRef}
      id={`dialog-content-${uniqueId}`}
      layoutId={`dialog-${uniqueId}`}
      className={cn("overflow-hidden", className)}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dialog-title-${uniqueId}`}
      aria-describedby={`dialog-description-${uniqueId}`}
    >
      <InsideContentContext.Provider value={true}>{children}</InsideContentContext.Provider>
    </m.div>
  );
}

export function MorphingDialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { uniqueId } = useMorphingDialog();
  const inside = useContext(InsideContentContext);
  return (
    <m.div
      id={inside ? `dialog-title-${uniqueId}` : undefined}
      layoutId={`dialog-title-${uniqueId}`}
      className={className}
      layout
    >
      {children}
    </m.div>
  );
}

export function MorphingDialogSubtitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { uniqueId } = useMorphingDialog();
  return (
    <m.div layoutId={`dialog-subtitle-${uniqueId}`} className={className}>
      {children}
    </m.div>
  );
}

export function MorphingDialogDescription({
  children,
  className,
  variants,
}: {
  children: ReactNode;
  className?: string;
  /** Needs `initial`, `animate` and `exit` keys. */
  variants?: Variants;
}) {
  const { uniqueId } = useMorphingDialog();
  return (
    <m.div
      id={`dialog-description-${uniqueId}`}
      variants={variants}
      className={className}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </m.div>
  );
}

export function MorphingDialogImage({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId } = useMorphingDialog();
  // Local object URLs / static demo images; next/image adds nothing here.
  return (
    <m.img
      src={src}
      alt={alt}
      className={className}
      style={style}
      layoutId={`dialog-img-${uniqueId}`}
    />
  );
}

export function MorphingDialogClose({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children?: ReactNode;
  className?: string;
  "aria-label": string;
}) {
  const { setIsOpen } = useMorphingDialog();
  return (
    <m.button
      type="button"
      onClick={() => setIsOpen(false)}
      aria-label={ariaLabel}
      className={cn(
        "absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full bg-surface text-text",
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {children ?? <XIcon size={20} aria-hidden="true" />}
    </m.button>
  );
}
