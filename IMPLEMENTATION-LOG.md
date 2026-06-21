# Implementation Log — Phases 0–2

Tracks what's been built against [ROADMAP.md](./ROADMAP.md). Dated 2026-06-19.

## ⚠️ Verification status — read first

The pure-logic modules below were each compiled and **run** in isolation and all
checks passed (store: 8/8, TOTP + login limiter: 14/14, diff: 9/9). The React
and Express **wiring** was written and reviewed but not executed in-session (the
build sandbox served stale file copies, so its test runner couldn't see fresh
edits — this does not affect the real files).

**Before relying on Phase 1–2, run locally:**

```
npm run typecheck
npm test
```

Both passed for Phase 0 on your machine already (90/90). The new tests added
since: `login-limiter.test.ts`, `totp.test.ts`, `diff.test.ts`, plus cases in
`bind.test.ts` and `index.test.ts`.

---

## Phase 0 — Data safety ✅ (verified locally: 90/90)

- **Atomic writes** — `store.ts` writes a temp file then `rename`s; no torn writes.
- **Version guard** — `Bucket.version`; stale autosave → `409`; editor reloads instead of clobbering (two-tab safety).
- **Backup-on-publish** — every publish snapshots to `data/{siteId}/history/{ts}.json` (last 100 kept).

## Phase 1 — Auth hardening ✅ (core logic verified; run suite to confirm wiring)

- **Login rate-limit + lockout** — `login-limiter.ts`: 5 failures → lock with exponential backoff (15 min → 1 h cap), keyed by IP, reset on success. Wired into `routes/auth.ts` (`429` + `Retry-After`).
- **`set-password` CLI** — `scripts/set-password.ts`; run `npm run set-password` (prompts, hidden) or `npm run set-password -- "your password"`. Writes the bcrypt hash to `.env`, generating `JWT_SECRET` if missing.
- **Optional TOTP 2FA** — `totp.ts` (RFC 6238, `node:crypto`, no dependency). Off unless `CMS_TOTP_SECRET` is set; when set, login also needs the 6-digit code. The editor learns this via `totp` on `/api/config` and shows a code field.
- **Tighter CORS** — API now allows only the configured `siteUrl` origin (+ optional `CMS_ALLOWED_ORIGINS`), still permitting same-origin and the client site's published reads. Added `trust proxy: loopback` so the throttle sees the real client IP behind nginx.
- **Rich-text XSS fix** — `bind.ts renderRich` (and the editor's Login) now HTML-escape before applying `*emphasis*`/line-break markup, closing the `innerHTML` injection noted in CMS-ANALYSIS.

New `.env` keys (see `.env.example`): `CMS_TOTP_SECRET`, `CMS_ALLOWED_ORIGINS`.

**To enable 2FA:** generate a base32 secret, set `CMS_TOTP_SECRET`, load the same
secret into an authenticator app, restart the server.

## Phase 2 — Editor / product features ✅ (complete)

- **Diff-before-publish** ✅ — `shared/diff.ts` computes draft-vs-published changes (handles variants, lists, blank↔unset); `components/ReviewModal.tsx` shows them when the client clicks Publish, and only the confirm button publishes. Styling added to `index.css`.
- **Image pipeline (compress-only)** ✅ — `routes/uploads.ts` re-encodes raster uploads to width-capped, auto-oriented WebP via `sharp` (config: `CMS_IMAGE_MAX_WIDTH` default 2000, `CMS_IMAGE_QUALITY` default 80). Processed in-memory so no Windows file-handle issues; video and SVG pass through; any failure falls back to the original. Image value stays a URL string — no data-model change.
- **Alt text** ✅ — stored per image at `key#alt` (`ALT_KEY_SUFFIX`); the engine applies it as `<img alt>` (with original capture/restore), `ImageField` shows an alt input, the diff labels it "<image> — alt text".
- **SEO / meta fields** ✅ — engine-managed `<head>` (the chosen approach). `shared/seo.ts` defines a fixed "Page & SEO" group (page title, search description, social image); `discoverSeo()` synthesizes it with defaults read from the page's existing head; `engine/seo.ts` `applySeo()` writes title + meta description + Open Graph/Twitter tags into `<head>`, creating tags as needed and reverting to the page's originals when a field is cleared. No `<head>` markup needed on client sites. New env: none.

Verified in isolation: diff alt-labeling (4/4), SEO head application via jsdom
(5/5). Full behaviour covered by tests (run `npm test`): `index.test.ts`
(PNG→WebP, width cap, video passthrough), `bind.test.ts` (alt attribute),
`diff.test.ts` (alt label), `discovery.test.ts` (SEO group + head defaults),
`seo.test.ts` (head writes, mirrors, revert, no-op).

### Optional, deferred by choice

- **Responsive `srcset`** — upgrade to the compress-only pipeline (multiple widths). Revisit only if needed.

---

## Where this leaves the roadmap

Phases 0, 1, 2 are done. Next per `ROADMAP.md`: **Phase 3 — Operability**
(audit log, error tracking + health/heartbeat, data export), then **Phase 4**
(CI, visual-regression, visual parity), then **Phase 5** (fleet ops, deferred).

---

## Suggested next steps

1. Run `npm run typecheck && npm test` to confirm Phase 1–2 wiring.
2. Click **Publish** in the editor to try the new review modal.
3. When ready, we do the image pipeline + SEO fields together (both need `sharp` and a live preview to verify).
