import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from './index.js';
import { resetConfigCache } from './config.js';
import { _resetLimiter } from './login-limiter.js';

// Disable libvips file caching so sharp never holds a handle that blocks the
// temp-dir cleanup on Windows.
sharp.cache(false);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-api-'));
  process.env.NODE_ENV = 'test';
  process.env.CMS_DATA_DIR = dir;
  process.env.CMS_UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.CMS_SITE_CONFIG = path.resolve(process.cwd(), 'cms.site.test.json');
  process.env.JWT_SECRET = 'test-secret';
  process.env.CMS_PASSWORD = bcrypt.hashSync('letmein', 10);
  delete process.env.CMS_TOTP_SECRET;
  _resetLimiter(); // isolate the in-memory login throttle between tests
  resetConfigCache();
});
afterEach(async () => {
  delete process.env.CMS_UPLOAD_MAX_MB;
  delete process.env.CMS_IMAGE_MAX_WIDTH;
  delete process.env.CMS_IMAGE_QUALITY;
  await fs.rm(dir, { recursive: true, force: true });
});

async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ password: 'letmein' });
  return res.body.token as string;
}

it('GET /api/config returns brand config (public)', async () => {
  const res = await request(createApp()).get('/api/config');
  expect(res.status).toBe(200);
  expect(res.body.siteId).toBe('test-site');
});

it('rejects login with a wrong password', async () => {
  const res = await request(createApp()).post('/api/auth/login').send({ password: 'wrong' });
  expect(res.status).toBe(401);
});

it('locks out after repeated failed logins (429 with Retry-After)', async () => {
  const app = createApp();
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/auth/login').send({ password: 'wrong' });
  }
  // Even the correct password is now refused until the lock expires.
  const res = await request(app).post('/api/auth/login').send({ password: 'letmein' });
  expect(res.status).toBe(429);
  expect(res.headers['retry-after']).toBeDefined();
});

it('requires a 2FA code when CMS_TOTP_SECRET is configured', async () => {
  process.env.CMS_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const app = createApp();
  const res = await request(app).post('/api/auth/login').send({ password: 'letmein' });
  expect(res.status).toBe(401); // password alone is not enough
  const cfg = await request(app).get('/api/config');
  expect(cfg.body.totp).toBe(true); // editor is told to prompt for the code
});

it('blocks draft save without a token', async () => {
  const res = await request(createApp()).put('/api/content/draft').send({ content: {} });
  expect(res.status).toBe(401);
});

it('saves a draft, publishes, and serves published content publicly', async () => {
  const app = createApp();
  const token = await login(app);

  const save = await request(app)
    .put('/api/content/draft')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: { 'hero.headline': 'Hi there' } });
  expect(save.status).toBe(200);

  // published is still empty before publish
  const before = await request(app).get('/api/content?state=published');
  expect(before.body.content).toEqual({});

  const pub = await request(app)
    .post('/api/content/publish')
    .set('Authorization', `Bearer ${token}`);
  expect(pub.status).toBe(200);

  const after = await request(app).get('/api/content?state=published');
  expect(after.body.content['hero.headline']).toBe('Hi there');
});

it('discard reverts draft to published', async () => {
  const app = createApp();
  const token = await login(app);
  const auth = { Authorization: `Bearer ${token}` };

  await request(app).put('/api/content/draft').set(auth).send({ content: { a: 1 } });
  await request(app).post('/api/content/publish').set(auth);
  await request(app).put('/api/content/draft').set(auth).send({ content: { a: 2 } });

  const res = await request(app).post('/api/content/discard').set(auth);
  expect(res.body.content).toEqual({ a: 1 });
});

it('uploads a file (auth required) and returns a sanitized url', async () => {
  const app = createApp();

  const noauth = await request(app)
    .post('/api/uploads')
    .attach('file', Buffer.from('fake-image-bytes'), 'pic.png');
  expect(noauth.status).toBe(401);

  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('fake-image-bytes'), 'My Pic.png');
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/^\/uploads\/test-site\/my-pic-\d+\.png$/);
});

it('uploads a video under the size limit', async () => {
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('fake-mp4-bytes'), { filename: 'hero.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/^\/uploads\/test-site\/hero-\d+\.mp4$/);
});

it('rejects a non-media upload with 400', async () => {
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
  expect(res.status).toBe(400);
});

it('rejects an upload over the configured size limit with 413', async () => {
  process.env.CMS_UPLOAD_MAX_MB = '0.0005'; // ~524 bytes
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.alloc(4000), { filename: 'big.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(413);
});

it('treats a blank CMS_UPLOAD_MAX_MB as the default, not a 1-byte cap', async () => {
  process.env.CMS_UPLOAD_MAX_MB = '';
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.alloc(4000), { filename: 'ok.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(200);
});

it('re-encodes an uploaded image to optimized webp', async () => {
  const app = createApp();
  const token = await login(app);
  const png = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .png()
    .toBuffer();
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', png, { filename: 'Big Photo.PNG', contentType: 'image/png' });
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/^\/uploads\/test-site\/big-photo-\d+\.webp$/);
  const fp = path.join(dir, 'uploads', 'test-site', path.basename(res.body.url));
  expect((await sharp(await fs.readFile(fp)).metadata()).format).toBe('webp');
});

it('caps a very wide image to CMS_IMAGE_MAX_WIDTH', async () => {
  process.env.CMS_IMAGE_MAX_WIDTH = '300';
  const app = createApp();
  const token = await login(app);
  const png = await sharp({
    create: { width: 1000, height: 500, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', png, { filename: 'wide.png', contentType: 'image/png' });
  expect(res.status).toBe(200);
  const fp = path.join(dir, 'uploads', 'test-site', path.basename(res.body.url));
  expect((await sharp(await fs.readFile(fp)).metadata()).width).toBe(300);
});

it('leaves a video upload unprocessed', async () => {
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('not-a-real-mp4'), { filename: 'clip.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/^\/uploads\/test-site\/clip-\d+\.mp4$/);
});

it('GET /healthz reports ok with a version (public)', async () => {
  const res = await request(createApp()).get('/healthz');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(typeof res.body.version).toBe('string');
  expect(res.body.version).not.toBe('');
});

it('exports draft, published and an uploads/audit manifest (auth required)', async () => {
  const app = createApp();

  const noauth = await request(app).get('/api/export');
  expect(noauth.status).toBe(401);

  const token = await login(app);
  const auth = { Authorization: `Bearer ${token}` };
  await request(app).put('/api/content/draft').set(auth).send({ content: { 'hero.headline': 'Hi' } });
  await request(app).post('/api/content/publish').set(auth);

  const res = await request(app).get('/api/export').set(auth);
  expect(res.status).toBe(200);
  expect(res.headers['content-disposition']).toMatch(
    /attachment; filename="test-site-export-\d+\.json"/,
  );
  expect(res.body.siteId).toBe('test-site');
  expect(res.body.published.content['hero.headline']).toBe('Hi');
  expect(Array.isArray(res.body.uploads)).toBe(true);
  expect(Array.isArray(res.body.audit)).toBe(true);
});
