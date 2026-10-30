import { copy } from "@/content/copy";
import type { StyleCatalogItem } from "@/lib/catalog";

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-sm text-text-muted">{title}</dt>
      <dd>
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className="rounded-full bg-bg px-3 py-1.5 text-sm">
              {item}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

/*
 * What to say at a wig shop, in shop language: the style in a sentence, then
 * the fibre and cap options and comfort notes. It's our guidance (labelled),
 * not a product recommendation, and never names a brand or SKU.
 */
export function AskForSpec({ style, line }: { style: StyleCatalogItem; /** The words to say, from the person's own answers (askForLine). */ line?: string }) {
  return (
    <section aria-label={style.label} className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <h3 className="text-base">{style.label}</h3>
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-text-muted">{copy.plan.askFor}</dt>
          <dd className="text-base font-semibold">“{line ?? style.askFor}”</dd>
        </div>
        <List title={copy.plan.fibres} items={style.wigNotes.fibres} />
        <List title={copy.plan.caps} items={style.wigNotes.caps} />
        <List title={copy.plan.comfort} items={style.wigNotes.comfort} />
      </dl>
    </section>
  );
}
