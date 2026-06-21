// RFC 6238 TOTP verification with zero external dependencies (node:crypto only).
//
// Enabled per-site by setting CMS_TOTP_SECRET to a base32 secret. The same
// secret is loaded into the editor's authenticator app (Google Authenticator,
// 1Password, etc.). Standard parameters: SHA-1, 30-second step, 6 digits,
// ±1 step tolerance for clock drift.

import { createHmac, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const DRIFT_WINDOW = 1; // accept the previous/next step too

/** Decode an RFC 4648 base32 string (case-insensitive, padding/space tolerant). */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue; // skip spaces / invalid chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** HOTP value for a given counter, as a zero-padded DIGITS-length string. */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac('sha1', secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Whether `token` is a valid current code for the base32 `secret`. */
export function verifyTotp(secret: string, token: string, now: number = Date.now()): boolean {
  const code = (token || '').replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(code)) return false;
  const key = base32Decode(secret);
  if (key.length === 0) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let w = -DRIFT_WINDOW; w <= DRIFT_WINDOW; w++) {
    const c = counter + w;
    if (c < 0) continue; // no valid code for pre-epoch counters
    if (constantTimeEqual(hotp(key, c), code)) return true;
  }
  return false;
}
