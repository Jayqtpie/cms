import { Router } from 'express';
import multer, { MulterError } from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSiteId } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

function maxBytes(): number {
  const mb = Number(process.env.CMS_UPLOAD_MAX_MB ?? 64);
  return Math.max(1, Math.floor((Number.isFinite(mb) ? mb : 64) * 1024 * 1024));
}

// Built per-request so env overrides (and the size cap) are read fresh.
function buildUpload() {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      getSiteId()
        .then(async (siteId) => {
          const dir = path.join(uploadRoot(), siteId);
          await fs.mkdir(dir, { recursive: true });
          cb(null, dir);
        })
        .catch((err) => cb(err as Error, ''));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path
        .basename(file.originalname, ext)
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase();
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxBytes() },
    fileFilter: (_req, file, cb) => {
      if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
      else cb(new MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    },
  });
}

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, (req, res, next) => {
  buildUpload().single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file too large' });
        return;
      }
      // LIMIT_UNEXPECTED_FILE here means the fileFilter rejected the MIME type.
      res.status(400).json({ error: 'unsupported file type' });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    (async () => {
      if (!req.file) {
        res.status(400).json({ error: 'no file' });
        return;
      }
      const siteId = await getSiteId();
      res.json({ url: `/uploads/${siteId}/${req.file.filename}` });
    })().catch(next);
  });
});
