import { rm } from 'node:fs/promises';
import path from 'node:path';

export default async function globalSetup() {
  const dataDir = process.env.CMS_DATA_DIR ?? path.resolve(process.cwd(), '.e2e-data');
  await rm(dataDir, { recursive: true, force: true });
}
