import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getContent, saveDraft, publish, discard, VersionConflictError } from './store.js';

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

it('empty bucket starts at version 0 and each save increments it', async () => {
  expect((await getContent('s1', 'draft')).version).toBe(0);
  expect((await saveDraft('s1', { a: 1 })).version).toBe(1);
  expect((await saveDraft('s1', { a: 2 })).version).toBe(2);
});

it('saveDraft with a matching expectedVersion succeeds', async () => {
  const first = await saveDraft('s1', { a: 1 }); // version 1
  const second = await saveDraft('s1', { a: 2 }, first.version);
  expect(second.version).toBe(2);
  expect(second.content).toEqual({ a: 2 });
});

it('saveDraft with a stale expectedVersion throws VersionConflictError carrying current', async () => {
  await saveDraft('s1', { a: 1 }); // version 1
  await saveDraft('s1', { a: 2 }); // version 2
  try {
    await saveDraft('s1', { a: 3 }, 1); // stale
    expect.unreachable('should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).current.version).toBe(2);
    expect((err as VersionConflictError).current.content).toEqual({ a: 2 });
  }
  // The conflicting write must not have landed.
  expect((await getContent('s1', 'draft')).content).toEqual({ a: 2 });
});

it('discard bumps the draft version so stale editors get a conflict', async () => {
  await saveDraft('s1', { a: 1 });
  await publish('s1');
  const dirty = await saveDraft('s1', { a: 2 });
  const reverted = await discard('s1');
  expect(reverted.version).toBe(dirty.version + 1);
});

it('publish writes a history snapshot of the published bucket', async () => {
  await saveDraft('s1', { a: 1 });
  await publish('s1');
  const historyDir = path.join(dir, 's1', 'history');
  const files = (await fs.readdir(historyDir)).filter((f) => f.endsWith('.json'));
  expect(files.length).toBe(1);
  const snap = JSON.parse(await fs.readFile(path.join(historyDir, files[0]), 'utf8'));
  expect(snap.content).toEqual({ a: 1 });
  expect(snap.meta.lastPublished).not.toBeNull();
});

it('a legacy bucket file without a version field reads back as version 0', async () => {
  const siteDir = path.join(dir, 'legacy');
  await fs.mkdir(siteDir, { recursive: true });
  await fs.writeFile(
    path.join(siteDir, 'draft.json'),
    JSON.stringify({ content: { a: 1 }, meta: { lastSaved: null, lastPublished: null } }),
    'utf8',
  );
  const bucket = await getContent('legacy', 'draft');
  expect(bucket.version).toBe(0);
  expect(bucket.content).toEqual({ a: 1 });
});
