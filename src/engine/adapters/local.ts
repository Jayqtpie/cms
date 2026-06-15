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
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Content;
    } catch {
      console.error(`[CMS] corrupt localStorage value for ${key(state)}; ignoring`);
      return {};
    }
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
      const draft = localStorage.getItem(key('draft'));
      if (draft === null) return; // nothing saved yet — don't overwrite published
      localStorage.setItem(key('published'), draft);
    },
  };
}
