import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { loadSiteConfig } from './config.js';
import { authRouter } from './routes/auth.js';
import { contentRouter } from './routes/content.js';
import { uploadsRouter } from './routes/uploads.js';

// Load environment from a local .env when present. Works on every Node version
// (the built-in process.loadEnvFile is 20.12+ only), no dependency. Host-provided
// env vars always win, so this never overrides a value set by the shell or PM2.
function loadDotEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return; // .env is optional
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

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
  app.use('/demo', express.static(path.resolve(process.cwd(), 'public/demo')));

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
