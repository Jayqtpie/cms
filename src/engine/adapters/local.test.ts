// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { createLocalAdapter } from './local.js';

beforeEach(() => localStorage.clear());

it('saves a draft and publishes it', async () => {
  const a = createLocalAdapter('s1');
  await a.saveDraft({ x: 1 });
  expect(await a.getDraft()).toEqual({ x: 1 });
  expect(await a.getPublished()).toEqual({});
  await a.publish();
  expect(await a.getPublished()).toEqual({ x: 1 });
});

it('returns {} for a corrupt localStorage value', async () => {
  const a = createLocalAdapter('s1');
  localStorage.setItem('cms:s1:published', '{not json');
  expect(await a.getPublished()).toEqual({});
});

it('publish() does not overwrite published when no draft was saved', async () => {
  const a = createLocalAdapter('s1');
  localStorage.setItem('cms:s1:published', JSON.stringify({ keep: 1 }));
  await a.publish();
  expect(await a.getPublished()).toEqual({ keep: 1 });
});

it('keeps separate siteId namespaces isolated', async () => {
  const a = createLocalAdapter('s1');
  const b = createLocalAdapter('s2');
  await a.saveDraft({ x: 1 });
  expect(await b.getDraft()).toEqual({});
});
