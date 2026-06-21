import type { Field, FieldType, ItemField } from '../shared/types.js';
import { SEO_FIELDS, SEO_GROUP } from '../shared/seo.js';

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
    case 'video': {
      const v = el instanceof HTMLVideoElement ? el : el.querySelector('video');
      return v?.getAttribute('src') || v?.querySelector('source')?.getAttribute('src') || '';
    }
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
      hint: el.getAttribute('data-cms-hint') || undefined,
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
          hint: f.getAttribute('data-cms-hint') || undefined,
        }))
      : [];
    fields.push({
      key,
      type: 'text',
      label: el.getAttribute('data-cms-label') || humanize(key),
      group: el.getAttribute('data-cms-group') || 'Content',
      hint: el.getAttribute('data-cms-hint') || undefined,
      isList: true,
      itemFields,
      defaultContent: [],
    });
  });

  return fields;
}

function metaContent(doc: Document, attr: string, value: string): string {
  return doc.querySelector(`meta[${attr}="${value}"]`)?.getAttribute('content') ?? '';
}

/**
 * The synthetic "Page & SEO" fields. They aren't marked up on the page (the
 * engine manages <head>), so their defaults are read from whatever the page
 * already has: its title, meta description, and og:image.
 */
export function discoverSeo(root: ParentNode = document): Field[] {
  const doc: Document =
    root instanceof Document ? root : ((root as Node).ownerDocument ?? document);
  const defaults: Record<string, string> = {
    'seo.title': doc.title || '',
    'seo.description': metaContent(doc, 'name', 'description'),
    'seo.ogImage': metaContent(doc, 'property', 'og:image'),
  };
  return SEO_FIELDS.map((f) => ({
    key: f.key,
    type: f.type,
    label: f.label,
    group: SEO_GROUP,
    hint: f.hint,
    defaultContent: defaults[f.key] ?? '',
  }));
}
