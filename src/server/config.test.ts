import { beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSiteConfig, getSiteId, resetConfigCache } from './config.js';

beforeEach(() => {
  process.env.CMS_SITE_CONFIG = path.resolve(process.cwd(), 'cms.site.test.json');
  resetConfigCache();
});

it('loads the site config from CMS_SITE_CONFIG', async () => {
  const cfg = await loadSiteConfig();
  expect(cfg.siteId).toBe('test-site');
  expect(cfg.brand.name).toBe('Test Co');
});

it('exposes the siteId', async () => {
  expect(await getSiteId()).toBe('test-site');
});

it('rejects with a path-containing message on malformed JSON', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-cfg-'));
  const badFile = path.join(tmpDir, 'bad.json');
  await fs.writeFile(badFile, '{ not valid json', 'utf8');
  process.env.CMS_SITE_CONFIG = badFile;
  resetConfigCache();
  try {
    await expect(loadSiteConfig()).rejects.toThrow(badFile);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
