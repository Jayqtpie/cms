# Content Studio — Commercial Roadmap

**Date:** 2026-06-18
**Goal:** Get the CMS from working prototype to something you can sell and run across many paying clients.
**Companion docs:** [CMS-ANALYSIS.md](./CMS-ANALYSIS.md) (architecture review + visual-parity backlog), [README.md](./README.md), [DEPLOY.md](./DEPLOY.md).

---

## Deployment model (the assumption everything below is built on)

One **self-contained install per client**, running on the **client's own VPS/host**, attached to their site, edited by **one person**. This is a self-hosted product (like Ghost or self-hosted Plausible), *not* a centralized multi-tenant SaaS.

Three decisions fall out of this and shape the whole plan:

- **Stay flat-file, no database.** A marketing site's content is well under 100 KB of JSON. A DB adds ops burden to every client box for no benefit. Audit log → append-only JSONL; backups → git/tar; everything keys off `siteId`.
- **Keep auth local and single-user.** One editor per client means one password is the right model — just hardened. No per-user accounts, no hosted auth provider (see "Explicitly out of scope").
- **"Scale" is a fleet problem, not an architecture problem.** Growth pain is deploying/monitoring/backing-up N independent boxes, not request routing. That's tooling, and it's deferrable (Phase 5).

---

## Sequencing principle

Order by **risk to a paying client first, then value, then polish, then scale**:

1. Don't lose their content (data safety).
2. Don't let it get broken into (auth hardening).
3. Give them what they're paying for (editor/product features).
4. Know when something's wrong in the field (operability).
5. Stop regressions and ship the look (hygiene + visual parity).
6. Make running 30 boxes bearable (fleet ops — deferred).

Effort is in **dev-days for one experienced full-stack dev**. Phases 0–4 are the launch line; Phase 5 comes after you have enough clients to justify it.

---

## Phase 0 — Data safety  ·  ~1.5 days

The current store is the single biggest correctness risk: `src/server/store.ts` does read-modify-write to one `draft.json` with a non-atomic `fs.writeFile`, and autosave is last-writer-wins with no version check.

| # | Item | Touches | Effort | Done when |
|---|------|---------|--------|-----------|
| 0.1 | **Atomic writes** | `store.ts` `write()` → write temp file + `fs.rename` | 0.5d | A crash/kill mid-write never leaves a truncated or empty JSON file. |
| 0.2 | **Version guard** | `store.ts`, `routes/content.ts` PUT `/draft`, editor `api.ts` autosave | 0.5d | Each bucket carries a `version`; a stale autosave PUT gets `409`, editor reloads instead of clobbering. Protects against two open tabs / autosave racing publish. |
| 0.3 | **Backup-on-publish** | `store.ts` `publish()` + a small `backup` helper | 0.5d | Every publish snapshots `published.json` to `data/{siteId}/history/{timestamp}.json`; doubles as the rollback store for item 2.3. |

**Why first:** lowest effort on the list, highest reduction in "we lost a client's site" risk, and every later feature writes through this layer.

---

## Phase 1 — Auth hardening  ·  ~2.5 days

Auth today (`src/server/auth.ts`, `routes/auth.ts`) is a single bcrypt password → 30-day JWT with no brute-force protection. Keep the model, close the gaps.

| # | Item | Touches | Effort | Done when |
|---|------|---------|--------|-----------|
| 1.1 | **Login rate-limit + lockout** | `routes/auth.ts` (in-memory attempt counter keyed by IP, no dep needed) | 0.5d | N failed attempts → temporary lockout with backoff; logged to the audit trail (3.1). |
| 1.2 | **`set-password` CLI** | new `scripts/set-password.ts`, npm script | 0.25d | `npm run set-password` writes the bcrypt hash to `.env` — no more hand-running `bcryptjs` over SSH. Removes you from the reset loop. |
| 1.3 | **Optional TOTP 2FA** | `auth.ts`, `routes/auth.ts`, `Login.tsx`; `otplib` | 1–1.5d | If a `CMS_TOTP_SECRET` is set, login also requires a 6-digit code. Real second factor, zero external dependency. Off by default. |
| 1.4 | **Tighten CORS** | `src/server/index.ts` (`cors()` is currently fully open) | 0.25d | API allows only the configured `siteUrl` origin. |

**Note:** upload MIME filtering — flagged in CMS-ANALYSIS — is **already implemented** in `uploads.ts` (`fileFilter` accepts only `image/*` and `video/*`). The remaining hardening item from that doc, **escaping rich text before `innerHTML`** in `engine/bind.ts`, belongs here too (~0.5d).

---

## Phase 2 — Editor / product features  ·  ~6–10 days

What clients actually pay for. Can run in parallel with the visual-parity port (Phase 4 / CMS-ANALYSIS P1) since it's mostly server + new fields.

| # | Item | Touches | Effort | Done when |
|---|------|---------|--------|-----------|
| 2.1 | **Image pipeline + alt text** | `routes/uploads.ts` (`sharp`), `ImageField.tsx`, `engine/bind.ts` (emit `srcset`/`sizes`), `types.ts` (alt co-field) | 2–4d | Uploads are resized/compressed to WebP at a few widths; engine paints responsive `srcset`; every image has an editable `alt`. A 6 MB phone photo no longer ships at full size. |
| 2.2 | **SEO / meta field group** | `engine/discovery.ts` + `bind.ts` (bind `<title>`/`<meta>`/OG into `<head>`), editor renders a "Page settings" group | 2–3d | Client can edit page title, meta description, and OG image; engine writes them into the document head. |
| 2.3 | **Diff-before-publish** | `routes/content.ts` (diff draft vs published — both buckets already stored), new editor "Review changes" view | 2–3d | Before publishing, the client sees a field-level list of what will change (incl. variants/lists). One-click rollback uses the Phase 0.3 history. |

---

## Phase 3 — Operability  ·  ~2–3.5 days

You can't babysit boxes you can't see. This is what keeps support cost down at scale.

| # | Item | Touches | Effort | Done when |
|---|------|---------|--------|-----------|
| 3.1 | **Audit log** | new `store.ts` append helper → `data/{siteId}/audit.jsonl`; hook login/save/publish/discard | 0.5–1d | Every auth + write event is appended with timestamp. Answers "who changed the site and when". Viewer UI optional (+1d). |
| 3.2 | **Error tracking + health + heartbeat** | `src/server/index.ts` (`/healthz` route, Sentry SDK, optional outbound heartbeat) | 1–2d | Server errors report to Sentry; `/healthz` returns status; each install can POST a heartbeat to a URL you own (foundation for the Phase 5 dashboard). You learn a site is down before the client emails. |
| 3.3 | **Data export** | new authed `GET /api/export` streaming the site's buckets + uploads manifest | 0.25–0.5d | Client can one-click download all their content as JSON. Lowers switching anxiety at signup; keeps you clear of data-ownership disputes. |

---

## Phase 4 — Hygiene + ship the look  ·  ~6–8 days

Lock quality in, then close the visual gap that was the original complaint.

| # | Item | Touches | Effort | Done when |
|---|------|---------|--------|-----------|
| 4.1 | **CI** | `.github/workflows/ci.yml` | 0.5d | Clean-Linux `npm ci` + typecheck + `vitest` + build run on every push. Catches the Windows/Rollup-binary issue noted in CMS-ANALYSIS. |
| 4.2 | **Visual-regression tests** | Playwright `toHaveScreenshot` over editor screens | 1d | Editor UI is snapshot-tested so the design can't silently drift again. |
| 4.3 | **Visual + interaction parity** | `src/editor/*` — port per CMS-ANALYSIS **P1/P2** (fonts, icons, topbar, sidebar, login, ImageField drop zone, preview toolbar + device toggle, variant card) | 4–6d | Editor matches the reference design; locked by 4.2. Mostly a disciplined CSS/component port, not new design. |

> This phase is a **prerequisite for the first paying client** — the product has to look right. It runs on the editor codebase, so it can proceed in parallel with Phases 2–3 (server work).

---

## Phase 5 — Fleet operations  ·  ~1–2 weeks  ·  DEFERRED

Only worth building once manual per-box management actually hurts (~10–20+ clients).

- **Provisioning + deploy automation** — script or Ansible to stand up / update a client box (build, secrets, PM2, nginx, HTTPS) repeatably instead of by hand per DEPLOY.md.
- **Central monitoring dashboard** — collects the Phase 3.2 heartbeats; one screen showing every install's status, version, and last publish.
- **Centralized backups** — pull/verify each box's `data/` dir offsite on a schedule; test restores.

---

## Explicitly out of scope (decisions, with rationale)

| Considered | Decision | Why |
|------------|----------|-----|
| Per-user accounts + roles | **Dropped** | One editor per client; accountability/revocation needs don't exist. Single hardened password fits. |
| Hosted auth provider (Auth0/Clerk/Supabase) | **Dropped** | Per-tenant cost/provisioning across many single-user self-hosted boxes; adds an external network dependency and a cross-client single point of failure; contradicts the "lives entirely on their host" pitch. |
| Multi-tenant request routing | **Reframed → Phase 5 fleet ops** | Each install is already physically isolated; there's nothing to route. The real problem is operating many boxes, which is tooling. |
| Database | **Dropped** | Content is tiny; flat JSON + JSONL covers content, history, and audit. |
| Variants → i18n / locales | **Parking lot** | The `@variant` mechanism (`hero.headline@bride`) generalizes to locales cheaply, but no client has asked. Revisit on demand. |

---

## Summary

| Phase | Theme | Effort | Launch-blocking? |
|-------|-------|--------|------------------|
| 0 | Data safety | ~1.5d | Yes |
| 1 | Auth hardening | ~2.5d | Yes |
| 2 | Editor / product features | ~6–10d | Yes (2.1, 2.3); 2.2 strongly recommended |
| 3 | Operability | ~2–3.5d | 3.2 yes; 3.1/3.3 soon-after OK |
| 4 | Hygiene + visual parity | ~6–8d | Yes (visual parity) |
| 5 | Fleet ops | ~1–2wk | No — deferred |

**Launch line (Phases 0–4):** ~18–25 dev-days ≈ **4–5 focused weeks** solo, with the Phase 4 editor work parallelizing against the Phase 2–3 server work. Phase 5 comes later.

**Suggested first build:** Phase 0 — it's a day and a half, removes the worst risk, and everything else writes through it.
