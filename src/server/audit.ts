import path from 'node:path';
import { appendJsonl, dataDir, readJsonl } from './jsonl.js';

export interface AuditEntry {
  ts: string;
  event: string;
  detail?: Record<string, unknown>;
}

function auditPath(siteId: string): string {
  return path.join(dataDir(), siteId, 'audit.jsonl');
}

/**
 * Append an audit event. Returns a promise (so tests can await it) but callers
 * in request paths fire-and-forget — auditing must never block or fail a
 * response, hence the swallowed error.
 */
export function audit(
  siteId: string,
  event: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const entry: AuditEntry = {
    ts: new Date().toISOString(),
    event,
    ...(detail ? { detail } : {}),
  };
  return appendJsonl(auditPath(siteId), entry).catch(() => {});
}

/** Most recent audit entries for a site (oldest→newest), capped at `limit`. */
export function readAudit(siteId: string, limit = 5000): Promise<AuditEntry[]> {
  return readJsonl<AuditEntry>(auditPath(siteId), limit);
}
