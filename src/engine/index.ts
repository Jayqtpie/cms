import { discover } from './discovery.js';
import { createStickyBinder, type StickyBinder } from './bind.js';
import { createStore } from './store.js';
import { createLocalAdapter } from './adapters/local.js';
import { createApiAdapter } from './adapters/api.js';
import type { Content } from '../shared/types.js';

interface CMSConfig {
  siteId: string;
  backend: { type: 'local' | 'api'; base?: string };
  variants?: { id: string; label: string }[];
  groups?: string[];
  groupIcons?: Record<string, string>;
}

function isPreview(): boolean {
  return new URLSearchParams(location.search).get('cms') === 'preview';
}

/**
 * Briefly ring an element to show the editor which element a reset (or change)
 * affected. Uses inline box-shadow (no layout shift); the sticky binder does not
 * observe style, so this never triggers a re-paint. Saves/restores prior values.
 */
export function flashElement(el: HTMLElement): void {
  const prevShadow = el.style.boxShadow;
  const prevTransition = el.style.transition;
  el.style.transition = 'box-shadow 0.15s ease';
  el.style.boxShadow = '0 0 0 3px rgba(168, 125, 46, 0.65)';
  window.setTimeout(() => {
    el.style.boxShadow = prevShadow;
    window.setTimeout(() => {
      el.style.transition = prevTransition;
    }, 200);
  }, 650);
}

function baseKey(raw: string): string {
  const at = raw.indexOf('@');
  return at === -1 ? raw : raw.slice(0, at);
}

function runPreviewMode(cfg: CMSConfig): void {
  const schema = discover(document);
  // Sticky binder: keeps the draft painted even after Next/React hydration
  // reconciles the DOM back to server markup on first load (Bug #2).
  const binder = createStickyBinder(document);
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as {
      type?: string;
      content?: Content;
      variant?: string;
      group?: string;
      key?: string;
    };
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'cms-content' && msg.content) {
      binder.apply(msg.content, msg.variant || 'default');
    }
    if (msg.type === 'cms-scroll' && msg.group) {
      document
        .querySelector(`[data-cms-group="${msg.group}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (msg.type === 'cms-flash' && msg.key) {
      const base = baseKey(msg.key);
      document
        .querySelectorAll<HTMLElement>(`[data-cms="${base}"], [data-cms-list="${base}"]`)
        .forEach((el) => flashElement(el));
    }
  });
  parent.postMessage(
    {
      type: 'cms-schema',
      schema,
      groups: cfg.groups,
      variants: cfg.variants,
      groupIcons: cfg.groupIcons,
    },
    '*',
  );
  parent.postMessage({ type: 'cms-ready' }, '*');
}

export async function runLiveMode(cfg: CMSConfig): Promise<StickyBinder> {
  // Sticky binder: the published page is also hydrated by Next/React after our
  // beforeInteractive paint, so the same clobber as preview applies (Bug #2). The
  // observer re-applies the published content whenever hydration reverts it.
  const binder = createStickyBinder(document);
  if (cfg.backend.type === 'api' && cfg.backend.base) {
    // Live mode only reads public published content, so no auth token is needed.
    const store = createStore(createApiAdapter(cfg.backend.base, () => null));
    binder.apply(await store.load());
    return binder;
  }
  const local = createLocalAdapter(cfg.siteId);
  binder.apply(await local.getPublished());
  window.addEventListener('storage', async (e) => {
    if (e.key === `cms:${cfg.siteId}:published`) {
      binder.apply(await local.getPublished());
    }
  });
  return binder;
}

function init(): void {
  const cfg = (window as unknown as { CMSConfig?: CMSConfig }).CMSConfig;
  if (!cfg) return;
  if (isPreview()) runPreviewMode(cfg);
  else runLiveMode(cfg).catch((err) => console.error('[CMS] live mode failed:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
