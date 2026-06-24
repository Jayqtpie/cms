import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getSiteId } from '../config.js';
import { discard, getContent, publish, saveDraft, VersionConflictError } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../audit.js';
import type { Content } from '../../shared/types.js';

export const contentRouter = Router();

// Express 4 does not catch rejected async handlers; wrap so errors reach next().
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

// GET /api/content?state=published|draft  (draft requires auth)
contentRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  if (req.query.state === 'draft') {
    requireAuth(req, res, () => {
      (async () => {
        res.json(await getContent(await getSiteId(), 'draft'));
      })().catch(next);
    });
    return;
  }
  (async () => {
    res.json(await getContent(await getSiteId(), 'published'));
  })().catch(next);
});

contentRouter.put(
  '/draft',
  requireAuth,
  wrap(async (req, res) => {
    const { content, version } = (req.body ?? {}) as { content?: Content; version?: number };
    if (typeof content !== 'object' || content === null) {
      res.status(400).json({ error: 'content required' });
      return;
    }
    try {
      res.json(await saveDraft(await getSiteId(), content, version));
    } catch (err) {
      if (err instanceof VersionConflictError) {
        // 409 carries the server's current draft so the editor can reconcile.
        res.status(409).json({ error: 'version conflict', current: err.current });
        return;
      }
      throw err;
    }
  }),
);

contentRouter.post(
  '/publish',
  requireAuth,
  wrap(async (_req, res) => {
    const siteId = await getSiteId();
    const bucket = await publish(siteId);
    void audit(siteId, 'publish', { version: bucket.version });
    res.json(bucket);
  }),
);

contentRouter.post(
  '/discard',
  requireAuth,
  wrap(async (_req, res) => {
    const siteId = await getSiteId();
    const bucket = await discard(siteId);
    void audit(siteId, 'discard');
    res.json(bucket);
  }),
);
