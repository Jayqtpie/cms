import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrandConfig } from '../shared/types.js';

function configPath(): string {
  return process.env.CMS_SITE_CONFIG || path.resolve(process.cwd(), 'cms.site.json');
}

let cached: BrandConfig | null = null;

export function resetConfigCache(): void {
  cached = null;
}

export async function loadSiteConfig(): Promise<BrandConfig> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    cached = JSON.parse(raw) as BrandConfig;
  } catch (err) {
    throw new Error(`Failed to load site config at ${configPath()}: ${(err as Error).message}`);
  }
  return cached;
}

export async function getSiteId(): Promise<string> {
  return (await loadSiteConfig()).siteId;
}
