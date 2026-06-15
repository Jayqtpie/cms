import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSiteId } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

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

const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, upload.single('file'), (req, res, next) => {
  (async () => {
    if (!req.file) {
      res.status(400).json({ error: 'no file' });
      return;
    }
    const siteId = await getSiteId();
    res.json({ url: `/uploads/${siteId}/${req.file.filename}` });
  })().catch(next);
});
