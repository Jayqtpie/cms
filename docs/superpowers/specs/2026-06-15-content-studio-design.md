# Content Studio — Design Spec
**Date:** 2026-06-15  
**Status:** Approved

---

## Overview

Content Studio is a lightweight, install-on-any-site CMS for static marketing sites. A non-technical client signs in to a branded admin dashboard, edits copy and photos through a form-based editor with a live split-screen preview, works on a draft, and publishes when happy. The live site reads published content and repaints itself.

The system is designed to be deployed once per client site, with a shared editor codebase and a per-client backend. Adding it to any new site is a matter of dropping in a config file, adding two script tags, and annotating editable HTML elements with `data-cms` attributes.

---

## Architecture

Three layers, each with one job:

```
┌─────────────────────────────────────────────────────────────────┐
│  cms-engine.js  (vanilla TS, ~10KB, no deps)                    │
│  Shipped to every client site. Discovers [data-cms] elements,   │
│  builds schema from the DOM, paints stored content onto the     │
│  live site, drives the preview iframe via postMessage.          │
└────────────────────────┬────────────────────────────────────────┘
                         │ postMessage (schema discovery + live updates)
┌────────────────────────▼────────────────────────────────────────┐
│  Editor SPA  (Vite + React, dist/admin/)                        │
│  Identical across all client deployments. Branded per client    │
│  via /api/config. Renders whatever schema the preview iframe    │
│  discovers — zero editor changes when fields are added/removed. │
└────────────────────────┬────────────────────────────────────────┘
                         │ fetch
┌────────────────────────▼────────────────────────────────────────┐
│  Express Server  (Node.js, one deploy per client on VPS)        │
│  Serves the engine bundle + editor SPA + API. Stores content    │
│  as JSON files on disk. Auth via bcrypt password + JWT.         │
└─────────────────────────────────────────────────────────────────┘
```

**Approach:** Single unified package in `website-cms/`. Vite produces two independent build outputs (engine + editor). Express serves both. One `npm run build`, one `npm start`, one PM2 process per client deployment.

---

## File Structure

```
website-cms/
  src/
    engine/                     # cms-engine.js — vanilla TS, no framework
      discovery.ts              # scans [data-cms] attrs → builds schema
      bind.ts                   # paints content values onto DOM elements
      store.ts                  # draft/published buckets + adapter wiring
      adapters/
        local.ts                # localStorage adapter (dev / zero-config)
        api.ts                  # fetch wrapper over Express API (production)
      index.ts                  # entry point; orchestrates on load
    editor/                     # React admin SPA
      App.tsx                   # shell, auth state, view routing
      components/
        Login.tsx               # branded left panel + sign-in form
        Topbar.tsx              # save state, undo, discard, publish, avatar
        Sidebar.tsx             # section list with unsaved-diff dots
        Editor.tsx              # field cards for active section
        Preview.tsx             # iframe + postMessage bridge
        fields/
          TextField.tsx         # single-line input
          RichField.tsx         # textarea with \n→<br> and *x*→<em>
          ImageField.tsx        # drag-drop zone → POST /api/uploads
          LinkField.tsx         # text + href pair
          ListField.tsx         # add / delete / drag-reorder repeater
    server/                     # Express API
      index.ts                  # server entry; mounts routes + static
      routes/
        content.ts              # GET/PUT/POST content endpoints
        auth.ts                 # login / logout
        uploads.ts              # multipart image → disk → URL
      middleware/
        auth.ts                 # JWT verify on all write routes
  data/                         # runtime content (gitignored)
    {siteId}/
      draft.json
      published.json
  dist/                         # built outputs (gitignored)
    cms-engine.js               # IIFE bundle, no external deps
    admin/                      # built editor SPA
  public/
    uploads/                    # uploaded images served as static files
      {siteId}/
  docs/
    superpowers/
      specs/
        2026-06-15-content-studio-design.md
  vite.engine.config.ts         # library build → dist/cms-engine.js
  vite.editor.config.ts         # SPA build → dist/admin/
  package.json
  tsconfig.json
  cms.site.json                 # per-client brand + siteId config (not .env)
  .env                          # CMS_PASSWORD (bcrypt), JWT_SECRET, PORT
  .env.example
```

---

## Per-Client Configuration

### `cms.site.json` (brand + site identity, not secret)

```json
{
  "siteId": "grooms-get-ready",
  "brand": {
    "name": "Grooms Get Ready",
    "eyebrow": "PERSONAL TRAINING",
    "headline": "Update your website in *minutes.*",
    "tagline": "One goal. Your best day.",
    "accent": "#c9a85f",
    "bg": "radial-gradient(120% 100% at 0% 0%, #2a2114 0%, #16120b 55%, #100d08 100%)",
    "logo": null
  }
}
```

Exposed publicly at `GET /api/config`. The editor SPA fetches this before rendering the login page. Changing this file re-brands the login screen for a new client — no code changes.

### `.env` (secrets)

```
CMS_PASSWORD=<bcrypt hash of team password>
JWT_SECRET=<random 64-char string>
PORT=4001
```

### `public/cms.config.js` (on the client site, not the CMS server)

```js
window.CMSConfig = {
  siteId: 'grooms-get-ready',
  backend: { type: 'api', base: 'https://cms.groomsgetready.co' },
  variants: [
    { id: 'default', label: 'Groom' },
    { id: 'bride',   label: 'Bride'  },
  ],
  groups: ['Hero', 'The Promise', 'Packages', 'FAQ', 'Contact', 'Footer'],
};
```

`variants` and `groups` are optional. With zero config beyond `siteId` and `backend`, the CMS still works — groups default to `data-cms-group` attribute values, labels default to humanised keys.

---

## Data Model

Content is a flat JSON object keyed by `data-cms` attribute values. Variant fields use `key@variantId` notation. Lists are stored as arrays.

```json
{
  "hero.headline": "Grooms Get Ready",
  "hero.headline@bride": "Brides Get Ready",
  "hero.image": "/uploads/grooms-get-ready/hero.jpg",
  "hero.ctaPrimary": "Begin Your Transformation",
  "faq": [
    { "q": "How far ahead should I start?", "a": "The earlier the better." },
    { "q": "Do I need gym experience?",     "a": "Not at all." }
  ]
}
```

Two files per site on the VPS:
- `data/{siteId}/draft.json` — working copy (editor autosave target)
- `data/{siteId}/published.json` — what the live site reads

No database. Content for a marketing site is typically under 100KB of JSON.

---

## API

### Public endpoints (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config` | Brand config + siteId for login page |
| `GET` | `/api/content?state=published` | Published content + meta. Cache-able. |

### Authenticated endpoints (Bearer JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/content?state=draft` | Draft content + meta |
| `PUT` | `/api/content/draft` | Autosave draft `{ content }` |
| `POST` | `/api/content/publish` | Copy draft → published, stamp timestamp |
| `POST` | `/api/content/discard` | Revert draft to published |
| `POST` | `/api/uploads` | Multipart image → `{ url }` |

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Verify bcrypt password → `{ token }` (30-day JWT) |
| `POST` | `/api/auth/logout` | Client-side token removal (server is stateless) |

### Static file serving

| Path | Serves |
|------|--------|
| `/cms/cms-engine.js` | Engine bundle |
| `/admin/*` | Editor SPA |
| `/uploads/*` | Uploaded images |

---

## Auth

- One bcrypt-hashed team password stored in `.env` as `CMS_PASSWORD`
- Login verifies the password, returns a signed JWT (`JWT_SECRET`, 30-day expiry)
- Editor stores JWT in `localStorage`, sends as `Authorization: Bearer <token>`
- All write routes run JWT middleware before touching content
- Published `GET` is public — the live site reads it with no credentials

---

## `cms-engine.js` — Discovery & Binding

### On-load sequence

1. Read `window.CMSConfig`
2. Scan DOM for `[data-cms]` and `[data-cms-list]` elements
3. Build schema: `{ key, type, label, group, variant, element, defaultContent }`
4. Detect mode:
   - `?cms=preview` → listen for `postMessage` updates from editor, repaint on each, report discovered schema back via `postMessage({ type: 'cms-schema', schema })`
   - Live site → fetch published content from API (or `localStorage` if `backend.type === 'local'`), paint DOM

### Field type attributes

| Attribute | Values | Purpose |
|-----------|--------|---------|
| `data-cms` | `"section.key"` | Unique field key |
| `data-cms-type` | `text` \| `rich` \| `image` \| `link` \| `boolean` \| `select` | Editor widget |
| `data-cms-label` | string | Human label in editor |
| `data-cms-group` | string | Sidebar section grouping |
| `data-cms-variant` | variant id | Marks this as a variant field |

### List type

```html
<div data-cms-list="faq" data-cms-label="FAQ items" data-cms-group="FAQ">
  <template data-cms-item>
    <div class="faq-item">
      <div class="faq-q" data-cms-field="q"></div>
      <div class="faq-a" data-cms-field="a" data-cms-type="rich"></div>
    </div>
  </template>
</div>
```

Engine clones `<template data-cms-item>` once per stored item and appends rendered items to the container. Stored as an array keyed by `data-cms-list` value.

### Backend adapter

Determined by `CMSConfig.backend.type` at init time:
- `local` — reads/writes `localStorage` (dev / zero-config)
- `api` — fetches from `CMSConfig.backend.base` (production)

Store interface is identical either way — only the adapter is swapped.

---

## React Admin Editor

### App state (`App.tsx`)

| State key | Type | Description |
|-----------|------|-------------|
| `auth` | `{ token, email } \| null` | Persisted to localStorage |
| `config` | `BrandConfig` | Fetched from `/api/config` |
| `schema` | `Field[]` | Received via postMessage from preview iframe |
| `content` | `Record<string, unknown>` | Working draft |
| `publishedSnap` | `Record<string, unknown>` | Snapshot for diff detection |
| `meta` | `{ lastSaved, lastPublished }` | Timestamps |
| `saveState` | `'idle' \| 'saving' \| 'saved' \| 'error'` | Topbar indicator |
| `activeSection` | `string` | Selected sidebar group |
| `mode` | `string` | Active variant id ('default', 'bride', etc.) |
| `device` | `'desktop' \| 'mobile'` | Preview frame toggle |
| `undoStack` | `snapshot[]` | Capped at 120 entries |
| `toast` | `{ message, type } \| null` | Bottom-center notification |
| `previewOpen` | `boolean` | Mobile slide-over state |

### Component responsibilities

**`Login.tsx`** — Two-column layout (1.05fr / 1fr, collapses below 900px). Left panel: branded background from `config.brand.bg`, client name, eyebrow, headline, tagline. Right panel: email + password form. On submit: `POST /api/auth/login`, store JWT, transition to dashboard.

**`Topbar.tsx`** — Fixed 60px. Left: "Content Studio" brandmark. Right: save-state indicator (spinner → "Saved · HH:MM"), Undo button, Discard, View Live link, status pill (Published & live / Unpublished changes / Not published yet), Publish button (disabled when `content === publishedSnap`), avatar/sign-out.

**`Sidebar.tsx`** — 244px. Section buttons derived from schema groups (or `CMSConfig.groups` order). Active: gold background `#f7efdd`. Amber dot on sections with draft ≠ published diff.

**`Editor.tsx`** — Centered column, max-width 720px. Header: section label + blurb. Field cards: white, 1px border, radius 9px, shadow. Each card: label row (+ Reset pill when value ≠ default), field component, optional hint. Variant sub-fields shown below primary with variant accent colour.

**`Preview.tsx`** — `<iframe src="{clientSiteUrl}?cms=preview">`. On `cms-ready` message: push full content + mode + scroll-to-section. On edit debounce (350ms): `postMessage` update. Mobile mode: 390px phone frame, `#16120b` bezel, radius 22px, hatched backdrop.

**`ListField.tsx`** — Renders items as expandable cards with add / delete / drag-reorder (HTML5 drag API). Each item expands its `data-cms-field` sub-fields inline using the appropriate field component per sub-field type.

### Interactions

- **Auto-save:** every edit debounces 350ms → `PUT /api/content/draft` → update `meta.lastSaved`
- **Live preview:** edits `postMessage` into iframe; iframe repaints with no reload
- **Undo:** Ctrl/Cmd+Z pops `undoStack`, restores content snapshot
- **Reset to default:** per-field pill restores value to schema default, flashes element in preview
- **Publish:** `POST /api/content/publish`, update `publishedSnap`, toast "Published — your changes are now live"
- **Discard:** `POST /api/content/discard`, revert draft, toast "Draft changes discarded"
- **Cross-tab:** live site listens for `storage` events and repaints if published content changes in another tab (local adapter only; not applicable to the API adapter)

---

## Design Tokens

Carried forward faithfully from the design handoff:

```
/* Surfaces */
--bg:        #eceef1
--panel:     #ffffff
--panel-2:   #f7f8fa
--line:      #e4e7ec
--line-2:    #eef1f4

/* Text */
--ink:       #1b1f24
--ink-2:     #3d444d
--muted:     #6e7480
--faint:     #9aa1ac

/* Accent (champagne gold) */
--accent:      #a87d2e
--accent-2:    #8a6620
--accent-soft: #f7efdd
--accent-line: #e7d6ac
--ink-dark:    #16120b

/* Status */
--ok:        #1f8a5b     --ok-soft:   #e4f3ec
--warn:      #9a6a12     --warn-soft: #f8efda
--danger:    #c0492f

/* Bride variant accent */
--bride:     #a85b7e

/* Shape */
radius-card: 9px
radius-ctrl: 7–8px
shadow:      0 1px 2px rgba(20,24,30,.05), 0 6px 18px -10px rgba(20,24,30,.18)
focus-ring:  0 0 0 3px var(--accent-soft)

/* Typography */
ui-font:     -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial
brand-font:  'Cormorant Garamond' (display), 'Jost' (eyebrows/labels)
```

---

## Build & Deployment

### npm scripts

```json
{
  "build:engine": "vite build --config vite.engine.config.ts",
  "build:editor": "vite build --config vite.editor.config.ts",
  "build":        "npm run build:engine && npm run build:editor",
  "dev:editor":   "vite --config vite.editor.config.ts",
  "start":        "node dist/server/index.js"
}
```

- `vite.engine.config.ts` — library mode, IIFE format, no external deps, output `dist/cms-engine.js`
- `vite.editor.config.ts` — standard SPA build, React bundled, output `dist/admin/`

### VPS deployment (per client)

```
1. Build locally: npm run build
2. Copy dist/ + cms.site.json + .env to server
3. Fill .env: CMS_PASSWORD (bcrypt hash), JWT_SECRET, PORT
4. Fill cms.site.json: brand + siteId
5. pm2 start dist/server/index.js --name cms-{siteId}
6. nginx: proxy /api, /admin, /cms, /uploads → PM2 port
```

One PM2 process per client site. `data/{siteId}/` created automatically on first save.

### Image storage

Images are uploaded to `public/uploads/{siteId}/` on the VPS and served as static files at `/uploads/{siteId}/filename.ext`. The image field stores the URL string, not base64 bytes — keeping content JSON small.

---

## Integration with Next.js Sites

Three steps, no build pipeline changes:

**1. Add `public/cms.config.js`**
```js
window.CMSConfig = {
  siteId: 'client-site-id',
  backend: { type: 'api', base: 'https://cms.clientdomain.com' },
  variants: [...],  // optional
  groups: [...],    // optional
};
```

**2. Load scripts in `app/layout.tsx`**
```tsx
import Script from 'next/script'

// inside <head> or at end of <body>
<Script src="/cms.config.js" strategy="beforeInteractive" />
<Script
  src="https://cms.clientdomain.com/cms/cms-engine.js"
  strategy="beforeInteractive"
/>
```

**3. Annotate editable elements**
```tsx
// Before
<h1>Grooms Get Ready</h1>

// After
<h1
  data-cms="hero.headline"
  data-cms-type="rich"
  data-cms-label="Headline"
  data-cms-group="Hero"
>
  Grooms Get Ready
</h1>
```

For lists, replace hard-coded JSX arrays with the `data-cms-list` + `<template>` pattern. The engine renders items; Next.js renders the surrounding shell.

If the CMS is unreachable, the element's existing content serves as the default — nothing breaks.

---

## `/cms` Skill

A Claude Code skill at `C:\Users\jay_p\.claude\skills\cms.md`, invoked with `/cms`.

When triggered in a Next.js site's working directory, it:

1. **Detects the site** — reads `package.json`, scans `app/` and `components/` structure
2. **Scaffolds `public/cms.config.js`** — fills `siteId` (derived from package name), `backend.base` (prompts for VPS URL), infers variants from site content if detectable
3. **Wires script tags** — adds the two `<Script>` tags to `app/layout.tsx`
4. **Annotates components** — scans each section component, identifies editable text/image elements, adds `data-cms`, `data-cms-type`, `data-cms-label`, `data-cms-group` attributes
5. **Converts lists** — identifies hard-coded repeating content (FAQs, testimonials, packages, etc.) and rewrites to `data-cms-list` + `<template>` pattern
6. **Outputs a checklist** — every field added, grouped by section, so you can verify before deploying

---

## Testing

| Layer | Tool | What |
|-------|------|------|
| Engine | Vitest + jsdom | Discovery, bind, adapter logic against fixture HTML |
| Server | Supertest | All API endpoints with temp `data/` directory |
| Editor | Playwright | Login → edit field → verify preview updates → publish → verify `/api/content?state=published` |

---

## Deliverables

1. `website-cms/` — the full CMS package (engine + editor + server)
2. `C:\Users\jay_p\.claude\skills\cms.md` — the `/cms` Claude Code skill
3. This spec document
