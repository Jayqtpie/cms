// Dependency-free, in-memory login throttle.
//
// One Content Studio server runs per client site with a single editor, so an
// in-process map is sufficient — there's no horizontal scaling that would need
// shared state. State resets on restart, which is acceptable for a brute-force
// guard (an attacker gains nothing from a restart they can't trigger).

interface Attempt {
  fails: number;
  lockedUntil: number; // epoch ms; 0 = not locked
  seen: number; // epoch ms of last activity, for pruning
}

const MAX_FAILS = 5; // consecutive failures allowed before locking
const LOCK_MS = 15 * 60 * 1000; // base lock window (15 min)
const MAX_LOCK_MS = 60 * 60 * 1000; // cap on exponential backoff (1 h)
const PRUNE_AFTER_MS = 60 * 60 * 1000; // forget keys idle longer than this
const MAX_KEYS = 10_000; // hard ceiling so the map can't grow unbounded

const attempts = new Map<string, Attempt>();

function prune(now: number): void {
  if (attempts.size < MAX_KEYS) {
    for (const [key, a] of attempts) {
      if (a.lockedUntil <= now && now - a.seen > PRUNE_AFTER_MS) attempts.delete(key);
    }
    return;
  }
  // Over the ceiling: drop everything that isn't currently locked.
  for (const [key, a] of attempts) {
    if (a.lockedUntil <= now) attempts.delete(key);
  }
}

/** Milliseconds remaining on a lock for this key, or 0 if it may attempt now. */
export function lockRemaining(key: string, now: number = Date.now()): number {
  const a = attempts.get(key);
  if (!a) return 0;
  return a.lockedUntil > now ? a.lockedUntil - now : 0;
}

/**
 * Record a failed login. Once failures reach MAX_FAILS the key is locked, with
 * the lock window doubling on each further failure (capped at MAX_LOCK_MS).
 */
export function recordFailure(key: string, now: number = Date.now()): void {
  prune(now);
  const a = attempts.get(key) ?? { fails: 0, lockedUntil: 0, seen: now };
  a.fails += 1;
  a.seen = now;
  if (a.fails >= MAX_FAILS) {
    const over = a.fails - MAX_FAILS; // 0, 1, 2, ...
    a.lockedUntil = now + Math.min(LOCK_MS * 2 ** over, MAX_LOCK_MS);
  }
  attempts.set(key, a);
}

/** Clear all state for a key after a successful login. */
export function recordSuccess(key: string): void {
  attempts.delete(key);
}

/** Test-only: wipe all throttle state. */
export function _resetLimiter(): void {
  attempts.clear();
}
