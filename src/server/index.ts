import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { loadSiteConfig } from './config.js';
import { authRouter } from './routes/auth.js';
import { contentRouter } from './routes/content.js';
import { uploadsRouter } from './routes/uploads.js';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/config', async (_req, res, next) => {
    try {
      res.json(await loadSiteConfig());
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/content', contentRouter);
  app.use('/api/uploads', uploadsRouter);

  const dist = path.resolve(process.cwd(), 'dist');
  app.use('/cms', express.static(path.join(dist, 'cms')));
  app.use('/admin', express.static(path.join(dist, 'admin')));
  app.use('/uploads', express.static(path.resolve(uploadDir())));
  app.use('/site', express.static(path.resolve(process.cwd(), 'tests/e2e/fixtures/site')));

  // JSON error handler so route `next(err)` paths don't leak an HTML stack trace.
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: 'internal server error' });
    },
  );

  return app;
}

function uploadDir(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

const PORT = Number(process.env.PORT) || 4001;

if (process.env.NODE_ENV !== 'test') {
  if (!process.env.JWT_SECRET || !process.env.CMS_PASSWORD) {
    throw new Error('JWT_SECRET and CMS_PASSWORD env vars are required');
  }
  createApp().listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Content Studio server listening on :${PORT}`);
  });
}
