# Content Studio CMS — Analysis

**Date:** 2026-06-16
**Reviewed against:** the design spec (`docs/superpowers/specs/2026-06-15-content-studio-design.md`), the implementation plan, and the original Claude Design handoff + reference implementation (`Downloads/content-studio/design_handoff_content_studio_cms/`).

---

## TL;DR

The **architecture is sound and faithful to the brief** — the engine, server, data model, and generic discovery model are well built and well tested. What's wrong is almost entirely **front-end fidelity and a few engine metadata gaps**: Claude Code built a *functionally correct but visually stripped-down* editor. The polished interface in your screenshots (fonts, preview toolbar, device toggle, icons, drop zones, helper text, branded chrome) was largely not ported. Two named deliverables — the `/cms` skill and any integration docs — are also missing.

Think of it as: the **plumbing is ~85% there, the styling/UX layer is ~35% there, and the packaging layer (skill + docs) is ~0%.**

---

## How it functions

It's a single npm package that produces three independently-deployed pieces, one deploy per client site.

**1. `cms-engine.js` (vanilla TS → IIFE bundle, `src/engine/`)**
Dropped onto the client's live website via a script tag. On load it reads `window.CMSConfig`, scans the DOM for `[data-cms]` / `[data-cms-list]` elements, and builds a schema (`discovery.ts`). Then it branches on mode:

- `?cms=preview` → listens for `postMessage` from the editor and repaints the page live; reports the discovered schema back to the editor.
- Live site → fetches published content from the API and paints it.

It uses a **sticky binder** (a `MutationObserver`) so content survives a framework re-hydration clobbering the DOM after first paint — a genuinely thoughtful touch (`bind.ts`).

**2. Editor SPA (React + Vite, `src/editor/`)**
Identical across all clients. Fetches `/api/config` for branding, logs in, loads the draft, and renders **whatever schema the preview iframe reports** — so adding an editable field on any site requires zero editor changes. Edits debounce 350 ms → autosave draft; live changes are pushed into the preview iframe by `postMessage`.

**3. Express server (`src/server/`)**
One PM2 process per client. Serves the engine bundle + editor SPA + a JSON API. Content is stored as two flat JSON files per site (`data/{siteId}/draft.json`, `published.json`) — no database. Auth is a single bcrypt-hashed password → 30-day JWT; published reads are public, all writes require the token. Images upload to `public/uploads/{siteId}/` and only the URL is stored.

**Data model:** flat object keyed by the `data-cms` value, `key@variant` for variants (e.g. `hero.headline@bride`), arrays for lists. This all matches the spec.

The generic model is the right one (attribute-driven discovery, not hand-written selectors), and it's implemented correctly. Video support (file / YouTube / Vimeo) was even added beyond the original spec.

---

## What's good

- **Clean, typed, ESM throughout**; strict TS; typecheck passes.
- **Test-first structure** — unit tests for discovery, bind, adapters, store, auth; Supertest API integration tests; a Playwright E2E harness exists.
- **Solid engine**: sticky binder for hydration, clean local/api adapter split, variant + list binding all work.
- **Sensible server**: refuses to boot without `JWT_SECRET`/`CMS_PASSWORD`, JSON error handler, per-site namespacing, upload size cap.
- The separation that makes it "install on any site" is real and working.

---

## What's missing — the reason it doesn't look like the design

The reference implementation's admin CSS is ~210 lines of bespoke styling plus Google Fonts. The build ships **102 lines of CSS, no web fonts, and no icons.** That single fact explains most of the visual gap. Concretely:

| Area | In your screenshots (reference) | In the build | 
|---|---|---|
| **Typography** | Cormorant Garamond (serif display) + Jost for eyebrows/labels | System font only — no fonts loaded at all |
| **Topbar** | Two-line brandmark (client name in serif + "Content Studio"), save **spinner/check**, **avatar** circle, dark "Publish 🚀" primary, dotted status pill in a bordered group | Plain text "Content Studio", text "Sign out" button, gold publish button, simple coloured chip; **no client name, no avatar, no spinner, no icons** |
| **Sidebar** | "HOME PAGE SECTIONS" caption, an **icon per section**, a footer help note ("Changes save automatically… Hit Publish to go live") | Bare text buttons + a dot; no caption, no icons, no note |
| **Editor** | Per-section **blurb** ("The first thing visitors see…") and per-field **hints** ("New line = line break · wrap a word in \*stars\*…") | Generic blurb ("Edit the {group} section…"); **field hints not rendered at all** |
| **Bride variant** | Styled pink dashed "BRIDE-MODE VERSION" card | Thin left-border with a tiny tag |
| **Image field** | 132px drop zone with upload icon, image preview as background, drag-highlight, hover "Replace"/remove | Thin dashed box, "Drop an image or click to upload", no icon, no drag state, no remove |
| **Preview** | Toolbar: pulsing "● Live draft preview", Groom/Bride **segmented toggle**, **Desktop/Mobile** device toggle, **refresh**; plus a **390px mobile phone-frame** with bezel and hatched backdrop | **Bare iframe.** No toolbar, no device toggle, no mobile frame, no refresh. The variant toggle is a floating button bottom-left |
| **Login** | Labelled fields, lede ("Welcome back…"), "Sign in to Content Studio", demo helper, three-part brand panel (logo / headline / tagline) with gold glow | Placeholder-only inputs, "Sign in", no lede, no demo note, simpler brand panel |
| **Toast** | Icon + slide-in animation | Plain pill |

Everything in the "reference" column exists in the handoff source (`reference-implementation/admin/index.html` CSS and `cms-app.jsx` / `cms-fields.jsx`). It simply wasn't carried across. The brief (`CLAUDE-CODE-PROMPT.md`) explicitly said *"Keep the editor's visual design from the prototype… Reuse the field-editor components and icon set from `admin/cms-fields.jsx`."* That instruction was largely not followed.

---

## Functional gaps (vs. the approved spec)

These are behaviours the spec promised that aren't wired up:

1. **Device toggle (desktop/mobile preview):** spec lists `device` in App state. It's entirely absent — no state, no UI, no mobile frame.
2. **Click-section-to-scroll preview:** the engine *handles* a `cms-scroll` message, but the editor never sends one. Selecting a sidebar section doesn't move the preview.
3. **Reset-to-default flash:** spec says resetting a field flashes the element in the preview. No flash message is sent or handled.
4. **Field hints & section blurbs are not part of the discovery model.** Discovery captures `key/type/label/group` but **not** `data-cms-hint`, section descriptions, or section icons. So even with attributes, you currently *cannot* reproduce the design's helper text — this is a genericity gap, not just CSS.
5. **`boolean` / `select` widgets:** the engine reads `boolean`, but the editor has no widget for either (select is explicitly deferred). Show/hide-a-section and layout-variant editing aren't usable yet.
6. **Bride/variant defaults:** variant sub-fields initialise blank (`content[vk] ?? ''`) instead of inheriting the base field's default, so a variant field looks empty in the editor while the preview shows the base text.

---

## Missing deliverables

- **The `/cms` skill.** Spec deliverable #2 was `~/.claude/skills/cms.md` — the skill that annotates a Next.js site with `data-cms` attributes so the CMS can attach to it. It isn't in the project, and isn't in the skills directory visible here. This is the piece that makes it "tailor to any website," so it matters most for your stated use case. (If it lives elsewhere on your machine, point me at it and I'll review it.)
- **No README / integration guide.** There's nothing documenting the three-step install (config file + script tags + attributes), env setup, the bcrypt-hash generation step, or per-client deployment. A new client site can't be onboarded from the repo as-is.

---

## Code quality & correctness notes

- **Tests don't run in a fresh checkout here** because `node_modules` was installed on Windows and is missing the Linux Rollup binary (`@rollup/rollup-linux-x64-gnu`). Not a code bug, but do a clean `npm ci` on any Linux deploy host. Typecheck passes cleanly.
- **Rich-text XSS surface:** `renderRich` (in `bind.ts`) does `*x*`→`<em>` and `\n`→`<br>` and writes via `innerHTML` **without escaping first**. The handoff's own security note (`GENERIC-CMS.md`) explicitly warned to escape or run DOMPurify. Risk is limited (the editor is the trusted site owner), but stored markup like `<script>` would execute. Worth escaping.
- **Uploads:** no server-side MIME validation — the route accepts any file under 8 MB, not just images/video. `multer@1.x` is deprecated and has known advisories; consider `multer@2` or an alternative.
- **Login hardening:** single shared password with no rate limiting → brute-forceable. `cors()` is fully open. Tokens are Bearer (not cookies), so CSRF risk is low, but tightening CORS origin is cheap.
- **No publish history/rollback** despite timestamps being stored — the roadmap suggested keeping N published snapshots for one-click revert.

---

## Recommended path forward (prioritised)

**P1 — Visual parity (the bulk of your complaint).** Port the reference CSS and load the two Google Fonts; lift the icon set and field components from `cms-fields.jsx`. Rebuild Topbar (branded two-line mark, avatar, save spinner/check, icon buttons), Sidebar (caption + per-section icons + footer note), Login (labels, lede, demo note, three-part brand panel), ImageField (real drop zone), and the bride/variant card.

**P2 — Preview & interaction parity.** Add the preview toolbar with the Groom/Bride and Desktop/Mobile segmented toggles, the mobile phone-frame stage, and a refresh button; add `device` state; wire `cms-scroll` on section select and the reset flash.

**P3 — Close the genericity gaps.** Extend discovery to capture `data-cms-hint` and section-level metadata (label/blurb/icon) — via attributes or an optional `cms.config.js` map — so the polished helper text is reproducible on any site. Add `boolean`/`select` widgets. Fix variant default inheritance.

**P4 — Ship the packaging.** Write the `/cms` skill and a README/integration guide (config + script tags + attribute annotation + env + per-client deploy). Then the "attach to any website" workflow actually exists end-to-end.

**P5 — Hardening.** Escape rich text (or DOMPurify), validate upload MIME types server-side, add login rate limiting, tighten CORS, and add a small publish-history/rollback.

The good news: because the engine/server/data model are solid and the original design source is fully available in your Downloads handoff, P1–P2 are mostly a disciplined **port of existing CSS/components**, not new design work.
