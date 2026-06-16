# CMS Video & Media Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `video` field type to the Content Studio CMS that supports uploaded files, direct file URLs, and YouTube/Vimeo embeds, painted into an annotated wrapper with container-aware cover scaling.

**Architecture:** A `video` field stores a plain string URL (same shape as `image`). A new pure module `engine/video.ts` classifies the URL (`youtube`/`vimeo`/`file`) and computes cover dimensions; `bind.ts` renders a native `<video>` (file) or a cover-scaled `<iframe>` (embed) into the annotated wrapper, idempotently and cooperating with the existing sticky binder. The editor gets a `VideoField` (Upload + URL modes), and the uploads route gains a configurable size cap + image/video MIME filter. Reusable per-site tailoring lives in the `/cms` skill.

**Tech Stack:** TypeScript, Vite (engine IIFE + editor SPA), Express + multer, React 18, Vitest + jsdom + Testing Library, Supertest, Playwright.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/engine/video.ts` | Pure helpers: `classifyVideo`, `coverSize` (shared by engine + editor) | Create |
| `src/engine/video.test.ts` | Unit tests for the pure helpers | Create |
| `src/shared/types.ts` | Add `'video'` to `FieldType` | Modify |
| `src/engine/discovery.ts` | `readElement` reads a video wrapper's source as default | Modify |
| `src/engine/bind.ts` | `paintElement` video branch + embed `ResizeObserver` lifecycle | Modify |
| `src/engine/video.bind.test.ts` | Video paint tests (file, embed, idempotency, restore/leak) | Create |
| `src/editor/components/fields/VideoField.tsx` | Upload + URL field with preview | Create |
| `src/editor/components/Editor.tsx` | Dispatch `case 'video'` | Modify |
| `src/editor/components/fields/fields.test.tsx` | VideoField tests | Modify |
| `src/editor/components/Editor.test.tsx` | Editor video dispatch test | Create |
| `src/server/routes/uploads.ts` | Per-request multer, size env, MIME filter, error mapping | Modify |
| `src/server/index.test.ts` | Upload video/limit/MIME tests | Modify |
| `tests/fixtures/discovery.html` | Add a video wrapper field | Modify |
| `tests/e2e/fixtures/site/index.html` | Add a video field to the demo site | Modify |
| `tests/e2e/content-studio.spec.ts` | E2E: set video URL → preview embed → publish | Modify |
| `.env.example` | Document `CMS_UPLOAD_MAX_MB` | Modify |
| `C:\Users\jay_p\.claude\skills\cms\SKILL.md` | Teach the skill to annotate video + background-image media | Modify |
| `../website-build/fitness-camp-v4/components/Hero.tsx` | Disposable smoke wiring | Modify (sandbox) |

**Branch first.** This work targets a feature branch (e.g. `cms-video`), not `master`.

---

### Task 1: `classifyVideo` — URL classification (pure)

**Files:**
- Create: `src/engine/video.ts`
- Test: `src/engine/video.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { classifyVideo } from './video.js';

describe('classifyVideo', () => {
  it('classifies a youtube watch URL and builds a background embed src', () => {
    const r = classifyVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('youtube.com/embed/dQw4w9WgXcQ');
    expect(r.src).toContain('autoplay=1');
    expect(r.src).toContain('mute=1');
    expect(r.src).toContain('loop=1');
    expect(r.src).toContain('playlist=dQw4w9WgXcQ');
  });

  it('classifies youtu.be short links', () => {
    expect(classifyVideo('https://youtu.be/dQw4w9WgXcQ?t=10').kind).toBe('youtube');
  });

  it('classifies youtube shorts', () => {
    const r = classifyVideo('https://www.youtube.com/shorts/abc123_DEF');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('embed/abc123_DEF');
  });

  it('classifies vimeo and builds a background embed src', () => {
    const r = classifyVideo('https://vimeo.com/76979871');
    expect(r.kind).toBe('vimeo');
    expect(r.src).toContain('player.vimeo.com/video/76979871');
    expect(r.src).toContain('background=1');
  });

  it('treats direct file and HLS URLs as files (src unchanged)', () => {
    expect(classifyVideo('/uploads/site/hero.mp4')).toEqual({ kind: 'file', src: '/uploads/site/hero.mp4' });
    expect(classifyVideo('https://cdn.example.com/a.m3u8').kind).toBe('file');
  });

  it('treats empty/garbage as a file', () => {
    expect(classifyVideo('').kind).toBe('file');
    expect(classifyVideo('not a url').kind).toBe('file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/video.test.ts`
Expected: FAIL — "Failed to resolve import './video.js'" / `classifyVideo is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/video.ts
export type VideoKind = 'youtube' | 'vimeo' | 'file';

export interface VideoSource {
  kind: VideoKind;
  /** Embeds: iframe src with background params. Files: the URL unchanged. */
  src: string;
}

const YT_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

export function classifyVideo(url: string): VideoSource {
  const u = (url ?? '').trim();

  const yt = u.match(YT_RE);
  if (yt) {
    const id = yt[1];
    return {
      kind: 'youtube',
      src:
        `https://www.youtube.com/embed/${id}` +
        `?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0`,
    };
  }

  const vm = u.match(VIMEO_RE);
  if (vm) {
    return {
      kind: 'vimeo',
      src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&loop=1&background=1`,
    };
  }

  return { kind: 'file', src: u };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/video.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/video.ts src/engine/video.test.ts
git commit -m "feat(engine): classifyVideo for upload/url/youtube/vimeo"
```

---

### Task 2: `coverSize` — container-aware cover math (pure)

**Files:**
- Modify: `src/engine/video.ts`
- Test: `src/engine/video.test.ts`

- [ ] **Step 1: Write the failing test (append to `video.test.ts`)**

```ts
import { coverSize } from './video.js'; // add to existing import line

describe('coverSize', () => {
  it('fills width when the container is wider than the aspect ratio', () => {
    // container 1600x400 (AR 4) vs 16:9 (~1.78) → match width, overflow height
    expect(coverSize(1600, 400)).toEqual({ w: 1600, h: 900 });
  });

  it('fills height when the container is taller/narrower', () => {
    const r = coverSize(400, 1600); // AR 0.25 → match height, overflow width
    expect(r.h).toBe(1600);
    expect(r.w).toBeCloseTo((1600 * 16) / 9, 3);
  });

  it('matches both dims when the container is already 16:9 (no crop)', () => {
    const r = coverSize(1920, 1080);
    expect(r.w).toBeCloseTo(1920, 3);
    expect(r.h).toBeCloseTo(1080, 3);
  });

  it('returns the input unchanged for a zero-size container', () => {
    expect(coverSize(0, 0)).toEqual({ w: 0, h: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/video.test.ts`
Expected: FAIL — `coverSize is not a function`.

- [ ] **Step 3: Add the implementation to `video.ts`**

```ts
export function coverSize(
  containerW: number,
  containerH: number,
  aspectRatio = 16 / 9,
): { w: number; h: number } {
  if (containerW <= 0 || containerH <= 0) return { w: containerW, h: containerH };
  const containerAR = containerW / containerH;
  // Wider than the media → lock width, let height overflow (crop top/bottom).
  if (containerAR > aspectRatio) return { w: containerW, h: containerW / aspectRatio };
  // Taller/narrower → lock height, let width overflow (crop left/right).
  return { w: containerH * aspectRatio, h: containerH };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/video.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/engine/video.ts src/engine/video.test.ts
git commit -m "feat(engine): coverSize container-aware cover dimensions"
```

---

### Task 3: `video` FieldType + discovery default

**Files:**
- Modify: `src/shared/types.ts:1`
- Modify: `src/engine/discovery.ts:18-34` (`readElement`)
- Modify: `tests/fixtures/discovery.html`
- Test: `src/engine/discovery.test.ts`

- [ ] **Step 1: Add a video wrapper to the shared fixture `tests/fixtures/discovery.html`** (append before the closing of the list div — final file shown):

```html
<section data-cms-group="Hero">
  <h1 data-cms="hero.headline" data-cms-type="rich" data-cms-label="Headline" data-cms-group="Hero">Grooms Get Ready</h1>
  <p data-cms="hero.tagline" data-cms-group="Hero">One goal. Your best day.</p>
  <img data-cms="hero.image" data-cms-type="image" data-cms-group="Hero" src="/img/hero.jpg" alt="" />
  <h1 data-cms="hero.headline@bride" data-cms-type="rich" data-cms-group="Hero">Brides Get Ready</h1>
  <div data-cms="hero.video" data-cms-type="video" data-cms-label="Hero video" data-cms-group="Hero">
    <video aria-hidden="true"><source src="/media/hero.mp4" type="video/mp4" /></video>
  </div>
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

- [ ] **Step 2: Write the failing test (append to `src/engine/discovery.test.ts`)**

```ts
it('discovers a video field and reads its source as the default', () => {
  const v = discover(document).find((f) => f.key === 'hero.video');
  expect(v).toBeTruthy();
  expect(v!.type).toBe('video');
  expect(v!.label).toBe('Hero video');
  expect(v!.defaultContent).toBe('/media/hero.mp4');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/discovery.test.ts`
Expected: FAIL — `type` is `'video'` but `defaultContent` is `''` (readElement falls through to the innerHTML/text branch and returns the inner markup, not the source). Also `FieldType` does not yet include `'video'` (type error).

- [ ] **Step 4: Add `'video'` to `FieldType` in `src/shared/types.ts:1`**

```ts
export type FieldType = 'text' | 'rich' | 'image' | 'video' | 'link' | 'boolean' | 'select';
```

- [ ] **Step 5: Add the video case to `readElement` in `src/engine/discovery.ts`** (inside the `switch (type)` before the `case 'link'`):

```ts
    case 'video': {
      const v = el instanceof HTMLVideoElement ? el : el.querySelector('video');
      return v?.getAttribute('src') || v?.querySelector('source')?.getAttribute('src') || '';
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/engine/discovery.test.ts`
Expected: PASS. Also run `npx vitest run src/engine/bind.test.ts` to confirm the fixture change didn't break existing paint tests — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/engine/discovery.ts tests/fixtures/discovery.html src/engine/discovery.test.ts
git commit -m "feat(engine): discover video fields, read source as default"
```

---

### Task 4: `paintElement('video')` — file case + idempotency

**Files:**
- Modify: `src/engine/bind.ts`
- Test: `src/engine/video.bind.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { bind } from './bind.js';

// jsdom has no media impl — silence HTMLMediaElement.load().
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  document.body.innerHTML =
    '<div data-cms="hero.video" data-cms-type="video"><video><source src="/orig.mp4" type="video/mp4"></video></div>';
});

const wrap = () => document.querySelector<HTMLElement>('[data-cms="hero.video"]')!;

it('paints a file URL onto a <video> inside the wrapper', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const video = wrap().querySelector('video')!;
  expect(video.getAttribute('src')).toBe('/uploads/site/new.mp4');
  expect(video.querySelector('source')).toBeNull(); // <source> dropped in favour of src
});

it('is idempotent for an unchanged file value (no rebuild)', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const v1 = wrap().querySelector('video');
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const v2 = wrap().querySelector('video');
  expect(v2).toBe(v1); // same node identity → not torn down/recreated
});

it('restores the original markup when the key is absent', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  bind({});
  const video = wrap().querySelector('video')!;
  expect(video.querySelector('source')!.getAttribute('src')).toBe('/orig.mp4');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/video.bind.test.ts`
Expected: FAIL — video `src` stays null (no `'video'` branch in `paintElement`; it falls to `default` and sets `textContent`).

- [ ] **Step 3: Implement the file branch in `src/engine/bind.ts`**

Add the import at the top (next to the existing type import):

```ts
import { classifyVideo, coverSize } from './video.js';
```

Add a `paintVideo` helper and its observer registry **above** `paintElement`:

```ts
// One ResizeObserver per embed wrapper, so cover sizing tracks container resize.
const embedObservers = new WeakMap<HTMLElement, ResizeObserver>();

function clearEmbedObserver(el: HTMLElement): void {
  const obs = embedObservers.get(el);
  if (obs) {
    obs.disconnect();
    embedObservers.delete(el);
  }
}

function paintVideo(wrapper: HTMLElement, value: unknown): void {
  const { kind, src } = classifyVideo(String(value ?? ''));

  if (kind === 'file') {
    clearEmbedObserver(wrapper);
    let video = wrapper.querySelector<HTMLVideoElement>(':scope > video');
    if (!video) {
      wrapper.innerHTML = '';
      video = document.createElement('video');
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      wrapper.appendChild(video);
    }
    if (video.getAttribute('src') !== src) {
      video.querySelectorAll('source').forEach((n) => n.remove());
      video.setAttribute('src', src);
      try {
        video.load();
      } catch {
        /* jsdom / unsupported env */
      }
    }
    return;
  }

  // embed (youtube/vimeo) — implemented in the next task
  paintEmbed(wrapper, src);
}
```

For this task, add a minimal `paintEmbed` stub so the file path compiles (the real implementation lands in Task 5):

```ts
function paintEmbed(_wrapper: HTMLElement, _src: string): void {
  /* implemented in Task 5 */
}
```

Add the `case 'video'` to the `paintElement` switch (before `case 'rich'`):

```ts
    case 'video':
      paintVideo(el, value);
      break;
```

Add `clearEmbedObserver(el)` at the top of `restoreOriginal` so a reverted embed releases its observer:

```ts
function restoreOriginal(el: HTMLElement): void {
  clearEmbedObserver(el);
  const o = originals.get(el);
  // ...existing body unchanged...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/video.bind.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/bind.ts src/engine/video.bind.test.ts
git commit -m "feat(engine): paint video file URLs into the wrapper, idempotent + restore"
```

---

### Task 5: `paintElement('video')` — embed case + ResizeObserver

**Files:**
- Modify: `src/engine/bind.ts` (replace the `paintEmbed` stub)
- Test: `src/engine/video.bind.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to `src/engine/video.bind.test.ts`)**

```ts
// Capture ResizeObserver instances so we can assert lifecycle (jsdom has none).
class FakeRO {
  static instances: FakeRO[] = [];
  disconnected = false;
  constructor(public cb: () => void) {
    FakeRO.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

it('paints a youtube URL as a cover iframe and observes the container', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  const iframe = wrap().querySelector('iframe')!;
  expect(iframe).toBeTruthy();
  expect(iframe.getAttribute('src')).toContain('youtube.com/embed/abc123_DEF');
  expect(wrap().querySelector('video')).toBeNull(); // video replaced by embed
  expect(FakeRO.instances.length).toBe(1);

  vi.unstubAllGlobals();
});

it('disconnects the embed observer when switching to a file (no leak)', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  expect(FakeRO.instances[0].disconnected).toBe(true);
  expect(wrap().querySelector('iframe')).toBeNull();

  vi.unstubAllGlobals();
});

it('disconnects the embed observer and restores original on absent key', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  bind({});
  expect(FakeRO.instances[0].disconnected).toBe(true);
  expect(wrap().querySelector('iframe')).toBeNull();
  expect(wrap().querySelector('video source')!.getAttribute('src')).toBe('/orig.mp4');

  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/video.bind.test.ts`
Expected: FAIL — no `<iframe>` created (the `paintEmbed` stub does nothing).

- [ ] **Step 3: Replace the `paintEmbed` stub in `src/engine/bind.ts`**

```ts
function sizeEmbed(wrapper: HTMLElement, iframe: HTMLIFrameElement): void {
  const r = wrapper.getBoundingClientRect();
  const { w, h } = coverSize(r.width, r.height);
  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
}

function paintEmbed(wrapper: HTMLElement, src: string): void {
  const existing = wrapper.querySelector<HTMLIFrameElement>(':scope > iframe');
  if (existing && existing.getAttribute('src') === src) return; // idempotent: no reload

  clearEmbedObserver(wrapper);

  // Wrapper must clip and position the oversized iframe.
  if (!wrapper.style.position || wrapper.style.position === 'static') {
    wrapper.style.position = 'relative';
  }
  wrapper.style.overflow = 'hidden';
  wrapper.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', src);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'absolute';
  iframe.style.top = '50%';
  iframe.style.left = '50%';
  iframe.style.transform = 'translate(-50%, -50%)';
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  wrapper.appendChild(iframe);

  sizeEmbed(wrapper, iframe);
  const ro = new ResizeObserver(() => sizeEmbed(wrapper, iframe));
  ro.observe(wrapper);
  embedObservers.set(wrapper, ro);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/video.bind.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full engine suite check**

Run: `npx vitest run src/engine/`
Expected: PASS (all engine tests, including bind/discovery/sticky unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/engine/bind.ts src/engine/video.bind.test.ts
git commit -m "feat(engine): cover-scaled youtube/vimeo embeds with resize observer"
```

---

### Task 6: `VideoField` editor component

**Files:**
- Create: `src/editor/components/fields/VideoField.tsx`
- Test: `src/editor/components/fields/fields.test.tsx` (append)

- [ ] **Step 1: Write the failing test (append to `fields.test.tsx`)**

Add `VideoField` to the imports at the top, then:

```ts
import { VideoField } from './VideoField.js';

it('VideoField uploads a dropped file and emits the URL', async () => {
  const onChange = vi.fn();
  const upload = vi.fn().mockResolvedValue('/uploads/site/hero.mp4');
  const { container } = render(<VideoField value="" onChange={onChange} upload={upload} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'hero.mp4', { type: 'video/mp4' })] },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/site/hero.mp4'));
});

it('VideoField accepts a pasted URL in URL mode', () => {
  const onChange = vi.fn();
  render(<VideoField value="" onChange={onChange} upload={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'URL' }));
  fireEvent.change(screen.getByPlaceholderText(/Paste a video URL/), {
    target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
  });
  expect(onChange).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ');
});

it('VideoField labels an embed value in its preview', () => {
  render(<VideoField value="https://youtu.be/dQw4w9WgXcQ" onChange={vi.fn()} upload={vi.fn()} />);
  expect(screen.getByText(/YouTube embed/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/components/fields/fields.test.tsx`
Expected: FAIL — "Failed to resolve import './VideoField.js'".

- [ ] **Step 3: Write the component**

```tsx
// src/editor/components/fields/VideoField.tsx
import { useRef, useState } from 'react';
import { classifyVideo } from '../../../engine/video.js';

interface Props {
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
}

export function VideoField({ value, onChange, upload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await upload(file));
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const kind = value ? classifyVideo(value).kind : null;

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload
        </button>
        <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>
          URL
        </button>
      </div>

      {mode === 'upload' ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
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
          <span className="hint">{busy ? 'Uploading…' : 'Drop a video or click to upload'}</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <input
          type="text"
          value={value ?? ''}
          placeholder="Paste a video URL — file, YouTube, or Vimeo"
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {value && (
        <div style={{ marginTop: 10 }}>
          {kind === 'file' ? (
            <video
              src={value}
              muted
              playsInline
              style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6 }}
            />
          ) : (
            <span className="hint">{kind === 'youtube' ? 'YouTube' : 'Vimeo'} embed: {value}</span>
          )}
        </div>
      )}

      {error && (
        <div className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/components/fields/fields.test.tsx`
Expected: PASS (existing field tests + 3 new VideoField tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/components/fields/VideoField.tsx src/editor/components/fields/fields.test.tsx
git commit -m "feat(editor): VideoField with upload + URL modes and preview"
```

---

### Task 7: Wire `VideoField` into `Editor`

**Files:**
- Modify: `src/editor/components/Editor.tsx:1-40`
- Test: `src/editor/components/Editor.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Editor } from './Editor.js';
import type { Field } from '../../shared/types.js';

it('renders a VideoField for a video-typed field', () => {
  const fields: Field[] = [
    { key: 'hero.video', type: 'video', label: 'Hero video', group: 'Hero', defaultContent: '' },
  ];
  render(
    <Editor
      group="Hero"
      fields={fields}
      content={{}}
      variants={[{ id: 'default', label: 'Default' }]}
      onChange={vi.fn()}
      onReset={vi.fn()}
      upload={vi.fn()}
    />,
  );
  expect(screen.getByText('Hero video')).toBeInTheDocument();
  expect(screen.getByText('Drop a video or click to upload')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/components/Editor.test.tsx`
Expected: FAIL — the video field falls through to `TextField` (renders an `<input type=text>`, no dropzone text).

- [ ] **Step 3: Add the dispatch in `Editor.tsx`**

Add the import alongside the other field imports:

```ts
import { VideoField } from './fields/VideoField.js';
```

Add the case in `renderField` (after `case 'image':`):

```tsx
    case 'video':
      return <VideoField value={String(value ?? '')} onChange={onChange} upload={upload} />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/components/Editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/components/Editor.tsx src/editor/components/Editor.test.tsx
git commit -m "feat(editor): dispatch video fields to VideoField"
```

---

### Task 8: Uploads route — size cap + MIME filter + error mapping

**Files:**
- Modify: `src/server/routes/uploads.ts`
- Modify: `.env.example`
- Test: `src/server/index.test.ts` (append + adjust `afterEach`)

- [ ] **Step 1: Write the failing tests (append to `src/server/index.test.ts`)**

```ts
it('uploads a video under the size limit', async () => {
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('fake-mp4-bytes'), { filename: 'hero.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/^\/uploads\/test-site\/hero-\d+\.mp4$/);
});

it('rejects a non-media upload with 400', async () => {
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
  expect(res.status).toBe(400);
});

it('rejects an upload over the configured size limit with 413', async () => {
  process.env.CMS_UPLOAD_MAX_MB = '0.0005'; // ~524 bytes
  const app = createApp();
  const token = await login(app);
  const res = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.alloc(4000), { filename: 'big.mp4', contentType: 'video/mp4' });
  expect(res.status).toBe(413);
});
```

Update the existing `afterEach` to reset the per-test override:

```ts
afterEach(async () => {
  delete process.env.CMS_UPLOAD_MAX_MB;
  await fs.rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/index.test.ts`
Expected: FAIL — non-media returns 200 (no filter); oversize returns 500 HTML (no error mapping). The `.mp4` video test may pass already but the other two fail.

- [ ] **Step 3: Rewrite `src/server/routes/uploads.ts`**

```ts
import { Router } from 'express';
import multer, { MulterError } from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSiteId } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

function uploadRoot(): string {
  return process.env.CMS_UPLOAD_DIR || path.resolve(process.cwd(), 'public/uploads');
}

function maxBytes(): number {
  const mb = Number(process.env.CMS_UPLOAD_MAX_MB ?? 64);
  return Math.max(1, Math.floor((Number.isFinite(mb) ? mb : 64) * 1024 * 1024));
}

// Built per-request so env overrides (and the size cap) are read fresh.
function buildUpload() {
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

  return multer({
    storage,
    limits: { fileSize: maxBytes() },
    fileFilter: (_req, file, cb) => {
      if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
      else cb(new MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    },
  });
}

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, (req, res, next) => {
  buildUpload().single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file too large' });
        return;
      }
      // LIMIT_UNEXPECTED_FILE here means the fileFilter rejected the MIME type.
      res.status(400).json({ error: 'unsupported file type' });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    (async () => {
      if (!req.file) {
        res.status(400).json({ error: 'no file' });
        return;
      }
      const siteId = await getSiteId();
      res.json({ url: `/uploads/${siteId}/${req.file.filename}` });
    })().catch(next);
  });
});
```

- [ ] **Step 4: Document the env var in `.env.example`** (add the line under the existing vars):

```
# Max upload size in MB for images/videos (default 64)
CMS_UPLOAD_MAX_MB=64
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/server/index.test.ts`
Expected: PASS (existing upload test + 3 new ones; the original sanitized-URL test still green).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/uploads.ts src/server/index.test.ts .env.example
git commit -m "feat(server): configurable upload size cap + image/video MIME filter"
```

---

### Task 9: Full unit suite + typecheck gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new video/cover/discovery/field/editor/upload tests. No failures.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit (only if a fix was needed)**

```bash
git add -A
git commit -m "test: green unit suite + typecheck for video media"
```

---

### Task 10: E2E — set a video URL, preview embeds, publish persists

**Files:**
- Modify: `tests/e2e/fixtures/site/index.html`
- Modify: `tests/e2e/content-studio.spec.ts`

- [ ] **Step 1: Add a video field to the demo fixture site `tests/e2e/fixtures/site/index.html`** (final file):

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
      <div
        data-cms="hero.video"
        data-cms-type="video"
        data-cms-label="Hero video"
        data-cms-group="Hero"
        style="width: 320px; height: 180px"
      >
        <video aria-hidden="true"><source src="/site/default.mp4" type="video/mp4" /></video>
      </div>
    </section>
  </body>
</html>
```

- [ ] **Step 2: Write the failing E2E test (append to `tests/e2e/content-studio.spec.ts`)**

```ts
test('set a YouTube video URL → preview embeds an iframe → publish persists the URL', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');
  await page.getByPlaceholder('Password').fill('letmein');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Content Studio')).toBeVisible();

  // Find the Hero video card, switch to URL mode, paste a YouTube link.
  const videoCard = page.locator('.field-card', { hasText: 'Hero video' });
  await videoCard.getByRole('button', { name: 'URL' }).click();
  await videoCard.getByPlaceholder(/Paste a video URL/).fill('https://youtu.be/dQw4w9WgXcQ');

  // Preview iframe renders a nested embed iframe inside the video wrapper.
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.locator('[data-cms="hero.video"] iframe')).toHaveAttribute(
    'src',
    /youtube\.com\/embed\/dQw4w9WgXcQ/,
  );

  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published — your changes are now live')).toBeVisible();

  const res = await request.get('/api/content?state=published');
  const body = await res.json();
  expect(body.content['hero.video']).toBe('https://youtu.be/dQw4w9WgXcQ');
});
```

- [ ] **Step 3: Build, then run E2E to verify**

Run: `npm run build:engine && npm run build:editor && npm run test:e2e`
Expected: PASS — both the original flow test and the new video test. (The build refreshes `dist/cms-engine.js` + `dist/admin/` that the Playwright server serves.)

> If the editor card structure differs (`.field-card` / label text), adjust the locators to match the rendered DOM — keep the assertion on the nested `[data-cms="hero.video"] iframe` src and the published `hero.video` value.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/site/index.html tests/e2e/content-studio.spec.ts
git commit -m "test(e2e): video URL → preview embed → publish persists"
```

---

### Task 11: Teach the `/cms` skill to annotate media

**Files:**
- Modify: `C:\Users\jay_p\.claude\skills\cms\SKILL.md`

- [ ] **Step 1: Update the `data-cms-type` rule line (Step 4 "Rules")**

Replace:

```
- `data-cms-type`: `rich` for headlines/paragraphs with emphasis, `text` for short labels, `image` for `<img>`, `link` for anchors (wrap text + href).
```

with:

```
- `data-cms-type`: `rich` for headlines/paragraphs with emphasis, `text` for short labels, `image` for `<img>` or CSS-background photo slots, `video` for `<video>`/background videos, `link` for anchors (wrap text + href).
```

- [ ] **Step 2: Insert a new "Step 4b — Media (images & video)" section after Step 4**

```markdown
## Step 4b — Media (images & video)

Media is edited the same way as text — annotate the element, the engine paints it.

**Images** — annotate the `<img>` (engine sets `src`), or a CSS-background photo slot / placeholder box (engine sets `background-image`):

```tsx
<img data-cms="results.before" data-cms-type="image" data-cms-label="Before photo" data-cms-group="Results" src="/img/before.jpg" alt="" />
<div className="photo" data-cms="hero.poster" data-cms-type="image" data-cms-label="Hero poster" data-cms-group="Hero" />
```

**Video** — the engine renders a `<video>` (uploaded file / direct URL) or a cover-scaled `<iframe>` (YouTube/Vimeo) **inside the annotated element**, so wrap the existing `<video>` in a positioned container and annotate the *container* (keep the `<video>` inside as the default/fallback):

```tsx
// Before
<video autoPlay loop muted playsInline className="hero-video">
  <source src="/hero.mp4" type="video/mp4" />
</video>

// After — annotate a wrapper; the inner <video> is the fallback when the CMS is unreachable
<div className="hero-video" data-cms="hero.video" data-cms-type="video" data-cms-label="Hero video" data-cms-group="Hero">
  <video autoPlay loop muted playsInline aria-hidden="true">
    <source src="/hero.mp4" type="video/mp4" />
  </video>
</div>
```

Do **not** put `data-cms-type="video"` directly on the `<video>` — embeds need a container to swap an `<iframe>` into. The wrapper should be positioned (`relative`) and clip overflow; the engine sets these if absent.
```

- [ ] **Step 3: Update the checklist example (Step 6)**

```
Hero
  - hero.headline   (rich)
  - hero.tagline    (text)
  - hero.poster     (image)
  - hero.video      (video)
FAQ
  - faq             (list: q, a)
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` is not applicable (markdown). Re-read the file and confirm the three edits are present and well-formed.

- [ ] **Step 5: Commit**

```bash
git add "C:\Users\jay_p\.claude\skills\cms\SKILL.md"
git commit -m "docs(cms-skill): annotate video wrappers and background-image media"
```

> Note: the skill file lives outside the repo (`~/.claude/skills/`). If it is not under this git repo, skip the commit and just save the edits — they take effect immediately for the `/cms` skill.

---

### Task 12: Smoke test on `fitness-camp-v4` (disposable sandbox)

**Files:**
- Modify: `../website-build/fitness-camp-v4/components/Hero.tsx:21-26`

This is a manual end-to-end check against a real Next.js app with hydration — **not** a product deliverable. No before/after refactor, no full-site annotation.

- [ ] **Step 1: Wrap the hero video + annotate the poster placeholder**

Replace `Hero.tsx` lines 21-26 (the `motion.div.hero-bg` inner markup):

```tsx
      <motion.div className="hero-bg" style={reduced ? undefined : { y: bgY }}>
        <div
          className="ph hero-ph"
          data-cms="hero.poster"
          data-cms-type="image"
          data-cms-label="Hero poster"
          data-cms-group="Hero"
          data-label="Hero — groom / training shot, dark & cinematic"
        />
        <div
          className="hero-video-wrap"
          data-cms="hero.video"
          data-cms-type="video"
          data-cms-label="Hero video"
          data-cms-group="Hero"
        >
          <video autoPlay loop muted playsInline className="hero-video" aria-hidden="true">
            <source src="/hero.mp4" type="video/mp4" />
          </video>
        </div>
      </motion.div>
```

Add to `fitness-camp-v4/app/globals.css` (so the wrapper covers like the bare video did):

```css
.hero-video-wrap { position: absolute; inset: 0; }
```

- [ ] **Step 2: Run the CMS + the site and eyeball**

```bash
# Terminal A — CMS server (from website-cms), needs a built engine/editor + a cms.site config pointing siteUrl at the v4 dev server
npm run build:engine && npm run build:editor && npm run build:server
# set .env (JWT_SECRET, CMS_PASSWORD bcrypt) and cms.site.json (siteId, siteUrl: http://localhost:3003)
npm start

# Terminal B — the test site
cd ../website-build/fitness-camp-v4 && npm run dev   # localhost:3003
```

Open the admin (`/admin/`), sign in, select **Hero**. Verify:
- A **Hero video** card appears (Upload + URL modes) and a **Hero poster** image card appears.
- Paste a YouTube URL → the preview hero swaps to a cover-scaled embed, surviving hydration (no flicker-revert to the old video).
- Upload a small `.mp4` → the native hero video swaps.
- Publish → reload the live site → the change persists.

- [ ] **Step 3: Record the result**

Note pass/fail of each check in the task notes. Revert the `Hero.tsx`/`globals.css` sandbox edits if not keeping them (this site is a throwaway test bed).

---

## Self-Review (completed during planning)

**Spec coverage:**
- `video` FieldType → Task 3. `classifyVideo` (yt/vimeo/file) → Task 1. Container-aware `coverSize` + `ResizeObserver` lifecycle → Tasks 2, 5. `paintElement('video')` file + idempotency + restore → Task 4. Embed iframe cover → Task 5. `discovery.readElement('video')` → Task 3. `VideoField` (upload + URL + preview) → Task 6. `Editor` dispatch → Task 7. Uploads size env + MIME filter + error mapping → Task 8. `.env.example` → Task 8. Self-contained tests (engine/server/E2E fixture) → Tasks 1-10. `/cms` skill tailoring → Task 11. Disposable v4 smoke → Task 12. All spec sections mapped.

**Placeholder scan:** The only intentional cross-task stub is `paintEmbed` in Task 4, explicitly replaced in Task 5 (so Task 4 compiles standalone). No TBD/TODO/"handle edge cases".

**Type consistency:** `classifyVideo` returns `{ kind, src }` (`VideoSource`) — consumed identically in `bind.ts` (Tasks 4/5) and `VideoField` (Task 6). `coverSize(w,h,ar?) → {w,h}` used in `sizeEmbed` (Task 5). `FieldType` gains `'video'` in Task 3 before any later task references it. `embedObservers`/`clearEmbedObserver` defined in Task 4, used in Tasks 4/5.

**Known v1 limitation (per spec):** embed cover assumes 16:9 framing; vertical embeds may over-crop.
