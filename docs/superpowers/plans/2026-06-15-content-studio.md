# Content Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single install-on-any-site CMS package (`website-cms/`) — a vanilla-TS engine that paints stored content onto a live marketing site, a React admin editor with live split-screen preview, and an Express server that stores content as JSON on disk — plus a `/cms` Claude Code skill that wires the CMS into Next.js sites.

**Architecture:** Three layers in one npm package. `cms-engine.js` (IIFE bundle, no deps) discovers `[data-cms]` elements, builds a schema from the DOM, and either paints published content on the live site or drives a preview iframe via `postMessage`. The React editor SPA renders whatever schema the preview iframe reports and talks to the server over `fetch`. The Express server serves the engine bundle + editor SPA + a JSON API guarded by bcrypt-password / JWT auth. Built in strict dependency order: Server → Engine → Editor → Skill → E2E.

**Tech Stack:** TypeScript 5, Vite 5 (two configs: engine library build + editor SPA build), Express 4, React 18, `jsonwebtoken`, `bcryptjs`, `multer`. Tests: Vitest + jsdom (engine/editor units), Supertest (server API), Playwright (E2E).

---

## Decisions & Spec Gaps Resolved

These are small gaps in the spec that this plan fills with explicit choices. They are deviations worth knowing before execution:

1. **`build:server` script + `tsconfig.server.json`.** The spec's `start` runs `node dist/server/index.js` but lists no server build step. This plan compiles the server with `tsc` into `dist/server/` and adds `build:server` to the `build` chain. Dev uses `tsx watch`.
2. **ESM throughout.** `package.json` sets `"type": "module"`; the server tsconfig uses `moduleResolution: "NodeNext"`, so **relative imports in server/engine/shared code carry a `.js` extension** (e.g. `import { x } from './store.js'`). This is correct for Node ESM even though the source is `.ts`.
3. **Engine bundle path.** The spec shows `dist/cms-engine.js` served at `/cms/cms-engine.js`. To serve it cleanly via `express.static`, the engine build outputs to `dist/cms/cms-engine.js` and the server mounts `dist/cms` at `/cms`.
4. **`siteUrl` added to `cms.site.json`.** The editor's `Preview` iframe must load the client site (`<iframe src="{siteUrl}?cms=preview">`). The spec's `cms.site.json` has no such field, so this plan adds a top-level `siteUrl`. Also surfaced via `GET /api/config`.
5. **`SITE_ID` derives from `cms.site.json`.** The server reads `siteId` from the loaded site config (cached) rather than from `.env`.
6. **React 18 for the editor** (not the repo's React 19). This is a standalone Vite SPA, not a Next.js app; React 18.3 is the stable, best-supported pairing for Vite + Testing Library + Playwright here.

---

## File Structure

```
website-cms/
  package.json                  # ESM; deps + scripts (build:engine/editor/server)
  tsconfig.json                 # base config (shared, strict)
  tsconfig.server.json          # server build → dist/server (NodeNext)
  vite.engine.config.ts         # library/IIFE build → dist/cms/cms-engine.js
  vite.editor.config.ts         # React SPA build → dist/admin
  vitest.config.ts              # node default; jsdom via per-file docblock
  playwright.config.ts          # E2E config (Phase 5)
  index.html                    # editor SPA HTML entry (Vite root)
  cms.site.json                 # per-client brand + siteId + siteUrl (committed sample)
  cms.site.test.json            # fixture site config for tests
  .env.example                  # CMS_PASSWORD / JWT_SECRET / PORT
  .gitignore                    # data/ dist/ node_modules/ public/uploads/ .env
  src/
    shared/
      types.ts                  # Field, Content, ContentMeta, BrandConfig (engine+editor)
    server/
      index.ts                  # createApp(); mounts routes + static; listen()
      config.ts                 # load + cache cms.site.json
      store.ts                  # draft/published JSON file read/write/publish/discard
      auth.ts                   # bcrypt verify + JWT sign/verify
      middleware/auth.ts        # requireAuth (Bearer JWT)
      routes/auth.ts            # POST /login, /logout
      routes/content.ts         # GET / (state), PUT /draft, POST /publish, /discard
      routes/uploads.ts         # POST / (multipart → /uploads URL)
    engine/
      index.ts                  # entry: read CMSConfig, mode detect, orchestrate
      discovery.ts              # scan [data-cms]/[data-cms-list] → Field[]
      bind.ts                   # paint Content onto DOM (incl. lists, variants)
      store.ts                  # holds content; wraps an adapter
      adapters/local.ts         # localStorage adapter (createLocalAdapter)
      adapters/api.ts           # fetch adapter (createApiAdapter)
    editor/
      main.tsx                  # React mount
      App.tsx                   # state machine, auth, config fetch, routing
      api.ts                    # typed fetch wrapper over the server API
      index.css                 # design tokens + layout
      components/
        Login.tsx               # branded two-column sign-in
        Topbar.tsx              # save state, undo, discard, publish, sign-out
        Sidebar.tsx             # section list with diff dots
        Editor.tsx              # field cards for active section
        Preview.tsx             # iframe + postMessage bridge
        fields/TextField.tsx
        fields/RichField.tsx
        fields/ImageField.tsx
        fields/LinkField.tsx
        fields/ListField.tsx
  tests/
    fixtures/discovery.html     # engine discovery/bind fixture
    e2e/fixtures/site/index.html# demo client site for Playwright
    e2e/content-studio.spec.ts  # login→edit→preview→publish E2E
  data/                         # runtime content (gitignored)
  dist/                         # build outputs (gitignored)
  public/uploads/               # uploaded images (gitignored)
```

---

## Phase 0 — Scaffold

Goal: an installable, type-checking, test-running empty package with both Vite configs and shared types. Gate: `npm run typecheck` and `npm test` both succeed (zero tests is fine for vitest with `--passWithNoTests`).

### Task 0.1: Initialize package and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "website-cms",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:engine": "vite build --config vite.engine.config.ts",
    "build:editor": "vite build --config vite.editor.config.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "npm run build:engine && npm run build:editor && npm run build:server",
    "dev:editor": "vite --config vite.editor.config.ts",
    "dev:server": "tsx watch src/server/index.ts",
    "start": "node dist/server/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/supertest": "^6.0.2",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: dependencies install with no peer-dependency errors; `node_modules/` created.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: scaffold website-cms package manifest"
```

### Task 0.2: Base + server TypeScript configs

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`

- [ ] **Step 1: Create `tsconfig.json`** (base — used by typecheck, Vite, Vitest)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

- [ ] **Step 2: Create `tsconfig.server.json`** (emits compiled server to `dist/server`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/server", "src/shared"]
}
```

> Note: because the server build uses `NodeNext`, relative imports under `src/server` and `src/shared` MUST end in `.js` (e.g. `./store.js`). The base config uses `Bundler` resolution so Vite/Vitest accept the same `.js`-suffixed imports.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json tsconfig.server.json
git commit -m "chore: add base and server tsconfig"
```

### Task 0.3: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```ts
export type FieldType = 'text' | 'rich' | 'image' | 'link' | 'boolean' | 'select';

export interface ItemField {
  key: string;
  type: FieldType;
  label: string;
}

export interface Field {
  /** Raw data-cms value, e.g. "hero.headline" or "hero.headline@bride". */
  key: string;
  type: FieldType;
  label: string;
  group: string;
  /** Present when key carries an @variant suffix. */
  variant?: string;
  /** True for data-cms-list repeaters. */
  isList?: boolean;
  /** Sub-field shape for list items. */
  itemFields?: ItemField[];
  /** Value read from the DOM at discovery time. */
  defaultContent: unknown;
}

export type Content = Record<string, unknown>;

export interface ContentMeta {
  lastSaved: string | null;
  lastPublished: string | null;
}

export interface Bucket {
  content: Content;
  meta: ContentMeta;
}

export interface BrandConfig {
  siteId: string;
  /** URL of the live client site the editor previews. */
  siteUrl: string;
  brand: {
    name: string;
    eyebrow: string;
    headline: string;
    tagline: string;
    accent: string;
    bg: string;
    logo: string | null;
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared CMS types"
```

### Task 0.4: Vite configs, Vitest config, editor HTML entry

**Files:**
- Create: `vite.engine.config.ts`
- Create: `vite.editor.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/editor/main.tsx` (minimal placeholder so the SPA build has an entry)

- [ ] **Step 1: Create `vite.engine.config.ts`**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist/cms',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/engine/index.ts'),
      name: 'CMSEngine',
      formats: ['iife'],
      fileName: () => 'cms-engine.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});
```

- [ ] **Step 2: Create `vite.editor.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: { outDir: 'dist/admin', emptyOutDir: true },
  server: { port: 5173 },
});
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 4: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create `index.html`** (Vite editor root)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/editor/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/editor/main.tsx`** (placeholder; replaced in Phase 3)

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>Content Studio</div>
  </StrictMode>,
);
```

- [ ] **Step 7: Verify builds run**

Run: `npm run build:editor`
Expected: `dist/admin/index.html` produced, exit 0.

- [ ] **Step 8: Commit**

```bash
git add vite.engine.config.ts vite.editor.config.ts vitest.config.ts tests/setup.ts index.html src/editor/main.tsx
git commit -m "chore: add vite, vitest configs and editor entry"
```

### Task 0.5: Ignore files, env example, sample site config

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `cms.site.json`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
data/
public/uploads/
.env
*.local
test-results/
playwright-report/
```

- [ ] **Step 2: Create `.env.example`**

```
# bcrypt hash of the shared team password (generate with the snippet in README)
CMS_PASSWORD=
# random 64-char string
JWT_SECRET=
PORT=4001
```

- [ ] **Step 3: Create `cms.site.json`** (committed sample for the first client)

```json
{
  "siteId": "grooms-get-ready",
  "siteUrl": "https://groomsgetready.co",
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

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example cms.site.json
git commit -m "chore: add gitignore, env example, sample site config"
```

---

## Phase 1 — Express Server

Goal: a fully tested JSON API — config, auth, content CRUD, uploads, static serving. Gate: `npm test` green for all server suites and `npm run build:server` produces `dist/server/index.js`.

### Task 1.1: Site config loader

**Files:**
- Create: `src/server/config.ts`
- Create: `cms.site.test.json`
- Test: `src/server/config.test.ts`

- [ ] **Step 1: Create `cms.site.test.json`** (fixture used by tests)

```json
{
  "siteId": "test-site",
  "siteUrl": "http://localhost:4099/site",
  "brand": {
    "name": "Test Co",
    "eyebrow": "TESTING",
    "headline": "Hello *world.*",
    "tagline": "Just a test.",
    "accent": "#a87d2e",
    "bg": "#16120b",
    "logo": null
  }
}
```

- [ ] **Step 2: Write the failing test — `src/server/config.test.ts`**

```ts
import { beforeEach, expect, it } from 'vitest';
import path from 'node:path';
import { loadSiteConfig, getSiteId, resetConfigCache } from './config.js';

beforeEach(() => {
  process.env.CMS_SITE_CONFIG = path.resolve(process.cwd(), 'cms.site.test.json');
  resetConfigCache();
});

it('loads the site config from CMS_SITE_CONFIG', async () => {
  const cfg = await loadSiteConfig();
  expect(cfg.siteId).toBe('test-site');
  expect(cfg.brand.name).toBe('Test Co');
});

it('exposes the siteId', async () => {
  expect(await getSiteId()).toBe('test-site');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/server/config.test.ts`
Expected: FAIL — cannot find module `./config.js`.

- [ ] **Step 4: Create `src/server/config.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrandConfig } from '../shared/types.js';

function configPath(): string {
  return process.env.CMS_SITE_CONFIG || path.resolve(process.cwd(), 'cms.site.json');
}

let cached: BrandConfig | null = null;

export function resetConfigCache(): void {
  cached = null;
}

export async function loadSiteConfig(): Promise<BrandConfig> {
  if (cached) return cached;
  const raw = await fs.readFile(configPath(), 'utf8');
  cached = JSON.parse(raw) as BrandConfig;
  return cached;
}

export async function getSiteId(): Promise<string> {
  return (await loadSiteConfig()).siteId;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/config.ts cms.site.test.json src/server/config.test.ts
git commit -m "feat: add server site-config loader"
```

### Task 1.2: Content store (draft/published JSON files)

**Files:**
- Create: `src/server/store.ts`
- Test: `src/server/store.test.ts`

- [ ] **Step 1: Write the failing test — `src/server/store.test.ts`**

```ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getContent, saveDraft, publish, discard } from './store.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-store-'));
  process.env.CMS_DATA_DIR = dir;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

it('returns an empty bucket when nothing is stored', async () => {
  const bucket = await getContent('s1', 'draft');
  expect(bucket.content).toEqual({});
  expect(bucket.meta.lastSaved).toBeNull();
});

it('saves a draft and stamps lastSaved', async () => {
  const bucket = await saveDraft('s1', { 'hero.headline': 'Hi' });
  expect(bucket.content['hero.headline']).toBe('Hi');
  expect(bucket.meta.lastSaved).not.toBeNull();
  const reread = await getContent('s1', 'draft');
  expect(reread.content['hero.headline']).toBe('Hi');
});

it('publish copies draft to published and stamps lastPublished', async () => {
  await saveDraft('s1', { a: 1 });
  const pub = await publish('s1');
  expect(pub.content).toEqual({ a: 1 });
  expect(pub.meta.lastPublished).not.toBeNull();
  expect((await getContent('s1', 'published')).content).toEqual({ a: 1 });
});

it('discard reverts the draft to published', async () => {
  await saveDraft('s1', { a: 1 });
  await publish('s1');
  await saveDraft('s1', { a: 2 });
  const reverted = await discard('s1');
  expect(reverted.content).toEqual({ a: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/store.test.ts`
Expected: FAIL — cannot find module `./store.js`.

- [ ] **Step 3: Create `src/server/store.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bucket, Content } from '../shared/types.js';

type State = 'draft' | 'published';

function dataDir(): string {
  return process.env.CMS_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function bucketPath(siteId: string, state: State): string {
  return path.join(dataDir(), siteId, `${state}.json`);
}

function emptyBucket(): Bucket {
  return { content: {}, meta: { lastSaved: null, lastPublished: null } };
}

async function read(siteId: string, state: State): Promise<Bucket> {
  try {
    return JSON.parse(await fs.readFile(bucketPath(siteId, state), 'utf8')) as Bucket;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyBucket();
    throw err;
  }
}

async function write(siteId: string, state: State, bucket: Bucket): Promise<void> {
  await fs.mkdir(path.join(dataDir(), siteId), { recursive: true });
  await fs.writeFile(bucketPath(siteId, state), JSON.stringify(bucket, null, 2), 'utf8');
}

export async function getContent(siteId: string, state: State): Promise<Bucket> {
  return read(siteId, state);
}

export async function saveDraft(siteId: string, content: Content): Promise<Bucket> {
  const draft = await read(siteId, 'draft');
  const updated: Bucket = {
    content,
    meta: { ...draft.meta, lastSaved: new Date().toISOString() },
  };
  await write(siteId, 'draft', updated);
  return updated;
}

export async function publish(siteId: string): Promise<Bucket> {
  const draft = await read(siteId, 'draft');
  const now = new Date().toISOString();
  const published: Bucket = {
    content: draft.content,
    meta: { lastSaved: draft.meta.lastSaved, lastPublished: now },
  };
  await write(siteId, 'published', published);
  await write(siteId, 'draft', { ...draft, meta: { ...draft.meta, lastPublished: now } });
  return published;
}

export async function discard(siteId: string): Promise<Bucket> {
  const published = await read(siteId, 'published');
  const reverted: Bucket = {
    content: published.content,
    meta: { lastSaved: new Date().toISOString(), lastPublished: published.meta.lastPublished },
  };
  await write(siteId, 'draft', reverted);
  return reverted;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/store.ts src/server/store.test.ts
git commit -m "feat: add content store with draft/publish/discard"
```

### Task 1.3: Auth helpers (bcrypt + JWT)

**Files:**
- Create: `src/server/auth.ts`
- Test: `src/server/auth.test.ts`

- [ ] **Step 1: Write the failing test — `src/server/auth.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/auth.test.ts`
Expected: FAIL — cannot find module `./auth.js`.

- [ ] **Step 3: Create `src/server/auth.ts`**

```ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const TOKEN_TTL = '30d';

function secret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { email: string }): string {
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): { email: string } {
  return jwt.verify(token, secret()) as { email: string };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.ts src/server/auth.test.ts
git commit -m "feat: add bcrypt + JWT auth helpers"
```

### Task 1.4: Auth middleware

**Files:**
- Create: `src/server/middleware/auth.ts`

- [ ] **Step 1: Create `src/server/middleware/auth.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Covered by integration tests in Task 1.8 — no standalone unit test.)

- [ ] **Step 3: Commit**

```bash
git add src/server/middleware/auth.ts
git commit -m "feat: add JWT auth middleware"
```

### Task 1.5: Auth routes

**Files:**
- Create: `src/server/routes/auth.ts`

- [ ] **Step 1: Create `src/server/routes/auth.ts`**

```ts
import { Router } from 'express';
import { signToken, verifyPassword } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const hash = process.env.CMS_PASSWORD;
  if (!hash) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }
  if (!password || !(await verifyPassword(password, hash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({ token: signToken({ email: email || 'team' }) });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Exercised by Task 1.8 integration tests.)

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/auth.ts
git commit -m "feat: add auth login/logout routes"
```

### Task 1.6: Content routes

**Files:**
- Create: `src/server/routes/content.ts`

- [ ] **Step 1: Create `src/server/routes/content.ts`**

```ts
import { Router } from 'express';
import { getSiteId } from '../config.js';
import { discard, getContent, publish, saveDraft } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import type { Content } from '../../shared/types.js';

export const contentRouter = Router();

// GET /api/content?state=published|draft  (draft requires auth)
contentRouter.get('/', (req, res, next) => {
  if (req.query.state === 'draft') {
    requireAuth(req, res, async () => {
      res.json(await getContent(await getSiteId(), 'draft'));
    });
    return;
  }
  getContent(getSiteIdSync(), 'published')
    .then((b) => res.json(b))
    .catch(next);
});

// getSiteId is async; resolve once per request for the published path too.
async function getSiteIdSync(): Promise<string> {
  return getSiteId();
}

contentRouter.put('/draft', requireAuth, async (req, res) => {
  const { content } = (req.body ?? {}) as { content?: Content };
  if (typeof content !== 'object' || content === null) {
    res.status(400).json({ error: 'content required' });
    return;
  }
  res.json(await saveDraft(await getSiteId(), content));
});

contentRouter.post('/publish', requireAuth, async (_req, res) => {
  res.json(await publish(await getSiteId()));
});

contentRouter.post('/discard', requireAuth, async (_req, res) => {
  res.json(await discard(await getSiteId()));
});
```

> Correction note for the executor: the published GET handler above must `await` the siteId. Use this exact handler body instead of the inline `.then(getSiteIdSync())` sketch:

```ts
contentRouter.get('/', (req, res, next) => {
  if (req.query.state === 'draft') {
    requireAuth(req, res, async () => {
      res.json(await getContent(await getSiteId(), 'draft'));
    });
    return;
  }
  (async () => {
    res.json(await getContent(await getSiteId(), 'published'));
  })().catch(next);
});
```

Delete the `getSiteIdSync` helper — it is not needed.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Exercised by Task 1.8.)

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/content.ts
git commit -m "feat: add content GET/PUT/publish/discard routes"
```

### Task 1.7: Uploads route

**Files:**
- Create: `src/server/routes/uploads.ts`

- [ ] **Step 1: Create `src/server/routes/uploads.ts`**

```ts
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSiteId } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    getSiteId()
      .then(async (siteId) => {
        const dir = path.join(uploadRoot(), siteId);
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
      })
      .catch((err) => cb(err as Error, ''));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'no file' });
    return;
  }
  const siteId = await getSiteId();
  res.json({ url: `/uploads/${siteId}/${req.file.filename}` });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Exercised by Task 1.8.)

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/uploads.ts
git commit -m "feat: add image upload route"
```

### Task 1.8: App assembly + integration tests

**Files:**
- Create: `src/server/index.ts`
- Test: `src/server/index.test.ts`

- [ ] **Step 1: Create `src/server/index.ts`**

```ts
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { loadSiteConfig } from './config.js';
import { authRouter } from './routes/auth.js';
import { contentRouter } from './routes/content.js';
import { uploadsRouter } from './routes/uploads.js';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/config', async (_req, res, next) => {
    try {
      res.json(await loadSiteConfig());
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/content', contentRouter);
  app.use('/api/uploads', uploadsRouter);

  const dist = path.resolve(process.cwd(), 'dist');
  app.use('/cms', express.static(path.join(dist, 'cms')));
  app.use('/admin', express.static(path.join(dist, 'admin')));
  app.use('/uploads', express.static(path.resolve(uploadDir())));

  return app;
}

function uploadDir(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

const PORT = Number(process.env.PORT) || 4001;

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Content Studio server listening on :${PORT}`);
  });
}
```

- [ ] **Step 2: Write the failing test — `src/server/index.test.ts`**

```ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from './index.js';
import { resetConfigCache } from './config.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-api-'));
  process.env.NODE_ENV = 'test';
  process.env.CMS_DATA_DIR = dir;
  process.env.CMS_SITE_CONFIG = path.resolve(process.cwd(), 'cms.site.test.json');
  process.env.JWT_SECRET = 'test-secret';
  process.env.CMS_PASSWORD = bcrypt.hashSync('letmein', 10);
  resetConfigCache();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ password: 'letmein' });
  return res.body.token as string;
}

it('GET /api/config returns brand config (public)', async () => {
  const res = await request(createApp()).get('/api/config');
  expect(res.status).toBe(200);
  expect(res.body.siteId).toBe('test-site');
});

it('rejects login with a wrong password', async () => {
  const res = await request(createApp()).post('/api/auth/login').send({ password: 'wrong' });
  expect(res.status).toBe(401);
});

it('blocks draft save without a token', async () => {
  const res = await request(createApp()).put('/api/content/draft').send({ content: {} });
  expect(res.status).toBe(401);
});

it('saves a draft, publishes, and serves published content publicly', async () => {
  const app = createApp();
  const token = await login(app);

  const save = await request(app)
    .put('/api/content/draft')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: { 'hero.headline': 'Hi there' } });
  expect(save.status).toBe(200);

  // published is still empty before publish
  const before = await request(app).get('/api/content?state=published');
  expect(before.body.content).toEqual({});

  const pub = await request(app)
    .post('/api/content/publish')
    .set('Authorization', `Bearer ${token}`);
  expect(pub.status).toBe(200);

  const after = await request(app).get('/api/content?state=published');
  expect(after.body.content['hero.headline']).toBe('Hi there');
});

it('discard reverts draft to published', async () => {
  const app = createApp();
  const token = await login(app);
  const auth = { Authorization: `Bearer ${token}` };

  await request(app).put('/api/content/draft').set(auth).send({ content: { a: 1 } });
  await request(app).post('/api/content/publish').set(auth);
  await request(app).put('/api/content/draft').set(auth).send({ content: { a: 2 } });

  const res = await request(app).post('/api/content/discard').set(auth);
  expect(res.body.content).toEqual({ a: 1 });
});
```

- [ ] **Step 3: Run test to verify it fails then passes**

Run: `npx vitest run src/server/index.test.ts`
Expected: After creating `index.ts`, PASS (5 tests).

- [ ] **Step 4: Run the full server build**

Run: `npm run build:server`
Expected: `dist/server/index.js` exists, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts src/server/index.test.ts
git commit -m "feat: assemble express app with API integration tests"
```

---

## Phase 2 — cms-engine.js

Goal: a tested vanilla-TS engine that discovers schema, paints content (text/rich/image/link/boolean, lists, variants), swaps adapters, and ships as an IIFE bundle. Gate: `npm test` green for engine suites and `npm run build:engine` produces `dist/cms/cms-engine.js`.

### Task 2.1: Discovery

**Files:**
- Create: `src/engine/discovery.ts`
- Test: `src/engine/discovery.test.ts`
- Create: `tests/fixtures/discovery.html`

- [ ] **Step 1: Create `tests/fixtures/discovery.html`** (markup fragment used by tests)

```html
<section data-cms-group="Hero">
  <h1 data-cms="hero.headline" data-cms-type="rich" data-cms-label="Headline" data-cms-group="Hero">Grooms Get Ready</h1>
  <p data-cms="hero.tagline" data-cms-group="Hero">One goal. Your best day.</p>
  <img data-cms="hero.image" data-cms-type="image" data-cms-group="Hero" src="/img/hero.jpg" alt="" />
  <h1 data-cms="hero.headline@bride" data-cms-type="rich" data-cms-group="Hero">Brides Get Ready</h1>
</section>
<div data-cms-list="faq" data-cms-label="FAQ items" data-cms-group="FAQ">
  <template data-cms-item>
    <div class="faq-item">
      <div class="faq-q" data-cms-field="q"></div>
      <div class="faq-a" data-cms-field="a" data-cms-type="rich"></div>
    </div>
  </template>
</div>
```

- [ ] **Step 2: Write the failing test — `src/engine/discovery.test.ts`**

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { discover } from './discovery.js';

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

it('discovers simple fields with type, label, group', () => {
  const fields = discover(document);
  const headline = fields.find((f) => f.key === 'hero.headline');
  expect(headline).toBeTruthy();
  expect(headline!.type).toBe('rich');
  expect(headline!.label).toBe('Headline');
  expect(headline!.group).toBe('Hero');
});

it('humanizes labels when data-cms-label is absent', () => {
  const tagline = discover(document).find((f) => f.key === 'hero.tagline');
  expect(tagline!.label).toBe('Tagline');
});

it('detects variant fields via the @variant suffix', () => {
  const v = discover(document).find((f) => f.key === 'hero.headline@bride');
  expect(v!.variant).toBe('bride');
});

it('discovers a list with its item sub-fields', () => {
  const faq = discover(document).find((f) => f.key === 'faq');
  expect(faq!.isList).toBe(true);
  expect(faq!.itemFields!.map((i) => i.key)).toEqual(['q', 'a']);
  expect(faq!.itemFields!.find((i) => i.key === 'a')!.type).toBe('rich');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/discovery.test.ts`
Expected: FAIL — cannot find module `./discovery.js`.

- [ ] **Step 4: Create `src/engine/discovery.ts`**

```ts
import type { Field, FieldType, ItemField } from '../shared/types.js';

export function humanize(key: string): string {
  const last = key.split('.').pop() || key;
  return last
    .replace(/@.*/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function variantOf(raw: string): string | undefined {
  const at = raw.indexOf('@');
  return at === -1 ? undefined : raw.slice(at + 1);
}

export function readElement(el: HTMLElement, type: FieldType): unknown {
  switch (type) {
    case 'image':
      return el.getAttribute('src') || '';
    case 'link':
      return { text: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' };
    case 'boolean':
      return el.getAttribute('data-cms-value') === 'true';
    default:
      return el.innerHTML.trim();
  }
}

export function discover(root: ParentNode = document): Field[] {
  const fields: Field[] = [];

  root.querySelectorAll<HTMLElement>('[data-cms]').forEach((el) => {
    const raw = el.getAttribute('data-cms')!;
    const type = (el.getAttribute('data-cms-type') as FieldType) || 'text';
    fields.push({
      key: raw,
      type,
      label: el.getAttribute('data-cms-label') || humanize(raw),
      group: el.getAttribute('data-cms-group') || 'Content',
      variant: variantOf(raw),
      defaultContent: readElement(el, type),
    });
  });

  root.querySelectorAll<HTMLElement>('[data-cms-list]').forEach((el) => {
    const key = el.getAttribute('data-cms-list')!;
    const tpl = el.querySelector<HTMLTemplateElement>('template[data-cms-item]');
    const itemFields: ItemField[] = tpl
      ? Array.from(tpl.content.querySelectorAll<HTMLElement>('[data-cms-field]')).map((f) => ({
          key: f.getAttribute('data-cms-field')!,
          type: (f.getAttribute('data-cms-type') as FieldType) || 'text',
          label: f.getAttribute('data-cms-label') || humanize(f.getAttribute('data-cms-field')!),
        }))
      : [];
    fields.push({
      key,
      type: 'text',
      label: el.getAttribute('data-cms-label') || humanize(key),
      group: el.getAttribute('data-cms-group') || 'Content',
      isList: true,
      itemFields,
      defaultContent: [],
    });
  });

  return fields;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/discovery.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/discovery.ts src/engine/discovery.test.ts tests/fixtures/discovery.html
git commit -m "feat: add engine DOM discovery"
```

### Task 2.2: Binding (paint content onto the DOM)

**Files:**
- Create: `src/engine/bind.ts`
- Test: `src/engine/bind.test.ts`

- [ ] **Step 1: Write the failing test — `src/engine/bind.test.ts`**

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { bind } from './bind.js';

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

it('paints text and rich content (rich converts *x* and \\n)', () => {
  bind({ 'hero.headline': 'Get *Ready*\nNow', 'hero.tagline': 'Be your best.' }, document);
  expect(document.querySelector('[data-cms="hero.headline"]')!.innerHTML).toBe(
    'Get <em>Ready</em><br>Now',
  );
  expect(document.querySelector('[data-cms="hero.tagline"]')!.textContent).toBe('Be your best.');
});

it('paints image src', () => {
  bind({ 'hero.image': '/uploads/test/new.jpg' }, document);
  expect(document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!.getAttribute('src')).toBe(
    '/uploads/test/new.jpg',
  );
});

it('uses the variant value when a variant is active', () => {
  bind(
    { 'hero.headline': 'Grooms Get Ready', 'hero.headline@bride': 'Brides Get Ready' },
    document,
    'bride',
  );
  // the base element repaints with the variant value
  expect(document.querySelector('[data-cms="hero.headline"]')!.textContent).toContain('Brides');
});

it('renders a list by cloning the template per item', () => {
  bind(
    {
      faq: [
        { q: 'Q1', a: 'A1' },
        { q: 'Q2', a: 'A2' },
      ],
    },
    document,
  );
  const rendered = document.querySelectorAll('[data-cms-list="faq"] [data-cms-rendered]');
  expect(rendered.length).toBe(2);
  expect(rendered[0].querySelector('.faq-q')!.textContent).toBe('Q1');
});

it('re-rendering a list clears previously rendered items', () => {
  bind({ faq: [{ q: 'Q1', a: 'A1' }] }, document);
  bind({ faq: [{ q: 'Only', a: 'One' }] }, document);
  const rendered = document.querySelectorAll('[data-cms-list="faq"] [data-cms-rendered]');
  expect(rendered.length).toBe(1);
  expect(rendered[0].querySelector('.faq-q')!.textContent).toBe('Only');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/bind.test.ts`
Expected: FAIL — cannot find module `./bind.js`.

- [ ] **Step 3: Create `src/engine/bind.ts`**

```ts
import type { Content, FieldType } from '../shared/types.js';

export function renderRich(value: string): string {
  return value.replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

export function paintElement(el: HTMLElement, type: FieldType, value: unknown): void {
  switch (type) {
    case 'image':
      if (el instanceof HTMLImageElement) el.src = String(value);
      else el.style.backgroundImage = `url("${String(value)}")`;
      break;
    case 'rich':
      el.innerHTML = renderRich(String(value));
      break;
    case 'link': {
      const v = (value ?? {}) as { text?: string; href?: string };
      el.textContent = v.text ?? '';
      if (v.href != null) el.setAttribute('href', v.href);
      break;
    }
    case 'boolean':
      el.style.display = value ? '' : 'none';
      break;
    default:
      el.textContent = String(value);
  }
}

function baseKey(raw: string): string {
  const at = raw.indexOf('@');
  return at === -1 ? raw : raw.slice(0, at);
}

export function bindLists(content: Content, root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-cms-list]').forEach((listEl) => {
    const key = listEl.getAttribute('data-cms-list')!;
    const items = content[key];
    const tpl = listEl.querySelector<HTMLTemplateElement>('template[data-cms-item]');
    if (!Array.isArray(items) || !tpl || !tpl.content.firstElementChild) return;

    listEl.querySelectorAll('[data-cms-rendered]').forEach((n) => n.remove());

    for (const item of items) {
      const clone = tpl.content.firstElementChild.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-cms-rendered', '');
      clone.querySelectorAll<HTMLElement>('[data-cms-field]').forEach((fieldEl) => {
        const fk = fieldEl.getAttribute('data-cms-field')!;
        const type = (fieldEl.getAttribute('data-cms-type') as FieldType) || 'text';
        paintElement(fieldEl, type, (item as Record<string, unknown>)[fk]);
      });
      listEl.appendChild(clone);
    }
  });
}

export function bind(content: Content, root: ParentNode = document, variant = 'default'): void {
  root.querySelectorAll<HTMLElement>('[data-cms]').forEach((el) => {
    const key = baseKey(el.getAttribute('data-cms')!);
    const variantKey = `${key}@${variant}`;
    const value =
      variant !== 'default' && content[variantKey] !== undefined ? content[variantKey] : content[key];
    if (value === undefined) return;
    const type = (el.getAttribute('data-cms-type') as FieldType) || 'text';
    paintElement(el, type, value);
  });

  bindLists(content, root);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/bind.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/bind.ts src/engine/bind.test.ts
git commit -m "feat: add engine content binding with lists and variants"
```

### Task 2.3: Adapters

**Files:**
- Create: `src/engine/adapters/local.ts`
- Create: `src/engine/adapters/api.ts`
- Test: `src/engine/adapters/local.test.ts`

- [ ] **Step 1: Write the failing test — `src/engine/adapters/local.test.ts`**

```ts
// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { createLocalAdapter } from './local.js';

beforeEach(() => localStorage.clear());

it('saves a draft and publishes it', async () => {
  const a = createLocalAdapter('s1');
  await a.saveDraft({ x: 1 });
  expect(await a.getDraft()).toEqual({ x: 1 });
  expect(await a.getPublished()).toEqual({});
  await a.publish();
  expect(await a.getPublished()).toEqual({ x: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/adapters/local.test.ts`
Expected: FAIL — cannot find module `./local.js`.

- [ ] **Step 3: Create `src/engine/adapters/local.ts`**

```ts
import type { Content } from '../../shared/types.js';

export interface CMSAdapter {
  getPublished(): Promise<Content>;
  getDraft(): Promise<Content>;
  saveDraft(content: Content): Promise<void>;
  publish(): Promise<void>;
}

export function createLocalAdapter(siteId: string): CMSAdapter {
  const key = (state: 'draft' | 'published') => `cms:${siteId}:${state}`;
  const read = (state: 'draft' | 'published'): Content => {
    const raw = localStorage.getItem(key(state));
    return raw ? (JSON.parse(raw) as Content) : {};
  };
  return {
    async getPublished() {
      return read('published');
    },
    async getDraft() {
      return read('draft');
    },
    async saveDraft(content) {
      localStorage.setItem(key('draft'), JSON.stringify(content));
    },
    async publish() {
      localStorage.setItem(key('published'), localStorage.getItem(key('draft')) || '{}');
    },
  };
}
```

- [ ] **Step 4: Create `src/engine/adapters/api.ts`**

```ts
import type { Content } from '../../shared/types.js';
import type { CMSAdapter } from './local.js';

export function createApiAdapter(base: string, getToken: () => string | null): CMSAdapter {
  const auth = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  return {
    async getPublished() {
      const r = await fetch(`${base}/api/content?state=published`);
      return ((await r.json()) as { content?: Content }).content ?? {};
    },
    async getDraft() {
      const r = await fetch(`${base}/api/content?state=draft`, { headers: { ...auth() } });
      return ((await r.json()) as { content?: Content }).content ?? {};
    },
    async saveDraft(content) {
      await fetch(`${base}/api/content/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ content }),
      });
    },
    async publish() {
      await fetch(`${base}/api/content/publish`, { method: 'POST', headers: { ...auth() } });
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/adapters/local.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/engine/adapters/local.ts src/engine/adapters/api.ts src/engine/adapters/local.test.ts
git commit -m "feat: add local and api engine adapters"
```

### Task 2.4: Store + engine entry (mode detection)

**Files:**
- Create: `src/engine/store.ts`
- Create: `src/engine/index.ts`

- [ ] **Step 1: Create `src/engine/store.ts`**

```ts
import type { Content } from '../shared/types.js';

export interface ReadableAdapter {
  getPublished(): Promise<Content>;
}

export function createStore(adapter: ReadableAdapter) {
  let content: Content = {};
  return {
    async load(): Promise<Content> {
      content = await adapter.getPublished();
      return content;
    },
    get(): Content {
      return content;
    },
    set(next: Content): void {
      content = next;
    },
  };
}
```

- [ ] **Step 2: Create `src/engine/index.ts`**

```ts
import { discover } from './discovery.js';
import { bind } from './bind.js';
import { createStore } from './store.js';
import { createLocalAdapter } from './adapters/local.js';
import { createApiAdapter } from './adapters/api.js';
import type { Content } from '../shared/types.js';

interface CMSConfig {
  siteId: string;
  backend: { type: 'local' | 'api'; base?: string };
  variants?: { id: string; label: string }[];
  groups?: string[];
}

function isPreview(): boolean {
  return new URLSearchParams(location.search).get('cms') === 'preview';
}

function runPreviewMode(cfg: CMSConfig): void {
  const schema = discover(document);
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string; content?: Content; variant?: string; group?: string };
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'cms-content' && msg.content) {
      bind(msg.content, document, msg.variant || 'default');
    }
    if (msg.type === 'cms-scroll' && msg.group) {
      document
        .querySelector(`[data-cms-group="${msg.group}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  parent.postMessage({ type: 'cms-schema', schema, groups: cfg.groups, variants: cfg.variants }, '*');
  parent.postMessage({ type: 'cms-ready' }, '*');
}

async function runLiveMode(cfg: CMSConfig): Promise<void> {
  if (cfg.backend.type === 'api' && cfg.backend.base) {
    const store = createStore(createApiAdapter(cfg.backend.base, () => null));
    bind(await store.load(), document);
    return;
  }
  const local = createLocalAdapter(cfg.siteId);
  bind(await local.getPublished(), document);
  window.addEventListener('storage', async (e) => {
    if (e.key === `cms:${cfg.siteId}:published`) {
      bind(await local.getPublished(), document);
    }
  });
}

function init(): void {
  const cfg = (window as unknown as { CMSConfig?: CMSConfig }).CMSConfig;
  if (!cfg) return;
  if (isPreview()) runPreviewMode(cfg);
  else void runLiveMode(cfg);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Typecheck and build the engine bundle**

Run: `npm run typecheck && npm run build:engine`
Expected: typecheck PASS; `dist/cms/cms-engine.js` produced.

- [ ] **Step 4: Commit**

```bash
git add src/engine/store.ts src/engine/index.ts
git commit -m "feat: add engine entry with preview/live mode detection"
```

---

## Phase 3 — React Admin Editor

Goal: a working SPA — branded login, schema-driven field editor, live preview bridge, autosave, publish/discard, undo, toasts — styled with the spec's design tokens. Gate: `npm test` green for editor component tests and `npm run build:editor` produces `dist/admin/`.

### Task 3.1: Design tokens + base layout CSS

**Files:**
- Create: `src/editor/index.css`

- [ ] **Step 1: Create `src/editor/index.css`** (tokens carried verbatim from the spec + layout)

```css
:root {
  --bg: #eceef1;
  --panel: #ffffff;
  --panel-2: #f7f8fa;
  --line: #e4e7ec;
  --line-2: #eef1f4;
  --ink: #1b1f24;
  --ink-2: #3d444d;
  --muted: #6e7480;
  --faint: #9aa1ac;
  --accent: #a87d2e;
  --accent-2: #8a6620;
  --accent-soft: #f7efdd;
  --accent-line: #e7d6ac;
  --ink-dark: #16120b;
  --ok: #1f8a5b;
  --ok-soft: #e4f3ec;
  --warn: #9a6a12;
  --warn-soft: #f8efda;
  --danger: #c0492f;
  --bride: #a85b7e;
  --radius-card: 9px;
  --radius-ctrl: 7px;
  --shadow: 0 1px 2px rgba(20, 24, 30, 0.05), 0 6px 18px -10px rgba(20, 24, 30, 0.18);
  --focus-ring: 0 0 0 3px var(--accent-soft);
  --ui-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { font-family: var(--ui-font); color: var(--ink); background: var(--bg); }

.app { display: flex; flex-direction: column; height: 100vh; }
.topbar {
  height: 60px; flex: 0 0 60px; display: flex; align-items: center;
  justify-content: space-between; padding: 0 16px; background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.topbar .brandmark { font-weight: 600; }
.topbar .right { display: flex; align-items: center; gap: 10px; }
.workspace { flex: 1; display: grid; grid-template-columns: 244px 1fr 1fr; min-height: 0; }
.sidebar { border-right: 1px solid var(--line); background: var(--panel); overflow-y: auto; padding: 12px 8px; }
.sidebar button {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  padding: 9px 12px; border: 0; background: transparent; border-radius: var(--radius-ctrl);
  font: inherit; color: var(--ink-2); cursor: pointer; text-align: left;
}
.sidebar button.active { background: var(--accent-soft); color: var(--ink); }
.sidebar .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warn); }
.editor-pane { overflow-y: auto; padding: 28px; }
.editor-col { max-width: 720px; margin: 0 auto; }
.editor-col h2 { margin: 0 0 4px; }
.editor-col .blurb { color: var(--muted); margin: 0 0 20px; }
.field-card {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-card);
  box-shadow: var(--shadow); padding: 16px; margin-bottom: 14px;
}
.field-card .label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.field-card label { font-weight: 600; font-size: 13px; color: var(--ink-2); }
.field-card .hint { color: var(--faint); font-size: 12px; margin-top: 6px; }
.reset-pill, .variant-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line);
  background: var(--panel-2); cursor: pointer;
}
.variant-sub { border-left: 3px solid var(--bride); padding-left: 10px; margin-top: 10px; }
input[type='text'], textarea {
  width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-ctrl);
  font: inherit; color: var(--ink); background: var(--panel);
}
input[type='text']:focus, textarea:focus { outline: none; border-color: var(--accent-line); box-shadow: var(--focus-ring); }
.preview-pane { background: var(--panel-2); border-left: 1px solid var(--line); overflow: hidden; }
.preview-pane iframe { width: 100%; height: 100%; border: 0; background: #fff; }

.btn {
  font: inherit; border: 1px solid var(--line); background: var(--panel); color: var(--ink-2);
  padding: 8px 14px; border-radius: var(--radius-ctrl); cursor: pointer;
}
.btn-gold { background: var(--accent); border-color: var(--accent-2); color: #fff; }
.btn-gold:disabled { opacity: 0.45; cursor: default; }
.pill { font-size: 12px; padding: 4px 10px; border-radius: 999px; }
.pill-ok { background: var(--ok-soft); color: var(--ok); }
.pill-warn { background: var(--warn-soft); color: var(--warn); }

.toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--ink-dark); color: #fff; padding: 10px 18px; border-radius: 999px;
  box-shadow: var(--shadow); font-size: 14px;
}

/* Login */
.login { display: grid; grid-template-columns: 1.05fr 1fr; height: 100vh; }
.login .brand-panel { color: #fff; padding: 56px; display: flex; flex-direction: column; justify-content: center; }
.login .eyebrow { letter-spacing: 0.18em; font-size: 12px; opacity: 0.85; }
.login .brand-panel h1 { font-size: 40px; margin: 12px 0; }
.login .form-panel { display: flex; align-items: center; justify-content: center; padding: 40px; }
.login form { width: 320px; display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 900px) {
  .login { grid-template-columns: 1fr; }
  .login .brand-panel { display: none; }
  .workspace { grid-template-columns: 1fr; }
  .sidebar, .preview-pane { display: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/editor/index.css
git commit -m "feat: add editor design tokens and layout css"
```

### Task 3.2: API client

**Files:**
- Create: `src/editor/api.ts`
- Test: `src/editor/api.test.ts`

- [ ] **Step 1: Write the failing test — `src/editor/api.test.ts`**

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApiClient } from './api.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('login posts the password and returns a token', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ token: 'abc' }),
  });
  const api = createApiClient('', () => null);
  expect(await api.login('e@x.com', 'pw')).toBe('abc');
});

it('saveDraft sends the bearer token', async () => {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValue({ ok: true, json: async () => ({}) });
  const api = createApiClient('', () => 'tok');
  await api.saveDraft({ a: 1 });
  const [, opts] = f.mock.calls[0];
  expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/api.test.ts`
Expected: FAIL — cannot find module `./api.js`.

- [ ] **Step 3: Create `src/editor/api.ts`**

```ts
import type { BrandConfig, Bucket, Content } from '../shared/types.js';

export function createApiClient(base: string, getToken: () => string | null) {
  const auth = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  const json = (extra: Record<string, string> = {}) => ({
    'Content-Type': 'application/json',
    ...auth(),
    ...extra,
  });
  return {
    async getConfig(): Promise<BrandConfig> {
      return (await fetch(`${base}/api/config`)).json();
    },
    async login(email: string, password: string): Promise<string> {
      const r = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error('login failed');
      return ((await r.json()) as { token: string }).token;
    },
    async getDraft(): Promise<Bucket> {
      return (await fetch(`${base}/api/content?state=draft`, { headers: auth() })).json();
    },
    async getPublished(): Promise<Bucket> {
      return (await fetch(`${base}/api/content?state=published`)).json();
    },
    async saveDraft(content: Content): Promise<Bucket> {
      return (
        await fetch(`${base}/api/content/draft`, {
          method: 'PUT',
          headers: json(),
          body: JSON.stringify({ content }),
        })
      ).json();
    },
    async publish(): Promise<Bucket> {
      return (await fetch(`${base}/api/content/publish`, { method: 'POST', headers: auth() })).json();
    },
    async discard(): Promise<Bucket> {
      return (await fetch(`${base}/api/content/discard`, { method: 'POST', headers: auth() })).json();
    },
    async upload(file: File): Promise<string> {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth(), body: fd });
      return ((await r.json()) as { url: string }).url;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/api.ts src/editor/api.test.ts
git commit -m "feat: add editor API client"
```

### Task 3.3: Field components

**Files:**
- Create: `src/editor/components/fields/TextField.tsx`
- Create: `src/editor/components/fields/RichField.tsx`
- Create: `src/editor/components/fields/LinkField.tsx`
- Create: `src/editor/components/fields/ImageField.tsx`
- Create: `src/editor/components/fields/ListField.tsx`
- Test: `src/editor/components/fields/fields.test.tsx`

- [ ] **Step 1: Create `src/editor/components/fields/TextField.tsx`**

```tsx
interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function TextField({ value, onChange }: Props) {
  return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}
```

- [ ] **Step 2: Create `src/editor/components/fields/RichField.tsx`**

```tsx
interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function RichField({ value, onChange }: Props) {
  return (
    <>
      <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      <div className="hint">Use *stars* for emphasis and new lines for breaks.</div>
    </>
  );
}
```

- [ ] **Step 3: Create `src/editor/components/fields/LinkField.tsx`**

```tsx
interface LinkValue {
  text: string;
  href: string;
}
interface Props {
  value: LinkValue;
  onChange: (v: LinkValue) => void;
}

export function LinkField({ value, onChange }: Props) {
  const v = value ?? { text: '', href: '' };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input
        type="text"
        placeholder="Link text"
        value={v.text}
        onChange={(e) => onChange({ ...v, text: e.target.value })}
      />
      <input
        type="text"
        placeholder="https://…"
        value={v.href}
        onChange={(e) => onChange({ ...v, href: e.target.value })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/editor/components/fields/ImageField.tsx`**

```tsx
import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
}

export function ImageField({ value, onChange, upload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await upload(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleFile(e.dataTransfer.files[0]);
      }}
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-ctrl)',
        padding: 14,
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      {value ? (
        <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6 }} />
      ) : (
        <span className="hint">{busy ? 'Uploading…' : 'Drop an image or click to upload'}</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create `src/editor/components/fields/ListField.tsx`**

```tsx
import { useState } from 'react';
import type { ItemField } from '../../../shared/types.js';
import { TextField } from './TextField.js';
import { RichField } from './RichField.js';

type Item = Record<string, unknown>;

interface Props {
  items: Item[];
  itemFields: ItemField[];
  onChange: (items: Item[]) => void;
}

export function ListField({ items, itemFields, onChange }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const list = items ?? [];

  const update = (i: number, key: string, val: unknown) => {
    const next = list.map((it, idx) => (idx === i ? { ...it, [key]: val } : it));
    onChange(next);
  };
  const add = () => onChange([...list, Object.fromEntries(itemFields.map((f) => [f.key, '']))]);
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const reorder = (from: number, to: number) => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {list.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
            setDragIndex(null);
          }}
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="hint">Item {i + 1}</span>
            <button type="button" className="reset-pill" onClick={() => remove(i)}>
              Delete
            </button>
          </div>
          {itemFields.map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label>{f.label}</label>
              {f.type === 'rich' ? (
                <RichField
                  value={String(item[f.key] ?? '')}
                  onChange={(v) => update(i, f.key, v)}
                />
              ) : (
                <TextField
                  value={String(item[f.key] ?? '')}
                  onChange={(v) => update(i, f.key, v)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="btn" onClick={add}>
        + Add item
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Write the test — `src/editor/components/fields/fields.test.tsx`**

```tsx
// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextField } from './TextField.js';
import { ListField } from './ListField.js';

it('TextField emits changes', () => {
  const onChange = vi.fn();
  render(<TextField value="hi" onChange={onChange} />);
  fireEvent.change(screen.getByDisplayValue('hi'), { target: { value: 'bye' } });
  expect(onChange).toHaveBeenCalledWith('bye');
});

it('ListField adds an item', () => {
  const onChange = vi.fn();
  render(
    <ListField
      items={[]}
      itemFields={[{ key: 'q', type: 'text', label: 'Q' }]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByText('+ Add item'));
  expect(onChange).toHaveBeenCalledWith([{ q: '' }]);
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/editor/components/fields/fields.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/editor/components/fields
git commit -m "feat: add editor field components"
```

### Task 3.4: Login, Sidebar, Topbar, Editor, Preview components

**Files:**
- Create: `src/editor/components/Login.tsx`
- Create: `src/editor/components/Sidebar.tsx`
- Create: `src/editor/components/Topbar.tsx`
- Create: `src/editor/components/Editor.tsx`
- Create: `src/editor/components/Preview.tsx`

- [ ] **Step 1: Create `src/editor/components/Login.tsx`**

```tsx
import { useState } from 'react';
import type { BrandConfig } from '../../shared/types.js';

interface Props {
  config: BrandConfig;
  onLogin: (email: string, password: string) => Promise<void>;
}

function renderRich(s: string): string {
  return s.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function Login({ config, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(email, password);
    } catch {
      setError('Incorrect password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="brand-panel" style={{ background: config.brand.bg }}>
        <div className="eyebrow">{config.brand.eyebrow}</div>
        <h1 dangerouslySetInnerHTML={{ __html: renderRich(config.brand.headline) }} />
        <p>{config.brand.tagline}</p>
      </div>
      <div className="form-panel">
        <form onSubmit={submit}>
          <h2>Sign in</h2>
          <input
            type="text"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/editor/components/Sidebar.tsx`**

```tsx
interface Props {
  groups: string[];
  active: string;
  dirtyGroups: Set<string>;
  onSelect: (group: string) => void;
}

export function Sidebar({ groups, active, dirtyGroups, onSelect }: Props) {
  return (
    <nav className="sidebar">
      {groups.map((g) => (
        <button
          key={g}
          className={g === active ? 'active' : ''}
          onClick={() => onSelect(g)}
        >
          <span>{g}</span>
          {dirtyGroups.has(g) && <span className="dot" aria-label="unsaved changes" />}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Create `src/editor/components/Topbar.tsx`**

```tsx
import type { ContentMeta } from '../../shared/types.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PublishStatus = 'published' | 'dirty' | 'never';

interface Props {
  saveState: SaveState;
  meta: ContentMeta;
  status: PublishStatus;
  canUndo: boolean;
  hasChanges: boolean;
  siteUrl: string;
  onUndo: () => void;
  onDiscard: () => void;
  onPublish: () => void;
  onSignOut: () => void;
}

function time(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function Topbar(p: Props) {
  const pill =
    p.status === 'published'
      ? { cls: 'pill pill-ok', text: 'Published & live' }
      : p.status === 'dirty'
        ? { cls: 'pill pill-warn', text: 'Unpublished changes' }
        : { cls: 'pill pill-warn', text: 'Not published yet' };

  return (
    <header className="topbar">
      <div className="brandmark">Content Studio</div>
      <div className="right">
        <span className="hint">
          {p.saveState === 'saving' && 'Saving…'}
          {p.saveState === 'saved' && `Saved · ${time(p.meta.lastSaved)}`}
          {p.saveState === 'error' && 'Save failed'}
        </span>
        <button className="btn" onClick={p.onUndo} disabled={!p.canUndo}>
          Undo
        </button>
        <button className="btn" onClick={p.onDiscard} disabled={!p.hasChanges}>
          Discard
        </button>
        <a className="btn" href={p.siteUrl} target="_blank" rel="noreferrer">
          View Live
        </a>
        <span className={pill.cls}>{pill.text}</span>
        <button className="btn btn-gold" onClick={p.onPublish} disabled={!p.hasChanges}>
          Publish
        </button>
        <button className="btn" onClick={p.onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create `src/editor/components/Editor.tsx`**

```tsx
import type { Field, Content } from '../../shared/types.js';
import { TextField } from './fields/TextField.js';
import { RichField } from './fields/RichField.js';
import { LinkField } from './fields/LinkField.js';
import { ImageField } from './fields/ImageField.js';
import { ListField } from './fields/ListField.js';

interface Props {
  group: string;
  fields: Field[];
  content: Content;
  variants: { id: string; label: string }[];
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string, value: unknown) => void;
  upload: (file: File) => Promise<string>;
}

function renderField(
  field: Field,
  key: string,
  value: unknown,
  onChange: (v: unknown) => void,
  upload: (file: File) => Promise<string>,
) {
  switch (field.type) {
    case 'rich':
      return <RichField value={String(value ?? '')} onChange={onChange} />;
    case 'image':
      return <ImageField value={String(value ?? '')} onChange={onChange} upload={upload} />;
    case 'link':
      return (
        <LinkField
          value={(value as { text: string; href: string }) ?? { text: '', href: '' }}
          onChange={onChange}
        />
      );
    default:
      return <TextField value={String(value ?? '')} onChange={onChange} />;
  }
}

export function Editor({ group, fields, content, variants, onChange, onReset, upload }: Props) {
  // Only base (non-@variant) fields are top-level cards within the active group.
  const groupFields = fields.filter((f) => f.group === group && !f.variant);

  return (
    <section className="editor-pane">
      <div className="editor-col">
        <h2>{group}</h2>
        <p className="blurb">Edit the {group} section. Changes preview live and auto-save.</p>
        {groupFields.map((f) => {
          const value = content[f.key] ?? f.defaultContent;
          const changed = JSON.stringify(value) !== JSON.stringify(f.defaultContent);
          return (
            <div className="field-card" key={f.key}>
              <div className="label-row">
                <label>{f.label}</label>
                {changed && (
                  <button
                    type="button"
                    className="reset-pill"
                    onClick={() => onReset(f.key, f.defaultContent)}
                  >
                    Reset
                  </button>
                )}
              </div>
              {f.isList ? (
                <ListField
                  items={(content[f.key] as Record<string, unknown>[]) ?? []}
                  itemFields={f.itemFields ?? []}
                  onChange={(items) => onChange(f.key, items)}
                />
              ) : (
                renderField(f, f.key, value, (v) => onChange(f.key, v), upload)
              )}

              {!f.isList &&
                variants
                  .filter((v) => v.id !== 'default')
                  .map((v) => {
                    const vk = `${f.key}@${v.id}`;
                    return (
                      <div className="variant-sub" key={vk}>
                        <span className="variant-tag">{v.label}</span>
                        {renderField(
                          f,
                          vk,
                          content[vk] ?? '',
                          (val) => onChange(vk, val),
                          upload,
                        )}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create `src/editor/components/Preview.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { Content, Field } from '../../shared/types.js';

interface Props {
  siteUrl: string;
  content: Content;
  variant: string;
  onSchema: (
    schema: Field[],
    groups: string[] | undefined,
    variants: { id: string; label: string }[] | undefined,
  ) => void;
}

export function Preview({ siteUrl, content, variant, onSchema }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

  // Push content into the iframe whenever it changes (after ready).
  useEffect(() => {
    if (!readyRef.current) return;
    ref.current?.contentWindow?.postMessage({ type: 'cms-content', content, variant }, '*');
  }, [content, variant]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data as {
        type?: string;
        schema?: Field[];
        groups?: string[];
        variants?: { id: string; label: string }[];
      };
      if (msg?.type === 'cms-schema' && msg.schema) {
        onSchema(msg.schema, msg.groups, msg.variants);
      }
      if (msg?.type === 'cms-ready') {
        readyRef.current = true;
        ref.current?.contentWindow?.postMessage({ type: 'cms-content', content, variant }, '*');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // content/variant intentionally excluded — fresh values read via closure on ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSchema]);

  const src = siteUrl.includes('?') ? `${siteUrl}&cms=preview` : `${siteUrl}?cms=preview`;
  return (
    <div className="preview-pane">
      <iframe ref={ref} src={src} title="Live preview" />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/editor/components/Login.tsx src/editor/components/Sidebar.tsx src/editor/components/Topbar.tsx src/editor/components/Editor.tsx src/editor/components/Preview.tsx
git commit -m "feat: add editor shell components"
```

### Task 3.5: App state machine + wiring

**Files:**
- Modify: `src/editor/main.tsx`
- Create: `src/editor/App.tsx`
- Test: `src/editor/App.test.tsx`

- [ ] **Step 1: Create `src/editor/App.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import type { BrandConfig, Content, ContentMeta, Field } from '../shared/types.js';
import { createApiClient } from './api.js';
import { Login } from './components/Login.js';
import { Topbar, type SaveState, type PublishStatus } from './components/Topbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Editor } from './components/Editor.js';
import { Preview } from './components/Preview.js';

const TOKEN_KEY = 'cms:token';
const UNDO_CAP = 120;

function groupsFromSchema(schema: Field[], ordered?: string[]): string[] {
  const found = Array.from(new Set(schema.map((f) => f.group)));
  if (!ordered) return found;
  return ordered.filter((g) => found.includes(g)).concat(found.filter((g) => !ordered.includes(g)));
}

export function App() {
  const api = useMemo(() => createApiClient('', () => localStorage.getItem(TOKEN_KEY)), []);

  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [schema, setSchema] = useState<Field[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [variants, setVariants] = useState<{ id: string; label: string }[]>([{ id: 'default', label: 'Default' }]);
  const [content, setContent] = useState<Content>({});
  const [publishedSnap, setPublishedSnap] = useState<Content>({});
  const [meta, setMeta] = useState<ContentMeta>({ lastSaved: null, lastPublished: null });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSection, setActiveSection] = useState('');
  const [mode, setMode] = useState('default');
  const [toast, setToast] = useState<string | null>(null);

  const undoStack = useRef<Content[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load brand config once.
  useEffect(() => {
    void api.getConfig().then(setConfig);
  }, [api]);

  // Load draft after auth.
  useEffect(() => {
    if (!token) return;
    void api.getDraft().then((b) => {
      setContent(b.content);
      setMeta(b.meta);
    });
    void api.getPublished().then((b) => setPublishedSnap(b.content));
  }, [api, token]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const onSchema = useCallback(
    (s: Field[], g: string[] | undefined, v: { id: string; label: string }[] | undefined) => {
      setSchema(s);
      const gs = groupsFromSchema(s, g);
      setGroups(gs);
      setActiveSection((cur) => cur || gs[0] || '');
      if (v) setVariants([{ id: 'default', label: 'Default' }, ...v.filter((x) => x.id !== 'default')]);
    },
    [],
  );

  const scheduleSave = useCallback(
    (next: Content) => {
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api
          .saveDraft(next)
          .then((b) => {
            setMeta(b.meta);
            setSaveState('saved');
          })
          .catch(() => setSaveState('error'));
      }, 350);
    },
    [api],
  );

  const applyChange = useCallback(
    (key: string, value: unknown) => {
      setContent((prev) => {
        undoStack.current = [...undoStack.current, prev].slice(-UNDO_CAP);
        const next = { ...prev, [key]: value };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setContent(prev);
    scheduleSave(prev);
  }, [scheduleSave]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const hasChanges = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(publishedSnap),
    [content, publishedSnap],
  );

  const dirtyGroups = useMemo(() => {
    const set = new Set<string>();
    for (const f of schema) {
      if (f.variant) continue;
      if (JSON.stringify(content[f.key]) !== JSON.stringify(publishedSnap[f.key])) set.add(f.group);
    }
    return set;
  }, [schema, content, publishedSnap]);

  const status: PublishStatus = !meta.lastPublished ? 'never' : hasChanges ? 'dirty' : 'published';

  async function login(email: string, password: string) {
    const t = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  async function publish() {
    await api.publish();
    setPublishedSnap(content);
    const b = await api.getDraft();
    setMeta(b.meta);
    flash('Published — your changes are now live');
  }

  async function discard() {
    const b = await api.discard();
    setContent(b.content);
    setMeta(b.meta);
    flash('Draft changes discarded');
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!config) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!token) return <Login config={config} onLogin={login} />;

  return (
    <div className="app">
      <Topbar
        saveState={saveState}
        meta={meta}
        status={status}
        canUndo={undoStack.current.length > 0}
        hasChanges={hasChanges}
        siteUrl={config.siteUrl}
        onUndo={undo}
        onDiscard={() => void discard()}
        onPublish={() => void publish()}
        onSignOut={signOut}
      />
      <div className="workspace">
        <Sidebar
          groups={groups}
          active={activeSection}
          dirtyGroups={dirtyGroups}
          onSelect={setActiveSection}
        />
        <Editor
          group={activeSection}
          fields={schema}
          content={content}
          variants={variants}
          onChange={applyChange}
          onReset={applyChange}
          upload={(file) => api.upload(file)}
        />
        <Preview siteUrl={config.siteUrl} content={content} variant={mode} onSchema={onSchema} />
      </div>
      {variants.length > 1 && (
        <div style={{ position: 'fixed', bottom: 22, left: 22, display: 'flex', gap: 6 }}>
          {variants.map((v) => (
            <button
              key={v.id}
              className={v.id === mode ? 'btn btn-gold' : 'btn'}
              onClick={() => setMode(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/editor/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Write the test — `src/editor/App.test.tsx`**

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';

const config = {
  siteId: 'test-site',
  siteUrl: 'http://localhost/site',
  brand: {
    name: 'Test Co',
    eyebrow: 'TESTING',
    headline: 'Hello *world.*',
    tagline: 'Just a test.',
    accent: '#a87d2e',
    bg: '#16120b',
    logo: null,
  },
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/config')) return new Response(JSON.stringify(config));
      if (url.includes('/api/auth/login')) return new Response(JSON.stringify({ token: 'tok' }));
      if (url.includes('state=draft'))
        return new Response(JSON.stringify({ content: {}, meta: { lastSaved: null, lastPublished: null } }));
      if (url.includes('state=published'))
        return new Response(JSON.stringify({ content: {}, meta: { lastSaved: null, lastPublished: null } }));
      return new Response(JSON.stringify({}));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('shows the branded login then signs in', async () => {
  render(<App />);
  await waitFor(() => screen.getByText('Sign in'));
  await userEvent.type(screen.getByPlaceholderText('Password'), 'letmein');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => screen.getByText('Content Studio'));
  expect(localStorage.getItem('cms:token')).toBe('tok');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/App.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Build the editor SPA**

Run: `npm run typecheck && npm run build:editor`
Expected: typecheck PASS; `dist/admin/index.html` + assets produced.

- [ ] **Step 6: Commit**

```bash
git add src/editor/App.tsx src/editor/main.tsx src/editor/App.test.tsx
git commit -m "feat: wire editor app state machine"
```

---

## Phase 4 — `/cms` Claude Code Skill

Goal: a skill file that, when invoked in a Next.js site, detects the site, scaffolds `cms.config.js`, wires the two `<Script>` tags, annotates editable elements, converts hard-coded lists, and prints a field checklist. Gate: the skill file exists at the documented path and contains all six documented steps.

### Task 4.1: Write the `/cms` skill

**Files:**
- Create: `C:\Users\jay_p\.claude\skills\cms.md`

- [ ] **Step 1: Create the skill file `C:\Users\jay_p\.claude\skills\cms.md`**

````markdown
---
name: cms
description: Wire Content Studio CMS into a Next.js marketing site — scaffold cms.config.js, add the engine script tags, annotate editable elements with data-cms attributes, and convert hard-coded lists to the data-cms-list/template pattern. Use when the user types /cms in a Next.js project directory.
---

# Content Studio — Site Integration (`/cms`)

Wire the Content Studio CMS into the Next.js site in the current working directory. Produce a verifiable checklist of every editable field added. **Never** edit business logic — only add `data-cms*` attributes, the two script tags, and `public/cms.config.js`.

## Step 1 — Detect the site

- Read `package.json` for the project name (used to derive `siteId`).
- Confirm Next.js App Router by checking for `app/layout.tsx` (or `src/app/layout.tsx`). If absent, stop and tell the user this skill targets Next.js App Router sites.
- List section components in `components/` and the page assembly in `app/page.tsx`.

## Step 2 — Scaffold `public/cms.config.js`

Ask the user for the CMS backend URL (the VPS host, e.g. `https://cms.clientdomain.com`). Derive `siteId` from the package name (kebab-cased). Write:

```js
window.CMSConfig = {
  siteId: '<derived-or-confirmed-id>',
  backend: { type: 'api', base: '<vps-url>' },
  // variants and groups are optional; add them only if the site has variant copy
};
```

If the site clearly has audience variants (e.g. groom/bride copy), propose a `variants` array and confirm before writing.

## Step 3 — Wire the script tags

In `app/layout.tsx`, import `next/script` (if not already) and add, inside `<head>` or at the end of `<body>`:

```tsx
import Script from 'next/script'

<Script src="/cms.config.js" strategy="beforeInteractive" />
<Script src="<vps-url>/cms/cms-engine.js" strategy="beforeInteractive" />
```

Use the exact `<vps-url>` captured in Step 2. Do not duplicate the tags if they already exist.

## Step 4 — Annotate editable elements

For each section component, identify editable text, headings, taglines, CTA labels, and images. Add attributes WITHOUT changing the visible content:

```tsx
// Before
<h1>Grooms Get Ready</h1>
// After
<h1 data-cms="hero.headline" data-cms-type="rich" data-cms-label="Headline" data-cms-group="Hero">
  Grooms Get Ready
</h1>
```

Rules:
- `data-cms` key = `section.fieldName` (camelCase field, dotted by section).
- `data-cms-type`: `rich` for headlines/paragraphs with emphasis, `text` for short labels, `image` for `<img>`, `link` for anchors (wrap text + href).
- `data-cms-label`: human label for the editor.
- `data-cms-group`: the section name (Hero, Packages, FAQ, …) — drives the sidebar.
- The existing JSX content stays as the fallback/default — if the CMS is unreachable nothing breaks.

## Step 5 — Convert hard-coded lists

For repeating content (FAQs, testimonials, packages), replace the mapped JSX array with the engine's list pattern:

```tsx
<div data-cms-list="faq" data-cms-label="FAQ items" data-cms-group="FAQ">
  <template data-cms-item>
    <div className="faq-item">
      <div className="faq-q" data-cms-field="q"></div>
      <div className="faq-a" data-cms-field="a" data-cms-type="rich"></div>
    </div>
  </template>
</div>
```

Keep the surrounding section shell rendered by Next.js; the engine renders the items at runtime. Preserve the original markup of one item as the `<template>` contents so styling is identical.

## Step 6 — Output a checklist

Print every field added, grouped by section:

```
Hero
  - hero.headline   (rich)
  - hero.tagline    (text)
  - hero.image      (image)
FAQ
  - faq             (list: q, a)
```

End with: "Review these fields, then deploy the CMS for siteId `<id>` and set its `siteUrl` to this site's URL."
````

- [ ] **Step 2: Verify the file exists and is non-empty**

Run: `ls -l "/c/Users/jay_p/.claude/skills/cms.md" && wc -l "/c/Users/jay_p/.claude/skills/cms.md"`
Expected: file listed, line count > 60.

- [ ] **Step 3: Commit** (skill lives outside the repo, so this commit only records the deliverable note)

```bash
git add docs/superpowers/plans/2026-06-15-content-studio.md
git commit -m "docs: note /cms skill deliverable in plan"
```

> Note: `C:\Users\jay_p\.claude\skills\cms.md` is outside the `website-cms` git repo and is not version-controlled by it. That's expected — the skill is a machine-local Claude Code asset, listed in the spec's Deliverables.

---

## Phase 5 — End-to-End Integration

Goal: prove the whole loop with Playwright — boot the built server, serve a demo annotated site, log in, edit a field, watch the preview repaint, publish, and confirm published content over the API. Gate: `npm run test:e2e` passes.

### Task 5.1: Playwright config + demo client site fixture

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/site/index.html`
- Create: `tests/e2e/fixtures/site/cms.config.js`
- Modify: `src/server/index.ts` (serve the demo site under `/site` in test/dev)

- [ ] **Step 1: Create `tests/e2e/fixtures/site/cms.config.js`**

```js
window.CMSConfig = {
  siteId: 'test-site',
  backend: { type: 'api', base: '' },
  groups: ['Hero'],
};
```

- [ ] **Step 2: Create `tests/e2e/fixtures/site/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Demo Site</title>
    <script src="/site/cms.config.js"></script>
    <script src="/cms/cms-engine.js"></script>
  </head>
  <body>
    <section data-cms-group="Hero">
      <h1 data-cms="hero.headline" data-cms-type="rich" data-cms-label="Headline" data-cms-group="Hero">
        Default Headline
      </h1>
    </section>
  </body>
</html>
```

- [ ] **Step 3: Serve the demo site from the server.** Add this line to `createApp()` in `src/server/index.ts`, immediately before `return app;`:

```ts
  app.use('/site', express.static(path.resolve(process.cwd(), 'tests/e2e/fixtures/site')));
```

- [ ] **Step 4: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const PORT = 4099;
process.env.CMS_PASSWORD = bcrypt.hashSync('letmein', 10);

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'node dist/server/index.js',
    port: PORT,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      JWT_SECRET: 'e2e-secret',
      CMS_PASSWORD: bcrypt.hashSync('letmein', 10),
      CMS_SITE_CONFIG: path.resolve(process.cwd(), 'cms.site.e2e.json'),
      CMS_DATA_DIR: path.resolve(process.cwd(), '.e2e-data'),
    },
  },
});
```

- [ ] **Step 5: Create `cms.site.e2e.json`** (points `siteUrl` at the served demo site)

```json
{
  "siteId": "test-site",
  "siteUrl": "http://localhost:4099/site",
  "brand": {
    "name": "E2E Co",
    "eyebrow": "E2E",
    "headline": "End to *end.*",
    "tagline": "Prove it works.",
    "accent": "#a87d2e",
    "bg": "#16120b",
    "logo": null
  }
}
```

- [ ] **Step 6: Add `.e2e-data/` and `cms.site.e2e.json` handling.** Append `.e2e-data/` to `.gitignore` (keep `cms.site.e2e.json` committed). Edit `.gitignore`:

```
.e2e-data/
```

- [ ] **Step 7: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: chromium downloaded.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures cms.site.e2e.json src/server/index.ts .gitignore
git commit -m "test: add playwright config and demo site fixture"
```

### Task 5.2: E2E happy-path spec

**Files:**
- Create: `tests/e2e/content-studio.spec.ts`

- [ ] **Step 1: Write the spec — `tests/e2e/content-studio.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('login → edit → preview updates → publish → published API reflects change', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');

  // Login
  await page.getByPlaceholder('Password').fill('letmein');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Content Studio')).toBeVisible();

  // Edit the headline (the first text/rich card in the Hero group).
  const headline = page.locator('.field-card textarea, .field-card input[type="text"]').first();
  await headline.fill('Brand New Headline');

  // Preview iframe repaints with the new value.
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.locator('[data-cms="hero.headline"]')).toHaveText('Brand New Headline');

  // Publish.
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published — your changes are now live')).toBeVisible();

  // Published API reflects the change.
  const res = await request.get('/api/content?state=published');
  const body = await res.json();
  expect(body.content['hero.headline']).toBe('Brand New Headline');
});
```

- [ ] **Step 2: Build everything, then run E2E**

Run: `npm run build && npm run test:e2e`
Expected: build succeeds; Playwright spec PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/content-studio.spec.ts
git commit -m "test: add end-to-end happy-path spec"
```

### Task 5.3: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the entire unit suite**

Run: `npm test`
Expected: all suites PASS (config, store, auth, server integration, discovery, bind, local adapter, fields, api, App).

- [ ] **Step 2: Typecheck and full build**

Run: `npm run typecheck && npm run build`
Expected: PASS; `dist/cms/cms-engine.js`, `dist/admin/`, `dist/server/index.js` all present.

- [ ] **Step 3: Run E2E**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: content studio v1 complete — all gates green"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Architecture (3 layers, unified package) | Phases 0–3; file structure |
| File structure | Phase 0 layout + each phase's files |
| `cms.site.json` / `.env` / `cms.config.js` | Tasks 0.5, 5.1; `.env.example`; `siteUrl` gap noted |
| Data model (flat keys, `@variant`, list arrays) | Tasks 1.2 (store), 2.1–2.2 (discover/bind) |
| API (public + authed + auth + static) | Tasks 1.1, 1.5–1.8 |
| Auth (bcrypt, JWT 30-day, Bearer, public GET) | Tasks 1.3–1.5, 1.8 |
| Engine discovery & binding (types, list, variant) | Tasks 2.1–2.2 |
| Backend adapters (local/api swap) | Task 2.3 |
| Mode detection (`?cms=preview` vs live) | Task 2.4 |
| Editor app state keys | Task 3.5 (`App.tsx` mirrors the spec's state table; `device`/`previewOpen` simplified — see gaps) |
| Components (Login/Topbar/Sidebar/Editor/Preview) | Tasks 3.4–3.5 |
| Field components (Text/Rich/Image/Link/List) | Task 3.3 |
| Interactions (autosave 350ms, live preview, undo, reset, publish, discard) | Task 3.5 |
| Design tokens | Task 3.1 (verbatim) |
| Build & deployment scripts | Tasks 0.1, 0.4; `build:server` gap noted |
| Integration with Next.js | Phase 4 skill + Task 5.1 fixture |
| `/cms` skill (6 steps) | Task 4.1 |
| Testing (Vitest/jsdom, Supertest, Playwright) | Phases 1–3 units + Phase 5 E2E |
| Deliverables (package, skill, spec) | All phases + Task 4.1 |

**Known simplifications (deliberate, to keep v1 scoped):**
- **`device` (desktop/mobile) preview toggle and `previewOpen` mobile slide-over** from the spec's state table are not implemented in Task 3.5. The 390px phone-frame preview and mobile slide-over are visual polish; the responsive CSS in Task 3.1 collapses the layout but does not render the bezel. Add as a follow-up if the client wants the mobile preview.
- **`select` and `boolean` field widgets** are discovered and bound by the engine but the editor renders them via `TextField` fallback (no dedicated dropdown/toggle card). The spec lists these types in the attribute table but does not specify their editor widgets; wire dedicated widgets if/when a site uses them.
- **`storage`-event cross-tab repaint** is implemented for the local adapter only (Task 2.4), matching the spec's note that it does not apply to the API adapter.
- **Variant DOM sections** (`data-cms-variant` on a whole element to show/hide per variant) are out of scope; variants are handled as per-key value overrides (`key@variant`), which covers the spec's `hero.headline@bride` example.

**Placeholder scan:** No `TODO`/`TBD`/"implement later" steps. Every code step contains complete, runnable code. One handler in Task 1.6 ships with an explicit correction block (the published-GET `await`) so the executor uses the corrected version — not a placeholder.

**Type consistency:** `Field`, `Content`, `Bucket`, `ContentMeta`, `BrandConfig` are defined once in `src/shared/types.ts` (Task 0.3) and imported everywhere. Adapter shape `CMSAdapter` is defined in `local.ts` and reused by `api.ts`. `SaveState`/`PublishStatus` are defined in `Topbar.tsx` and imported by `App.tsx`. Message types (`cms-schema`, `cms-ready`, `cms-content`, `cms-scroll`) match between engine `index.ts` (Task 2.4) and `Preview.tsx` (Task 3.4).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-content-studio.md`.**

> **Phase 4 deliverable produced:** the `/cms` integration skill was written to `C:\Users\jay_p\.claude\skills\cms.md` (machine-local Claude Code asset, not version-controlled here). 93 lines, all six steps present.
````
