import { beforeEach, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyPassword, signToken, verifyToken } from './auth.js';

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
});

it('verifies a correct password and rejects a wrong one', async () => {
  const hash = bcrypt.hashSync('letmein', 10);
  expect(await verifyPassword('letmein', hash)).toBe(true);
  expect(await verifyPassword('nope', hash)).toBe(false);
});

it('round-trips a signed token', () => {
  const token = signToken({ email: 'team' });
  expect(verifyToken(token).email).toBe('team');
});

it('throws on a tampered token', () => {
  expect(() => verifyToken('not.a.jwt')).toThrow();
});

it('throws when JWT_SECRET is unset', () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    expect(() => signToken({ email: 'team' })).toThrow('JWT_SECRET environment variable is required');
  } finally {
    process.env.JWT_SECRET = saved;
  }
});
