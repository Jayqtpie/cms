import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bucket, Content } from '../shared/types.js';

type State = 'draft' | 'published';

function dataDir(): string {
  return process.env.CMS_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function bucketPath(siteId: string, state: State): string {
  return path.join(dataDir(), siteId, `${state}.json`);
}

function emptyBucket(): Bucket {
  return { content: {}, meta: { lastSaved: null, lastPublished: null } };
}

async function read(siteId: string, state: State): Promise<Bucket> {
  try {
    return JSON.parse(await fs.readFile(bucketPath(siteId, state), 'utf8')) as Bucket;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyBucket();
    throw err;
  }
}

async function write(siteId: string, state: State, bucket: Bucket): Promise<void> {
  await fs.mkdir(path.join(dataDir(), siteId), { recursive: true });
  await fs.writeFile(bucketPath(siteId, state), JSON.stringify(bucket, null, 2), 'utf8');
}

export async function getContent(siteId: string, state: State): Promise<Bucket> {
  return read(siteId, state);
}

export async function saveDraft(siteId: string, content: Content): Promise<Bucket> {
  const draft = await read(siteId, 'draft');
  const updated: Bucket = {
    content,
    meta: { ...draft.meta, lastSaved: new Date().toISOString() },
  };
  await write(siteId, 'draft', updated);
  return updated;
}

export async function publish(siteId: string): Promise<Bucket> {
  const draft = await read(siteId, 'draft');
  const now = new Date().toISOString();
  const published: Bucket = {
    content: draft.content,
    meta: { lastSaved: draft.meta.lastSaved, lastPublished: now },
  };
  await write(siteId, 'published', published);
  await write(siteId, 'draft', { ...draft, meta: { ...draft.meta, lastPublished: now } });
  return published;
}

export async function discard(siteId: string): Promise<Bucket> {
  const published = await read(siteId, 'published');
  const reverted: Bucket = {
    content: published.content,
    meta: { lastSaved: new Date().toISOString(), lastPublished: published.meta.lastPublished },
  };
  await write(siteId, 'draft', reverted);
  return reverted;
}
