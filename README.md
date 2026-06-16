# Content Studio

A lightweight, install-on-any-site CMS for static marketing sites. A non-technical client signs in to a branded dashboard, edits copy, photos and video through a form-based editor with a live split-screen preview, works on a draft, and hits **Publish** when happy. The live site then reads the published content and repaints itself.

One shared codebase, deployed once per client. Adding the CMS to a new site is: drop in a config file, add two script tags, and mark editable elements with `data-cms` attributes (the `/cms` skill automates this).

---

## How it works

Three layers, each with one job:

- **`cms-engine.js`** (`src/engine`, vanilla TS → IIFE bundle, no deps) ships to the client's site. It scans the DOM for `[data-cms]` / `[data-cms-list]` elements, builds a schema, and either paints published content onto the live page or — in `?cms=preview` mode inside the editor's iframe — repaints live as the client types. A "sticky binder" re-applies content after framework hydration so the draft never gets clobbered.
- **Editor SPA** (`src/editor`, React + Vite → `dist/admin`) is identical across all clients. It renders whatever schema the preview iframe reports, so adding a field on any site needs **zero editor changes**. It's branded per client from `cms.site.json`.
- **Express server** (`src/server` → `dist/server`) serves the engine + editor + a JSON API, stores content as JSON files on disk (`data/{siteId}/draft.json` + `published.json`), and guards writes with a bcrypt password + JWT. Published reads are public.

```
client website  ──loads──▶  /cms/cms-engine.js  ──paints──▶  published content
      │                                                            ▲
      │ (editor preview iframe, ?cms=preview)                      │ GET /api/content?state=published
      ▼                                                            │
  Editor SPA  ──fetch /api──▶  Express server  ──reads/writes──▶  data/{siteId}/*.json
```

## Project layout

```
src/
  engine/      cms-engine.js — discovery, binding, adapters, flash
  editor/      React admin SPA (App, components, fields, theme)
  server/      Express API (auth, content, uploads, config, static)
  shared/      types shared by engine + editor
public/demo/   self-contained demo site for local testing
cms.site.json  per-client brand + siteId + siteUrl
DEPLOY.md      per-client VPS deployment guide
CMS-ANALYSIS.md  design/architecture review notes
```

## Local development

Two terminals from the project root:

```bash
npm install
npm run dev:server     # API on http://localhost:4001 (auto-loads .env)
npm run dev:editor     # editor on http://localhost:5173/admin/ (hot reload, proxies /api → 4001)
```

Open **http://localhost:5173/admin/** — that's the live editor. (`:4001/admin` serves the *built* editor and is only refreshed by `npm run build`.)

First run needs a `.env` (the server won't start without it):

```bash
cp .env.example .env
# CMS_PASSWORD — bcrypt hash of your login password:
node -e "console.log(require('bcryptjs').hashSync('studio-dev',10))"
# JWT_SECRET — random string:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Try it with the bundled demo

There's a full demo site so you can see everything load without wiring a real website:

```bash
npm run build:engine                       # builds /cms/cms-engine.js (the demo loads it)
echo "CMS_SITE_CONFIG=cms.site.demo.json" >> .env   # point the server at the demo
# restart dev:server, then open :5173/admin and sign in
```

The demo exercises every field type, Groom/Bride variants, lists, image uploads, and the live preview. Remove the `CMS_SITE_CONFIG` line to go back to the default `cms.site.json`.

## npm scripts

| Script | Does |
|--------|------|
| `dev:server` | Run the API with hot reload (`tsx watch`). |
| `dev:editor` | Run the editor with hot reload (Vite), proxying the API. |
| `build` | Build engine + editor + server into `dist/`. |
| `build:engine` / `build:editor` / `build:server` | Build one layer. |
| `start` | Run the built server (`node dist/server/index.js`). |
| `typecheck` | `tsc --noEmit`. |
| `test` / `test:watch` | Vitest unit/integration tests. |
| `test:e2e` | Playwright end-to-end. |

## Configuration

**`cms.site.json`** — per-client identity and branding (`siteId`, `siteUrl`, and a `brand` block: `name`, `eyebrow`, `headline`, `tagline`, `accent`, `bg`, `logo`). Served publicly at `GET /api/config`; the editor reads it before login. Point the server at a different file with the `CMS_SITE_CONFIG` env var.

**`.env`** — `CMS_PASSWORD` (bcrypt hash), `JWT_SECRET`, `PORT` (default 4001). Optional: `CMS_SITE_CONFIG`, `CMS_DATA_DIR`, `CMS_UPLOAD_DIR`. Gitignored — never commit it.

**Client-site `cms.config.js`** (written by the `/cms` skill, lives on the client's site): `siteId`, `backend: { type: 'api', base }`, optional `variants`, `groups` (sidebar order), `groupIcons`.

## Adding the CMS to a website

In the client's repo, run the **`/cms`** skill (Claude Code). It scaffolds `cms.config.js`, adds the engine script tags, annotates editable elements with `data-cms*`, converts repeating content to the list pattern, and writes a `CMS-FIELDS.md` manifest. Then deploy the client site normally.

See **[DEPLOY.md](./DEPLOY.md)** for the full per-client VPS deployment (build, secrets, pm2, nginx, HTTPS).

## Data & content model

Content is a flat JSON object keyed by the `data-cms` value, with `key@variant` for variant copy (e.g. `hero.headline@bride`) and arrays for lists. Two files per site: `draft.json` (editor autosave target) and `published.json` (what the live site reads). No database — a marketing site's content is well under 100 KB of JSON.

## Security notes

- One bcrypt-hashed password per site → 30-day JWT; all write routes require it, published reads are public.
- The server refuses to start without `JWT_SECRET` and `CMS_PASSWORD`.
- Serve over HTTPS in production (client sites are HTTPS; mixed content is blocked otherwise).
- Rich text uses a safe mini-markup (`*emphasis*`, line breaks). If you ever allow raw HTML, sanitise it first.

## Testing

`npm test` runs the Vitest suite (engine discovery/binding/flash, server API via Supertest, editor components, theme). `npm run test:e2e` runs the Playwright login → edit → preview → publish flow.
