import { Router } from 'express';
import { signToken, verifyPassword } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const hash = process.env.CMS_PASSWORD;
  if (!hash) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }
  if (!password || !(await verifyPassword(password, hash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({ token: signToken({ email: email || 'team' }) });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
