"use client";
/*
 * AnimatedBackground: one highlight pill that glides between options
 * (Snapshot chips, segmented controls), signature moment 4.
 * Adapted from Motion Primitives (MIT, ibelick), see docs/THIRD_PARTY.md.
 * Changes: `m` components; spring.ui by default; controlled `value` as well
 * as `defaultValue` (no state sync in an effect); typed children; pill
 * defaults to surface-raised + shadow-pill as on board B.
 *
 * It only paints the highlight. Selection semantics (radio group, toggle
 * group, aria-checked) belong to the children, e.g. Radix ToggleGroup items.
 */
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, type Transition } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/client/motion";

type ItemProps = {
  "data-id": string;
  "data-checked"?: "true" | "false";
  className?: string;
  children?: ReactNode;
  onClick?: (event: React.MouseEvent) => void;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
};

export type AnimatedBackgroundProps = {
  children: ReactElement<ItemProps> | ReactElement<ItemProps>[];
  /** Controlled active id. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Classes for the moving highlight. */
  className?: string;
  transition?: Transition;
  enableHover?: boolean;
};

export function AnimatedBackground({
  children,
  value,
  defaultValue = null,
  onValueChange,
  className,
  transition = spring.ui,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [internal, setInternal] = useState<string | null>(defaultValue);
  const activeId = value !== undefined ? value : internal;
  const layoutId = `highlight-${useId()}`;

  const setActive = (id: string | null) => {
    if (value === undefined) setInternal(id);
    onValueChange?.(id);
  };

  return Children.map(children, (child) => {
    if (!isValidElement<ItemProps>(child)) return child;
    const id = child.props["data-id"];
    const handlers = enableHover
      ? {
          onMouseEnter: (e: React.MouseEvent) => {
            child.props.onMouseEnter?.(e);
            setActive(id);
          },
          onMouseLeave: (e: React.MouseEvent) => {
            child.props.onMouseLeave?.(e);
            setActive(null);
          },
        }
      : {
          onClick: (e: React.MouseEvent) => {
            child.props.onClick?.(e);
            setActive(id);
          },
        };

    return cloneElement(
      child,
      {
        className: cn("relative inline-flex", child.props.className),
        "data-checked": activeId === id ? "true" : "false",
        ...handlers,
      } satisfies Partial<ItemProps>,
      <>
        <AnimatePresence initial={false}>
          {activeId === id && (
            <m.span
              aria-hidden="true"
              layoutId={layoutId}
              className={cn(
                "absolute inset-0 rounded-full bg-surface-raised shadow-pill",
                className,
              )}
              transition={transition}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
        <span className="relative z-10 inline-flex items-center justify-center">
          {child.props.children}
        </span>
      </>,
    );
  });
}
