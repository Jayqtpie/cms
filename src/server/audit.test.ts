import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, readAudit } from './audit.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-audit-'));
  process.env.CMS_DATA_DIR = dir;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

it('returns an empty list when nothing is logged', async () => {
  expect(await readAudit('s1')).toEqual([]);
});

it('appends events and reads them back in order', async () => {
  await audit('s1', 'login.success', { ip: '1.2.3.4' });
  await audit('s1', 'publish', { version: 3 });
  const entries = await readAudit('s1');
  expect(entries.map((e) => e.event)).toEqual(['login.success', 'publish']);
  expect(entries[0].detail).toEqual({ ip: '1.2.3.4' });
  expect(entries[1].detail).toEqual({ version: 3 });
  expect(entries[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it('keeps each site trail separate', async () => {
  await audit('a', 'publish');
  await audit('b', 'discard');
  expect((await readAudit('a')).map((e) => e.event)).toEqual(['publish']);
  expect((await readAudit('b')).map((e) => e.event)).toEqual(['discard']);
});

it('respects the read limit (most recent)', async () => {
  for (let i = 0; i < 5; i++) await audit('s1', `e${i}`);
  const last2 = await readAudit('s1', 2);
  expect(last2.map((e) => e.event)).toEqual(['e3', 'e4']);
});
