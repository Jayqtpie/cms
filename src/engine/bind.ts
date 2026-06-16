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
