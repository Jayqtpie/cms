import { expect, it } from 'vitest';
import { verifyTotp } from './totp.js';

// RFC 6238 reference vector: ASCII secret "12345678901234567890" (base32 below),
// SHA-1, 30s step. At Unix time 59s the 8-digit TOTP is 94287082, so the 6-digit
// code is 287082. Time is passed in ms.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

it('accepts the RFC 6238 reference code at t=59s', () => {
  expect(verifyTotp(SECRET, '287082', 59_000)).toBe(true);
});

it('rejects an incorrect code', () => {
  expect(verifyTotp(SECRET, '000000', 59_000)).toBe(false);
});

it('accepts a code that is one step early or late (clock drift)', () => {
  expect(verifyTotp(SECRET, '287082', 29_000)).toBe(true); // previous step
  expect(verifyTotp(SECRET, '287082', 89_000)).toBe(true); // next step
});

it('rejects a code more than one step away', () => {
  expect(verifyTotp(SECRET, '287082', 119_000)).toBe(false);
});

it('rejects malformed or empty input', () => {
  expect(verifyTotp(SECRET, '', 59_000)).toBe(false);
  expect(verifyTotp(SECRET, '12345', 59_000)).toBe(false);
  expect(verifyTotp(SECRET, 'abcdef', 59_000)).toBe(false);
  expect(verifyTotp('', '287082', 59_000)).toBe(false);
});

it('tolerates spaces in the entered code', () => {
  expect(verifyTotp(SECRET, '287 082', 59_000)).toBe(true);
});
