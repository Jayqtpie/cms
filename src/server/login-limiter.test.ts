import { afterEach, expect, it } from 'vitest';
import { lockRemaining, recordFailure, recordSuccess, _resetLimiter } from './login-limiter.js';

afterEach(() => _resetLimiter());

const T = 1_000_000;

it('does not lock before the 5th failure', () => {
  for (let i = 0; i < 4; i++) recordFailure('ip', T);
  expect(lockRemaining('ip', T)).toBe(0);
});

it('locks after 5 consecutive failures', () => {
  for (let i = 0; i < 5; i++) recordFailure('ip', T);
  expect(lockRemaining('ip', T)).toBeGreaterThan(0);
});

it('the lock clears once its window passes', () => {
  for (let i = 0; i < 5; i++) recordFailure('ip', T);
  const remaining = lockRemaining('ip', T);
  expect(lockRemaining('ip', T + remaining + 1)).toBe(0);
});

it('applies exponential backoff on further failures', () => {
  for (let i = 0; i < 5; i++) recordFailure('ip', T);
  const first = lockRemaining('ip', T);
  recordFailure('ip', T); // 6th
  expect(lockRemaining('ip', T)).toBe(first * 2);
});

it('a success clears the failure count and any lock', () => {
  for (let i = 0; i < 5; i++) recordFailure('ip', T);
  recordSuccess('ip');
  expect(lockRemaining('ip', T)).toBe(0);
});

it('tracks each key independently', () => {
  for (let i = 0; i < 5; i++) recordFailure('a', T);
  expect(lockRemaining('a', T)).toBeGreaterThan(0);
  expect(lockRemaining('b', T)).toBe(0);
});
