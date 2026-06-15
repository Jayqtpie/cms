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
    // Live mode only reads public published content, so no auth token is needed.
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
  else runLiveMode(cfg).catch((err) => console.error('[CMS] live mode failed:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
