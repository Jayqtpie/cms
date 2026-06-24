import { Router } from 'express';
import type { Request } from 'express';
import { signToken, verifyPassword } from '../auth.js';
import { verifyTotp } from '../totp.js';
import { lockRemaining, recordFailure, recordSuccess } from '../login-limiter.js';
import { getSiteId } from '../config.js';
import { audit } from '../audit.js';

export const authRouter = Router();

// Throttle is keyed per client. Behind nginx, `trust proxy` (set in index.ts)
// makes req.ip the real client address rather than the loopback proxy.
function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

authRouter.post('/login', async (req, res) => {
  const { email, password, code } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    code?: string;
  };
  const hash = process.env.CMS_PASSWORD;
  if (!hash) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const key = clientKey(req);
  const siteId = await getSiteId().catch(() => 'unknown');
  const wait = lockRemaining(key);
  if (wait > 0) {
    const retryAfterSeconds = Math.ceil(wait / 1000);
    void audit(siteId, 'login.lockout', { ip: key });
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'too many attempts', retryAfterSeconds });
    return;
  }

  const passwordOk = !!password && (await verifyPassword(password, hash));
  // TOTP is optional: only enforced when CMS_TOTP_SECRET is configured.
  const totpSecret = process.env.CMS_TOTP_SECRET;
  const totpOk = !totpSecret || verifyTotp(totpSecret, code ?? '');

  if (!passwordOk || !totpOk) {
    recordFailure(key);
    void audit(siteId, 'login.failure', { ip: key });
    // Deliberately generic so a caller can't distinguish a bad password from a
    // bad/missing 2FA code.
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }

  recordSuccess(key);
  void audit(siteId, 'login.success', { ip: key, email: email || 'team' });
  res.json({ token: signToken({ email: email || 'team' }) });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
