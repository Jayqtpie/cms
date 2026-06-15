import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth.js';

export interface AuthedRequest extends Request {
  user?: { email: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'missing token' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
