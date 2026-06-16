import type { Content, FieldType } from '../shared/types.js';
import { classifyVideo, coverSize } from './video.js';

// One ResizeObserver per embed wrapper, so cover sizing tracks container resize.
const embedObservers = new WeakMap<HTMLElement, ResizeObserver>();

function clearEmbedObserver(el: HTMLElement): void {
  const obs = embedObservers.get(el);
  if (obs) {
    obs.disconnect();
    embedObservers.delete(el);
  }
}

function sizeEmbed(wrapper: HTMLElement, iframe: HTMLIFrameElement): void {
  // When the wrapper has no layout yet (display:none, pre-CSS), coverSize returns
  // 0×0 and the iframe is briefly invisible; the ResizeObserver re-sizes it once
  // the container gets a real size, so this self-corrects.
  const r = wrapper.getBoundingClientRect();
  const { w, h } = coverSize(r.width, r.height);
  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
}

// Remove only the media nodes the engine manages, leaving any author-owned
// children (captions, overlays) intact.
function clearMedia(wrapper: HTMLElement): void {
  wrapper.querySelectorAll(':scope > video, :scope > iframe').forEach((n) => n.remove());
}

function paintEmbed(wrapper: HTMLElement, src: string): void {
  const existing = wrapper.querySelector<HTMLIFrameElement>(':scope > iframe');
  if (existing && existing.getAttribute('src') === src) return; // idempotent: no reload

  clearEmbedObserver(wrapper);

  // Wrapper must clip and position the oversized iframe — but don't override an
  // explicit author choice for either property.
  if (!wrapper.style.position || wrapper.style.position === 'static') {
    wrapper.style.position = 'relative';
  }
  if (!wrapper.style.overflow) wrapper.style.overflow = 'hidden';
  clearMedia(wrapper);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', src);
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

function paintVideo(wrapper: HTMLElement, value: unknown): void {
  const { kind, src } = classifyVideo(String(value ?? ''));

  if (kind === 'file') {
    clearEmbedObserver(wrapper);
    let video = wrapper.querySelector<HTMLVideoElement>(':scope > video');
    if (!video) {
      clearMedia(wrapper); // drop a stale embed iframe, keep author children
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

  paintEmbed(wrapper, src);
}

export function renderRich(value: string): string {
  return value.replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

export function paintElement(el: HTMLElement, type: FieldType, value: unknown): void {
  switch (type) {
    case 'image':
      if (el instanceof HTMLImageElement) el.src = String(value);
      else el.style.backgroundImage = `url("${String(value)}")`;
      break;
    case 'video':
      paintVideo(el, value);
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
    // 'select' editor widget is deferred (see plan self-review); paint it as
    // plain text for now so the type is handled explicitly, not silently.
    case 'select':
    default:
      el.textContent = String(value);
  }
}

function baseKey(raw: string): string {
  const at = raw.indexOf('@');
  return at === -1 ? raw : raw.slice(0, at);
}

// Each [data-cms] element's pristine DOM state, captured once before it is ever
// painted. This lets bind() be declarative: a key absent from `content` restores
// the original instead of leaving the last painted value behind (the undo case).
interface Original {
  html: string;
  src: string | null;
  href: string | null;
  display: string;
}

const originals = new WeakMap<HTMLElement, Original>();

function captureOriginal(el: HTMLElement): void {
  if (originals.has(el)) return;
  originals.set(el, {
    html: el.innerHTML,
    src: el.getAttribute('src'),
    href: el.getAttribute('href'),
    display: el.style.display,
  });
}

function restoreOriginal(el: HTMLElement): void {
  clearEmbedObserver(el);
  const o = originals.get(el);
  if (!o) return;
  el.innerHTML = o.html;
  if (o.src === null) el.removeAttribute('src');
  else el.setAttribute('src', o.src);
  if (o.href === null) el.removeAttribute('href');
  else el.setAttribute('href', o.href);
  el.style.display = o.display;
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

export interface StickyBinder {
  apply(content: Content, variant?: string): void;
  stop(): void;
}

// What hydration mutates: text/rich/link/list paints land as childList +
// characterData; image src and link href are attributes. Deliberately NOT
// observing style/class so Framer Motion animations don't trigger re-paints.
const STICKY_OBSERVE: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
  attributeFilter: ['src', 'href'],
};

// In preview the engine paints via beforeInteractive, then Next/React hydration
// runs and reconciles [data-cms] elements back to their server markup, clobbering
// the paint (Bug #2). A sticky binder re-applies the last content whenever a stable
// ancestor (<body>) reports its subtree was reverted, so the draft survives
// hydration and any later re-render. Observing the ancestor — not each element —
// keeps it working even when React replaces an element node outright. Writes are
// done with the observer disconnected so our own paints never re-trigger it.
export function createStickyBinder(root: ParentNode = document): StickyBinder {
  const target: Node = (root as Document).body ?? (root as unknown as Node);
  let content: Content | null = null;
  let variant = 'default';
  let stopped = false;

  const reapply = (): void => {
    if (!content) return;
    observer.disconnect();
    bind(content, root, variant);
    observer.observe(target, STICKY_OBSERVE);
  };

  const observer = new MutationObserver(reapply);

  return {
    apply(next: Content, nextVariant = 'default'): void {
      if (stopped) return; // stop() is final: never re-attach a second observer
      content = next;
      variant = nextVariant;
      reapply();
    },
    stop(): void {
      stopped = true;
      observer.disconnect();
      content = null;
    },
  };
}

export function bind(content: Content, root: ParentNode = document, variant = 'default'): void {
  root.querySelectorAll<HTMLElement>('[data-cms]').forEach((el) => {
    // Capture the pristine state before the first paint so absent keys can restore it.
    captureOriginal(el);
    const key = baseKey(el.getAttribute('data-cms')!);
    const variantKey = `${key}@${variant}`;
    const value =
      variant !== 'default' && content[variantKey] !== undefined ? content[variantKey] : content[key];
    if (value === undefined) {
      restoreOriginal(el);
      return;
    }
    const type = (el.getAttribute('data-cms-type') as FieldType) || 'text';
    paintElement(el, type, value);
  });

  bindLists(content, root);
}
