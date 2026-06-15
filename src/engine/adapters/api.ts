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
      if (!r.ok) throw new Error(`CMS request failed (${r.status}): ${r.url}`);
      return ((await r.json()) as { content?: Content }).content ?? {};
    },
    async getDraft() {
      const r = await fetch(`${base}/api/content?state=draft`, { headers: { ...auth() } });
      if (!r.ok) throw new Error(`CMS request failed (${r.status}): ${r.url}`);
      return ((await r.json()) as { content?: Content }).content ?? {};
    },
    async saveDraft(content) {
      const r = await fetch(`${base}/api/content/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(`CMS request failed (${r.status}): ${r.url}`);
    },
    async publish() {
      const r = await fetch(`${base}/api/content/publish`, { method: 'POST', headers: { ...auth() } });
      if (!r.ok) throw new Error(`CMS request failed (${r.status}): ${r.url}`);
    },
  };
}
