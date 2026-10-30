"use client";

import { RadioGroup } from "radix-ui";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PersonaOption = { id: string; name: string; age: number; line: string; photo: string };

/*
 * Pick a sample person by face. Four portrait cards (two by two on a phone,
 * four across on a wide screen); the chosen one gets a ring and a tick. Radix
 * RadioGroup gives the semantics and the arrow keys. The people are AI-generated,
 * and the screen says so just above.
 */
export function PersonaPicker({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: readonly PersonaOption[];
  value: string;
  onValueChange: (id: string) => void;
}) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={onValueChange} className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
      {options.map((p) => {
        const on = p.id === value;
        return (
          <RadioGroup.Item
            key={p.id}
            value={p.id}
            aria-label={`${p.name}, ${p.age}. ${p.line}`}
            className={cn(
              "group relative aspect-3/4 overflow-hidden rounded-card bg-peach text-left outline-offset-4 transition-[box-shadow,transform] duration-(--dur-base) ease-out",
              on ? "shadow-raised ring-4 ring-action" : "ring-0 hover:-translate-y-0.5",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.photo}
              alt=""
              loading="eager"
              className={cn("absolute inset-0 size-full object-cover object-[50%_20%] transition-transform duration-(--dur-gentle) ease-out", on && "scale-[1.03]")}
            />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-scrim via-scrim/70 to-transparent px-3 pt-10 pb-3 text-on-photo">
              <span className="font-display text-lg leading-tight font-medium">
                {p.name}, {p.age}
              </span>
              <span className="text-xs leading-snug">{p.line}</span>
            </span>
            <RadioGroup.Indicator forceMount asChild>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-action text-on-action transition-[opacity,transform] duration-(--dur-base) ease-out",
                  on ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
              >
                <CheckIcon className="size-4" />
              </span>
            </RadioGroup.Indicator>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
