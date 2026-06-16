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
}

function isPreview(): boolean {
  return new URLSearchParams(location.search).get('cms') === 'preview';
}

function runPreviewMode(cfg: CMSConfig): void {
  const schema = discover(document);
  // Sticky binder: keeps the draft painted even after Next/React hydration
  // reconciles the DOM back to server markup on first load (Bug #2).
  const binder = createStickyBinder(document);
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string; content?: Content; variant?: string; group?: string };
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'cms-content' && msg.content) {
      binder.apply(msg.content, msg.variant || 'default');
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
