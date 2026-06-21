import { expect, it } from 'vitest';
import { diffContent } from './diff.js';
import type { Field } from './types.js';

const fields: Field[] = [
  { key: 'hero.headline', type: 'rich', label: 'Headline', group: 'Hero', defaultContent: '' },
  { key: 'hero.image', type: 'image', label: 'Hero image', group: 'Hero', defaultContent: '' },
  { key: 'about.body', type: 'rich', label: 'About text', group: 'About', defaultContent: '' },
];

it('returns no changes when draft equals published', () => {
  const c = { 'hero.headline': 'Hi' };
  expect(diffContent(c, { ...c }, fields)).toEqual([]);
});

it('detects a changed value with before/after and a label', () => {
  const changes = diffContent({ 'hero.headline': 'New' }, { 'hero.headline': 'Old' }, fields);
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    key: 'hero.headline',
    label: 'Headline',
    group: 'Hero',
    kind: 'changed',
    before: 'Old',
    after: 'New',
  });
});

it('classifies added and removed', () => {
  const added = diffContent({ 'about.body': 'Hello' }, {}, fields);
  expect(added[0].kind).toBe('added');
  const removed = diffContent({}, { 'about.body': 'Hello' }, fields);
  expect(removed[0].kind).toBe('removed');
});

it('treats blank vs unset as no change', () => {
  expect(diffContent({ 'hero.headline': '' }, {}, fields)).toEqual([]);
  expect(diffContent({}, { 'hero.headline': '' }, fields)).toEqual([]);
});

it('labels variant keys with the base field label plus the variant', () => {
  const changes = diffContent({ 'hero.headline@bride': 'Bride' }, {}, fields);
  expect(changes[0]).toMatchObject({ label: 'Headline (bride)', variant: 'bride', kind: 'added' });
});

it('falls back to the raw key when no field matches', () => {
  const changes = diffContent({ 'foo.bar': 'x' }, {}, fields);
  expect(changes[0].label).toBe('foo.bar');
});

it('labels alt-text keys using the image field label', () => {
  const changes = diffContent({ 'hero.image#alt': 'A photo' }, {}, fields);
  expect(changes[0].kind).toBe('added');
  expect(changes[0].label).toBe('Hero image — alt text');
});

it('detects list (array) changes', () => {
  const changes = diffContent({ items: [1, 2, 3] }, { items: [1, 2] }, fields);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe('changed');
  expect(changes[0].after).toEqual([1, 2, 3]);
});

it('sorts changes by group then label', () => {
  const changes = diffContent(
    { 'about.body': 'a', 'hero.headline': 'b' },
    {},
    fields,
  );
  expect(changes.map((c) => c.group)).toEqual(['About', 'Hero']);
});
