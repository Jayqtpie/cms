// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createStickyBinder, type StickyBinder } from './bind.js';

// jsdom delivers MutationObserver records on a microtask; a macrotask turn
// guarantees they've been flushed before we assert.
const tick = () => new Promise((r) => setTimeout(r, 0));

let binder: StickyBinder | null = null;

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

afterEach(() => {
  binder?.stop();
  binder = null;
});

it('re-applies the last content after a framework reverts the DOM (hydration clobber)', async () => {
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;
  const original = tagline.textContent;

  binder = createStickyBinder(document);
  binder.apply({ 'hero.tagline': 'Draft tagline' });
  expect(tagline.textContent).toBe('Draft tagline');

  // Simulate React/Next hydration reconciling the node back to server markup.
  tagline.textContent = original;
  await tick();

  expect(tagline.textContent).toBe('Draft tagline');
});

it('survives full node replacement of a painted element (stable-ancestor observer)', async () => {
  const before = document.querySelector('[data-cms="hero.tagline"]')! as HTMLElement;

  binder = createStickyBinder(document);
  binder.apply({ 'hero.tagline': 'Draft tagline' });
  expect(before.textContent).toBe('Draft tagline');

  // React can swap the whole element node during reconciliation. A per-element
  // observer dies here; a stable-ancestor observer on <body> must still re-apply.
  const replacement = before.cloneNode(false) as HTMLElement; // same attrs incl. data-cms
  replacement.textContent = 'One goal. Your best day.'; // server markup
  before.replaceWith(replacement);
  await tick();

  const after = document.querySelector('[data-cms="hero.tagline"]')!;
  expect(after).toBe(replacement);
  expect(after.textContent).toBe('Draft tagline');
});

it('re-applies an image src clobbered by hydration', async () => {
  const img = document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!;

  binder = createStickyBinder(document);
  binder.apply({ 'hero.image': '/uploads/new.jpg' });
  expect(img.getAttribute('src')).toBe('/uploads/new.jpg');

  img.setAttribute('src', '/img/hero.jpg'); // server markup
  await tick();

  expect(img.getAttribute('src')).toBe('/uploads/new.jpg');
});

it('stops re-applying after stop() so the observer does not run forever', async () => {
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;
  const original = tagline.textContent;

  binder = createStickyBinder(document);
  binder.apply({ 'hero.tagline': 'Draft tagline' });
  binder.stop();

  tagline.textContent = original;
  await tick();

  expect(tagline.textContent).toBe(original); // no re-apply after stop
});

it('apply() after stop() is a no-op — stop is final, the binder cannot be revived', async () => {
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;

  binder = createStickyBinder(document);
  binder.apply({ 'hero.tagline': 'Draft tagline' });
  binder.stop();

  // A lingering caller tries to revive a dead binder — must be ignored, so a
  // stopped binder can never re-attach a second observer to the same root.
  binder.apply({ 'hero.tagline': 'Revived' });
  expect(tagline.textContent).toBe('Draft tagline'); // not 'Revived'

  tagline.textContent = 'Server markup';
  await tick();
  expect(tagline.textContent).toBe('Server markup'); // observer stays disconnected
});
