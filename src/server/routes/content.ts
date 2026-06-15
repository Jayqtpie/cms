import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getSiteId } from '../config.js';
import { discard, getContent, publish, saveDraft } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
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
    const { content } = (req.body ?? {}) as { content?: Content };
    if (typeof content !== 'object' || content === null) {
      res.status(400).json({ error: 'content required' });
      return;
    }
    res.json(await saveDraft(await getSiteId(), content));
  }),
);

contentRouter.post(
  '/publish',
  requireAuth,
  wrap(async (_req, res) => {
    res.json(await publish(await getSiteId()));
  }),
);

contentRouter.post(
  '/discard',
  requireAuth,
  wrap(async (_req, res) => {
    res.json(await discard(await getSiteId()));
  }),
);
