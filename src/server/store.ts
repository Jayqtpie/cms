import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bucket, Content } from '../shared/types.js';

type State = 'draft' | 'published';

/** Max publish snapshots to retain per site before the oldest are pruned. */
const HISTORY_LIMIT = 100;

/**
 * Thrown by saveDraft when the caller's expected version no longer matches the
 * stored draft (a concurrent write happened). The current bucket is attached so
 * the route can return it and the editor can reconcile.
 */
export class VersionConflictError extends Error {
  constructor(public readonly current: Bucket) {
    super('version conflict');
    this.name = 'VersionConflictError';
  }
}

function dataDir(): string {
  return process.env.CMS_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function siteDir(siteId: string): string {
  return path.join(dataDir(), siteId);
}

function bucketPath(siteId: string, state: State): string {
  return path.join(siteDir(siteId), `${state}.json`);
}

function emptyBucket(): Bucket {
  return { content: {}, meta: { lastSaved: null, lastPublished: null }, version: 0 };
}

/** Normalise parsed JSON so legacy files (pre-version) get sane defaults. */
function normalise(raw: unknown): Bucket {
  const b = (raw ?? {}) as Partial<Bucket>;
  return {
    content: (b.content ?? {}) as Content,
    meta: {
      lastSaved: b.meta?.lastSaved ?? null,
      lastPublished: b.meta?.lastPublished ?? null,
    },
    version: typeof b.version === 'number' ? b.version : 0,
  };
}

async function read(siteId: string, state: State): Promise<Bucket> {
  try {
    return normalise(JSON.parse(await fs.readFile(bucketPath(siteId, state), 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyBucket();
    throw err;
  }
}

/**
 * Atomic write: serialise to a unique temp file in the same directory, then
 * rename over the target. rename(2) is atomic on a single filesystem, so a
 * crash or kill mid-write can never leave a truncated or empty JSON file —
 * the reader sees either the old contents or the new, never a half-write.
 */
async function writeFileAtomic(file: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

async function write(siteId: string, state: State, bucket: Bucket): Promise<void> {
  await writeFileAtomic(bucketPath(siteId, state), JSON.stringify(bucket, null, 2));
}

/** Snapshot a published bucket into history/, pruning to HISTORY_LIMIT. */
async function snapshot(siteId: string, bucket: Bucket): Promise<void> {
  const dir = path.join(siteDir(siteId), 'history');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFileAtomic(path.join(dir, `${stamp}.json`), JSON.stringify(bucket, null, 2));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const excess = files.length - HISTORY_LIMIT;
  if (excess > 0) {
    await Promise.all(files.slice(0, excess).map((f) => fs.rm(path.join(dir, f), { force: true })));
  }
}

export async function getContent(siteId: string, state: State): Promise<Bucket> {
  return read(siteId, state);
}

/**
 * Save the draft. When expectedVersion is supplied it must match the stored
 * draft's version, otherwise a VersionConflictError is thrown (optimistic
 * concurrency). Omitting it skips the check (best-effort write).
 */
export async function saveDraft(
  siteId: string,
  content: Content,
  expectedVersion?: number,
): Promise<Bucket> {
  const draft = await read(siteId, 'draft');
  if (typeof expectedVersion === 'number' && expectedVersion !== draft.version) {
    throw new VersionConflictError(draft);
  }
  const updated: Bucket = {
    content,
    meta: { ...draft.meta, lastSaved: new Date().toISOString() },
    version: draft.version + 1,
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
    version: draft.version,
  };
  await write(siteId, 'published', published);
  await write(siteId, 'draft', { ...draft, meta: { ...draft.meta, lastPublished: now } });
  await snapshot(siteId, published);
  return published;
}

export async function discard(siteId: string): Promise<Bucket> {
  const published = await read(siteId, 'published');
  const draft = await read(siteId, 'draft');
  // Bump the version so any editor holding the pre-discard draft gets a 409 on
  // its next autosave and reloads, rather than re-applying discarded edits.
  const reverted: Bucket = {
    content: published.content,
    meta: { lastSaved: new Date().toISOString(), lastPublished: published.meta.lastPublished },
    version: draft.version + 1,
  };
  await write(siteId, 'draft', reverted);
  return reverted;
}
