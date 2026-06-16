// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { runLiveMode } from './index.js';
import type { StickyBinder } from './bind.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

let binder: StickyBinder | null = null;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

afterEach(() => {
  binder?.stop();
  binder = null;
});

it('keeps published content applied after a hydration clobber (live mode)', async () => {
  localStorage.setItem('cms:s1:published', JSON.stringify({ 'hero.tagline': 'Published tagline' }));
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;

  binder = await runLiveMode({ siteId: 's1', backend: { type: 'local' } });
  expect(tagline.textContent).toBe('Published tagline');

  // Next/React hydration reverts the node to its server-rendered markup.
  tagline.textContent = 'One goal. Your best day.';
  await tick();

  expect(tagline.textContent).toBe('Published tagline');
});

it('re-applies published content pushed by a later storage event', async () => {
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;

  binder = await runLiveMode({ siteId: 's1', backend: { type: 'local' } });

  // Another tab publishes; the storage listener picks it up...
  localStorage.setItem('cms:s1:published', JSON.stringify({ 'hero.tagline': 'From another tab' }));
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'cms:s1:published',
      newValue: JSON.stringify({ 'hero.tagline': 'From another tab' }),
    }),
  );
  await tick();
  expect(tagline.textContent).toBe('From another tab');

  // ...and that update must also survive a subsequent clobber.
  tagline.textContent = 'One goal. Your best day.';
  await tick();
  expect(tagline.textContent).toBe('From another tab');
});
