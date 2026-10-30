"use client";

import { CheckboxRow } from "@/components/ui/checkbox";

/** "Before your first treatment": plain tick-boxes, saved with the plan. */
export function Checklist({
  items,
  checked,
  onToggle,
}: {
  items: readonly { id: string; label: string }[];
  checked: Readonly<Record<string, boolean>>;
  onToggle: (id: string, value: boolean) => void;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <CheckboxRow id={`check-${item.id}`} checked={checked[item.id] ?? false} onCheckedChange={(v) => onToggle(item.id, v)}>
            {item.label}
          </CheckboxRow>
        </li>
      ))}
    </ul>
  );
}
