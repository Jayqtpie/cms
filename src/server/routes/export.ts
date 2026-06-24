import { Router } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSiteId } from '../config.js';
import { getContent } from '../store.js';
import { readAudit } from '../audit.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

export const exportRouter = Router();

// GET /api/export — a single downloadable JSON with everything for this site:
// draft + published content, the uploads manifest, and the audit trail.
exportRouter.get('/', requireAuth, (_req, res, next) => {
  (async () => {
    const siteId = await getSiteId();
    const [draft, published] = await Promise.all([
      getContent(siteId, 'draft'),
      getContent(siteId, 'published'),
    ]);

    let uploads: string[] = [];
    try {
      uploads = await fs.readdir(path.join(uploadRoot(), siteId));
    } catch {
      uploads = [];
    }

    const audit = await readAudit(siteId);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${siteId}-export-${Date.now()}.json"`,
    );
    res.json({ siteId, exportedAt: new Date().toISOString(), draft, published, uploads, audit });
  })().catch(next);
});
