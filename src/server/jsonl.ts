import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Root for all on-disk state (content, audit, errors). Mirrors store.ts. */
export function dataDir(): string {
  return process.env.CMS_DATA_DIR || path.resolve(process.cwd(), 'data');
}

/** Append one JSON record as a line to a .jsonl file, creating the dir. */
export async function appendJsonl(file: string, entry: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** Read the last `limit` records from a .jsonl file ([] if missing/unreadable). */
export async function readJsonl<T>(file: string, limit = 5000): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    return lines.slice(-limit).map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}
