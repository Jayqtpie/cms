import type { Field, FieldType, ItemField } from '../shared/types.js';

export function humanize(key: string): string {
  const last = key.split('.').pop() || key;
  return last
    .replace(/@.*/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function variantOf(raw: string): string | undefined {
  const at = raw.indexOf('@');
  return at === -1 ? undefined : raw.slice(at + 1);
}

export function readElement(el: HTMLElement, type: FieldType): unknown {
  switch (type) {
    case 'image':
      return el.getAttribute('src') || '';
    case 'link':
      return { text: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' };
    case 'boolean':
      return el.getAttribute('data-cms-value') === 'true';
    // 'rich' and 'select' fall through to the text read intentionally:
    // 'rich' stores its existing innerHTML as the default; the 'select'
    // editor widget is deferred to a later version (see plan self-review).
    case 'rich':
    case 'select':
    default:
      return el.innerHTML.trim();
  }
}

export function discover(root: ParentNode = document): Field[] {
  const fields: Field[] = [];

  root.querySelectorAll<HTMLElement>('[data-cms]').forEach((el) => {
    const raw = el.getAttribute('data-cms')!;
    const type = (el.getAttribute('data-cms-type') as FieldType) || 'text';
    fields.push({
      key: raw,
      type,
      label: el.getAttribute('data-cms-label') || humanize(raw),
      group: el.getAttribute('data-cms-group') || 'Content',
      variant: variantOf(raw),
      defaultContent: readElement(el, type),
    });
  });

  root.querySelectorAll<HTMLElement>('[data-cms-list]').forEach((el) => {
    const key = el.getAttribute('data-cms-list')!;
    const tpl = el.querySelector<HTMLTemplateElement>('template[data-cms-item]');
    const itemFields: ItemField[] = tpl
      ? Array.from(tpl.content.querySelectorAll<HTMLElement>('[data-cms-field]')).map((f) => ({
          key: f.getAttribute('data-cms-field')!,
          type: (f.getAttribute('data-cms-type') as FieldType) || 'text',
          label: f.getAttribute('data-cms-label') || humanize(f.getAttribute('data-cms-field')!),
        }))
      : [];
    fields.push({
      key,
      type: 'text',
      label: el.getAttribute('data-cms-label') || humanize(key),
      group: el.getAttribute('data-cms-group') || 'Content',
      isList: true,
      itemFields,
      defaultContent: [],
    });
  });

  return fields;
}
