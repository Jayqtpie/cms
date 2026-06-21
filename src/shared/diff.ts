import { ALT_KEY_SUFFIX, type Content, type Field, type FieldType } from './types.js';

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface ContentChange {
  /** Raw content key, e.g. "hero.headline" or "hero.headline@bride". */
  key: string;
  /** Human label (from the schema where known, else the key). */
  label: string;
  group?: string;
  variant?: string;
  type?: FieldType;
  kind: ChangeKind;
  before: unknown;
  after: unknown;
}

function baseKey(key: string): string {
  const at = key.indexOf('@');
  return at === -1 ? key : key.slice(0, at);
}

function variantOf(key: string): string | undefined {
  const at = key.indexOf('@');
  return at === -1 ? undefined : key.slice(at + 1);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** True for values we treat as "no content" (so blank ↔ unset isn't a change). */
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/**
 * Compare the draft against the published content and return the list of
 * changes that publishing would apply. `fields` (the discovered schema) is used
 * only to attach readable labels/groups; the diff itself is schema-independent,
 * so keys with no matching field are still reported.
 */
export function diffContent(
  draft: Content,
  published: Content,
  fields: Field[] = [],
): ContentChange[] {
  const meta = new Map<string, Pick<Field, 'label' | 'group' | 'type'>>();
  for (const f of fields) meta.set(f.key, { label: f.label, group: f.group, type: f.type });

  const keys = new Set<string>([...Object.keys(draft), ...Object.keys(published)]);
  const changes: ContentChange[] = [];

  for (const key of keys) {
    const after = draft[key];
    const before = published[key];
    if (sameValue(before, after)) continue;

    const beforeEmpty = isEmpty(before);
    const afterEmpty = isEmpty(after);
    if (beforeEmpty && afterEmpty) continue; // e.g. "" vs undefined — not a real change

    const kind: ChangeKind = beforeEmpty ? 'added' : afterEmpty ? 'removed' : 'changed';

    // Alt-text sub-keys ("hero.image#alt") borrow their image field's label.
    const isAlt = key.endsWith(ALT_KEY_SUFFIX);
    const lookupKey = isAlt ? key.slice(0, -ALT_KEY_SUFFIX.length) : key;

    const m = meta.get(lookupKey) ?? meta.get(baseKey(lookupKey));
    const variant = variantOf(lookupKey);
    const base = m?.label ?? baseKey(lookupKey);
    let label = variant ? `${base} (${variant})` : base;
    if (isAlt) label += ' — alt text';

    changes.push({ key, label, group: m?.group, variant, type: m?.type, kind, before, after });
  }

  // Stable order: by group, then label, then key.
  changes.sort(
    (a, b) =>
      (a.group ?? '').localeCompare(b.group ?? '') ||
      a.label.localeCompare(b.label) ||
      a.key.localeCompare(b.key),
  );
  return changes;
}
