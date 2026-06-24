import path from 'node:path';
import { readFileSync } from 'node:fs';
import { appendJsonl, dataDir } from './jsonl.js';

const startedAt = Date.now();

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    return (pkg.version as string) ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface Health {
  ok: true;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export function health(): Health {
  return {
    ok: true,
    version: version(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
}

/** Append an error record to data/errors.jsonl (fire-and-forget). */
export function logError(err: unknown, context?: Record<string, unknown>): void {
  const e = err as Error;
  const entry = {
    ts: new Date().toISOString(),
    message: e?.message ?? String(err),
    stack: e?.stack,
    ...context,
  };
  void appendJsonl(path.join(dataDir(), 'errors.jsonl'), entry).catch(() => {});
}

/**
 * If CMS_HEARTBEAT_URL is set, POST a small status payload there on startup and
 * every CMS_HEARTBEAT_INTERVAL_MIN minutes (default 15) using the built-in
 * fetch. Lets a central dashboard know each install is alive. Returns a stop
 * function. A no-op when no URL is configured.
 */
export function startHeartbeat(getSiteId: () => Promise<string>): () => void {
  const url = process.env.CMS_HEARTBEAT_URL;
  if (!url) return () => {};
  const minutes = Math.max(1, Number(process.env.CMS_HEARTBEAT_INTERVAL_MIN) || 15);

  const send = async (): Promise<void> => {
    try {
      const siteId = await getSiteId().catch(() => 'unknown');
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...health(), siteId, status: 'ok' }),
      });
    } catch {
      /* best effort — never crash on a missed heartbeat */
    }
  };

  void send();
  const timer = setInterval(() => void send(), minutes * 60_000);
  // Don't let the heartbeat keep the process alive (Node-only; guarded so the
  // DOM/Node setInterval return-type ambiguity doesn't matter).
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
