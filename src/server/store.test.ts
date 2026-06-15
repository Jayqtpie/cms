import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getContent, saveDraft, publish, discard } from './store.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-store-'));
  process.env.CMS_DATA_DIR = dir;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

it('returns an empty bucket when nothing is stored', async () => {
  const bucket = await getContent('s1', 'draft');
  expect(bucket.content).toEqual({});
  expect(bucket.meta.lastSaved).toBeNull();
});

it('saves a draft and stamps lastSaved', async () => {
  const bucket = await saveDraft('s1', { 'hero.headline': 'Hi' });
  expect(bucket.content['hero.headline']).toBe('Hi');
  expect(bucket.meta.lastSaved).not.toBeNull();
  const reread = await getContent('s1', 'draft');
  expect(reread.content['hero.headline']).toBe('Hi');
});

it('publish copies draft to published and stamps lastPublished', async () => {
  await saveDraft('s1', { a: 1 });
  const pub = await publish('s1');
  expect(pub.content).toEqual({ a: 1 });
  expect(pub.meta.lastPublished).not.toBeNull();
  expect((await getContent('s1', 'published')).content).toEqual({ a: 1 });
});

it('discard reverts the draft to published', async () => {
  await saveDraft('s1', { a: 1 });
  await publish('s1');
  await saveDraft('s1', { a: 2 });
  const reverted = await discard('s1');
  expect(reverted.content).toEqual({ a: 1 });
});

it('second saveDraft fully replaces the first (no merge)', async () => {
  await saveDraft('s1', { a: 1 });
  await saveDraft('s1', { b: 2 });
  const bucket = await getContent('s1', 'draft');
  expect(bucket.content).toEqual({ b: 2 });
});
