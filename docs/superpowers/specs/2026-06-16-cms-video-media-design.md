# Content Studio — Video & Media Editing Design Spec

**Date:** 2026-06-16
**Status:** Draft (awaiting user review)
**Supersedes nothing.** Extends `2026-06-15-content-studio-design.md`.

---

## Problem

The client must be able to change **images and videos** on their site. Investigation showed:

- **Image upload is already fully built and wired** end-to-end: `ImageField` → `api.upload()` → `POST /api/uploads` (multer, disk) → `{ url }`; `paintElement('image')` sets `<img>.src` or `backgroundImage`; `Editor.tsx` dispatches `case 'image'`. It is invisible only because the editor is **schema-driven** — it renders only the fields the engine discovers in the live DOM, and no site has had media elements annotated yet.
- **Video is genuinely unsupported.** `FieldType` has no `'video'`; `paintElement` has no video branch; there is no `VideoField`; the multer limit (8 MB) is too small for video.

So the work is: **add a first-class `video` field type to the generic CMS**, supporting upload, direct file URL, and YouTube/Vimeo embeds; prove it against the CMS's own fixtures; and make per-site tailoring (annotation) automated via the `/cms` skill. The CMS is a generic product — `fitness-camp-v4` is only a sandbox to smoke-test it, not a deliverable.

---

## Scope

**In scope**
1. `video` field type across the stack (engine, editor, uploads).
2. Video supports three inputs through **one field**: uploaded file, direct file URL, YouTube/Vimeo embed.
3. Raise/validate upload limits and MIME types for video.
4. Self-contained automated coverage in the CMS repo (engine unit, server, E2E fixture).
5. Update the `/cms` skill to auto-annotate `<video>`/`.mp4` and image elements.
6. Light manual smoke test against `fitness-camp-v4` (disposable).

**Out of scope (YAGNI)**
- Server-side transcoding / thumbnail generation.
- Multiple resolutions / adaptive streaming authoring (a direct HLS/CDN URL still works as a file URL).
- Per-video aspect-ratio detection for embeds (engine assumes 16:9; container-aware cover still fills the wrapper correctly — only the crop framing assumes 16:9. Vertical Shorts/portrait embeds may crop wider than ideal).
- Per-site annotation of `fitness-camp-v4` as a product deliverable.

---

## Approach (chosen: A — single URL string + paint-time classification)

The video field value is a **plain string URL**, identical in shape to the image field. The engine classifies it at paint time and renders the correct markup into the annotated **wrapper** element. The editor offers Upload *and* URL input, both resolving to that one string.

Rejected: **B** (structured `{kind, src}`) — heavier data model, breaks the plain-string convention, more UI. **C** (separate `video` + `embed` types) — forces the client to choose markup; contradicts "one field, upload or URL".

---

## Data Model

A `video` field stores a string, stored exactly like `image` (no new container shape):

```jsonc
{
  "hero.video": "/uploads/grooms-get-ready/hero-1718.mp4",  // uploaded
  // or "https://cdn.example.com/hero.mp4"                   // direct file/HLS
  // or "https://youtu.be/dQw4w9WgXcQ"                       // youtube
  // or "https://vimeo.com/76979871"                         // vimeo
}
```

Absent key → engine restores the author's original markup (existing `captureOriginal`/`restoreOriginal` mechanism in `bind.ts`).

---

## Engine

### `shared/types.ts`
- `FieldType` gains `'video'`: `'text' | 'rich' | 'image' | 'video' | 'link' | 'boolean' | 'select'`.

### `engine/bind.ts`

**New pure function `classifyVideo(url: string)`** → `{ kind: 'youtube' | 'vimeo' | 'file'; src: string }`:
- YouTube (`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`) → `kind: 'youtube'`, `src = https://www.youtube.com/embed/ID?autoplay=1&mute=1&loop=1&playlist=ID&controls=0&playsinline=1&modestbranding=1&rel=0`.
- Vimeo (`vimeo.com/ID`, `player.vimeo.com/video/ID`) → `kind: 'vimeo'`, `src = https://player.vimeo.com/video/ID?autoplay=1&muted=1&loop=1&background=1`.
- Anything else → `kind: 'file'`, `src = url` (covers `/uploads/...`, CDN `.mp4`/`.webm`, `.m3u8`).

**`paintElement(wrapperEl, 'video', value)`** (existing signature is `(el, type, value)`) treats the annotated element as a media **host/wrapper**:
- `file`: ensure a single child `<video autoplay loop muted playsinline>` that covers the wrapper (`width/height:100%; object-fit:cover`); if its current `getAttribute('src')` ≠ `value`, set `src`, remove any `<source>`/`<iframe>` siblings, and call `.load()`. Carry over `aria-hidden` if present on the original.
- `youtube`/`vimeo`: ensure a single child cover-scaled `<iframe>` (allow `autoplay; encrypted-media`, `frameborder=0`) whose `src` equals the computed embed `src`.
- **Idempotency is determined by inspecting the current DOM** (does the wrapper already contain a `<video>`/`<iframe>` with the right `src`?), **not a stored flag**. This is required so the feature cooperates with the sticky binder: Next/React hydration reverts the wrapper's children to server markup, the sticky binder re-fires, and the engine must rebuild only when the live DOM actually differs (prevents iframe reload flicker once stable). Matches the existing declarative bind contract (commits `ea600ca`/`0153e8a`/`15a9b82`).
- Absent value: handled by `restoreOriginal` (innerHTML captured before first paint), which puts the hand-authored `<video>` back.

**Embed cover styling (container-aware):** the wrapper gets `position:relative; overflow:hidden`. A pure, unit-testable `coverSize(containerW, containerH, aspectRatio = 16/9) → { w, h }` computes the iframe dimensions that fully fill the wrapper while preserving the embed's aspect ratio (cropping overflow), centered via `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%)`. The engine measures the wrapper with `getBoundingClientRect()` at paint time and attaches a `ResizeObserver` to recompute on container resize, so cover holds at any size (not just full-bleed). A `WeakMap<HTMLElement, ResizeObserver>` tracks one observer per wrapper; the prior observer is disconnected before any rebuild and on `restoreOriginal`/switch-to-`file` so none leak. The `file` case needs no JS sizing — native `object-fit:cover` on the `<video>` handles it.

**Sticky observer:** `STICKY_OBSERVE` already watches `childList` + `attributeFilter:['src','href']` on `<body>` subtree — video paints (childList + `src`) are already covered; **no observer change needed**.

### `engine/discovery.ts`
- `readElement('video', el)` returns the current source as default: prefer the wrapper's inner `<video>`'s `src`/`<source>.src`, else `''`. Keeps the hand-authored video as the default when the CMS is unreachable.

---

## Editor

### `editor/components/fields/VideoField.tsx` (new)
Props mirror `ImageField`: `{ value, onChange, upload }`.
- Two modes via a small segmented toggle: **Upload** and **URL**.
  - **Upload:** drag/drop + click, `accept="video/*"`, busy/error states, calls `upload(file)` → sets the returned URL string. Same UX/markup language as `ImageField`.
  - **URL:** a text input (placeholder: "Paste a video URL — file, YouTube, or Vimeo"), debounced `onChange`.
- **Preview:** if value classifies as `file` → small muted `<video>` preview; if `youtube`/`vimeo` → a compact platform badge + the URL (no autoplay in the editor card). Reuses `classifyVideo` (shared from engine) so editor and engine agree.

### `editor/components/Editor.tsx`
- `renderField` gains `case 'video': return <VideoField value={String(value ?? '')} onChange={onChange} upload={upload} />;` (variant sub-fields already pass `upload` through — no extra wiring).

---

## Uploads (`server/routes/uploads.ts`)

- Limit becomes `process.env.CMS_UPLOAD_MAX_MB` (default **64**) × 1 MB instead of the hard-coded 8 MB.
- Add a multer `fileFilter` accepting only `image/*` and `video/*` MIME types; reject others with a 400 (`{ error: 'unsupported file type' }`).
- Multer's `LIMIT_FILE_SIZE` (and filter rejections) surface as a clean `413`/`400` JSON via the existing error path; `VideoField` shows "Upload failed…". Keep returning `{ url }`.
- `/uploads/*` static serving already serves any file type — no change. Express `json({limit:'1mb'})` is irrelevant (multipart is handled by multer).

---

## Per-Site Tailoring — `/cms` skill update

The skill is the generic→specific bridge. Extend its annotation step so any site can be tailored:
- A `<video>` (esp. with `<source src="*.mp4">`) → wrap in a positioned `<div data-cms-type="video" data-cms-label data-cms-group>` keeping the `<video>` inside as the default/fallback.
- An `<img>` → annotate as `data-cms-type="image"`.
- A CSS-background placeholder element (e.g. a styled box used as a hero/photo slot) → annotate as `data-cms-type="image"` (engine paints `backgroundImage`).
- Emit these in the skill's output checklist alongside text fields.

---

## Smoke Test — `fitness-camp-v4` (disposable)

Run the updated skill (or hand-apply) on:
- **Hero** (`Hero.tsx`): wrap `<video class="hero-video">` in an annotated `data-cms-type="video"` wrapper (positioned `inset:0`); make `.ph hero-ph` an editable poster `data-cms-type="image"`.

Purpose: confirm video swap (upload + a YouTube URL) and image paint work in a real Next.js app with hydration. Not committed as a product feature; no `BeforeAfter` refactor or full-site annotation.

---

## Testing (TDD)

| Layer | Tool | Cases |
|-------|------|-------|
| Engine | Vitest + jsdom | `classifyVideo`: youtube long/short/shorts, vimeo, direct `.mp4`, HLS, garbage → file. `coverSize`: wide container, tall container, square, equal-AR (no crop). `paintElement('video')`: file → `<video src>` + `.load`; youtube → iframe w/ embed src; idempotent re-paint (same src → no rebuild, asserted via stable node identity); embed paint attaches a `ResizeObserver` and disconnects it on switch-to-file/`restoreOriginal` (no leak across re-paint); absent → `restoreOriginal`. `discovery.readElement('video')` reads inner source. |
| Server | Supertest | uploads: video under limit → `{url}`; over limit → 413; non-media MIME → 400; image still works. |
| Editor | Vitest + RTL | `VideoField`: Upload mode calls `upload` and sets URL; URL mode sets value; preview switches by classification; toggle works. |
| E2E | Playwright | Fixture site (`tests/e2e/fixtures/site`) gains a `data-cms-type="video"` wrapper + an `image` field; flow: login → set video URL → preview shows iframe/video → publish → `GET /api/content?state=published` contains the value. |

All existing tests stay green. Follow the project's existing test style.

---

## Files Touched

- `src/shared/types.ts` — add `'video'` to `FieldType`.
- `src/engine/bind.ts` — `classifyVideo`, `paintElement` video branch, embed cover style injection.
- `src/engine/discovery.ts` — `readElement` video case.
- `src/editor/components/fields/VideoField.tsx` — new.
- `src/editor/components/Editor.tsx` — dispatch `case 'video'`.
- `src/server/routes/uploads.ts` — size env + MIME `fileFilter`.
- `tests/...` — engine, server, editor, E2E fixture additions.
- `C:\Users\jay_p\.claude\skills\cms\SKILL.md` — annotation guidance for video/images.
- `.env.example` — document `CMS_UPLOAD_MAX_MB`.
- (smoke only, uncommitted-as-feature) `fitness-camp-v4/components/Hero.tsx`.

---

## Error Handling

- Upload failure (size/type/network) → `VideoField` shows "Upload failed. Please try again." (mirrors `ImageField`); server returns structured 400/413 JSON.
- Malformed/unrecognized URL → `classifyVideo` falls back to `kind: 'file'`; if it isn't a playable media URL the `<video>` simply shows nothing and the original poster/markup remains visible — nothing breaks.
- CMS unreachable on the live site → no `video` key painted → hand-authored `<video>` stays (graceful default).
```