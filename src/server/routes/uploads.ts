import { Router } from 'express';
import multer, { MulterError } from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import { getSiteId } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

// Raised when fileFilter rejects a non-media MIME — distinct from multer's own
// errors (e.g. a wrong field name also yields LIMIT_UNEXPECTED_FILE) so the
// handler can map them to different responses.
class UnsupportedTypeError extends Error {}

function maxBytes(): number {
  const raw = process.env.CMS_UPLOAD_MAX_MB;
  // Treat empty/blank/non-numeric as unset (Number('') === 0 would cap at 1 byte).
  const mb = raw && raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : 64;
  // Cap before multiplying so huge values can't overflow to Infinity (no limit).
  const capped = Math.min(mb, 100_000);
  return Math.max(1, Math.floor(capped * 1024 * 1024));
}

// Raster formats we re-encode to WebP. SVG (vector) and video are left as-is.
function isRasterImage(mime: string): boolean {
  return /^image\/(jpeg|png|webp|gif|tiff|avif)$/.test(mime);
}

function imageMaxWidth(): number {
  const n = Number(process.env.CMS_IMAGE_MAX_WIDTH);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

function imageQuality(): number {
  const n = Number(process.env.CMS_IMAGE_QUALITY);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 80;
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
      const ext = path.extname(file.originalname);
      // Strip the real extension (any case), then re-add it lowercased — so
      // "Big Photo.PNG" → "big-photo-<ts>.png", not "big-photo-png-<ts>.png".
      const stem = file.originalname.slice(0, file.originalname.length - ext.length);
      const base = stem.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      cb(null, `${base}-${Date.now()}${ext.toLowerCase()}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxBytes() },
    fileFilter: (_req, file, cb) => {
      if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
      else cb(new UnsupportedTypeError('unsupported file type'));
    },
  });
}

/**
 * Re-encode an uploaded raster image to an auto-oriented, width-capped WebP and
 * return the new filename. On any processing failure the original filename is
 * returned, so a quirk in one image can never lose an upload.
 */
async function toWebp(dir: string, filename: string, mime: string): Promise<string> {
  const base = path.basename(filename, path.extname(filename));
  const webpName = `${base}.webp`;
  const srcPath = path.join(dir, filename);
  const finalPath = path.join(dir, webpName);
  const tmpPath = path.join(dir, `${base}-${process.pid}-${Date.now()}.tmp.webp`);
  try {
    // Read the source fully into memory first so sharp never holds an open
    // handle on the file — otherwise removing the original fails on Windows
    // (EBUSY). Marketing images are small, so buffering is fine.
    const input = await fs.readFile(srcPath);
    const animated = mime === 'image/gif';
    let pipeline = sharp(input, { animated });
    if (!animated) pipeline = pipeline.rotate(); // honour EXIF orientation
    await pipeline
      .resize({ width: imageMaxWidth(), withoutEnlargement: true })
      .webp({ quality: imageQuality() })
      .toFile(tmpPath);
    await fs.rm(srcPath, { force: true }); // drop the original (also covers src === final)
    await fs.rename(tmpPath, finalPath);
    return webpName;
  } catch {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    return filename;
  }
}

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, (req, res, next) => {
  buildUpload().single('file')(req, res, (err: unknown) => {
    if (err instanceof UnsupportedTypeError) {
      res.status(400).json({ error: 'unsupported file type' });
      return;
    }
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file too large' });
        return;
      }
      // Any other multer error (e.g. wrong field name) is a malformed request.
      res.status(400).json({ error: 'upload error' });
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
      const dir = path.dirname(req.file.path);
      const filename = isRasterImage(req.file.mimetype)
        ? await toWebp(dir, req.file.filename, req.file.mimetype)
        : req.file.filename;
      res.json({ url: `/uploads/${siteId}/${filename}` });
    })().catch(next);
  });
});
