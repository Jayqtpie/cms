import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { health, logError, startHeartbeat } from './observability.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-obs-'));
  process.env.CMS_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.CMS_HEARTBEAT_URL;
  await fs.rm(dir, { recursive: true, force: true });
});

it('health() reports ok, a version and uptime', () => {
  const h = health();
  expect(h.ok).toBe(true);
  expect(typeof h.version).toBe('string');
  expect(h.version).not.toBe('');
  expect(h.uptimeSeconds).toBeGreaterThanOrEqual(0);
});

it('logError writes a record to errors.jsonl', async () => {
  logError(new Error('boom'), { url: '/x' });
  // fire-and-forget — give the append a tick to flush
  await new Promise((r) => setTimeout(r, 30));
  const raw = await fs.readFile(path.join(dir, 'errors.jsonl'), 'utf8');
  const entry = JSON.parse(raw.trim().split('\n').pop()!);
  expect(entry.message).toBe('boom');
  expect(entry.url).toBe('/x');
});

it('startHeartbeat is a no-op (returns a function) when no URL is set', () => {
  const stop = startHeartbeat(async () => 'site');
  expect(typeof stop).toBe('function');
  stop();
});
