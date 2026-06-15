import type { Content } from '../shared/types.js';

export interface ReadableAdapter {
  getPublished(): Promise<Content>;
}

export function createStore(adapter: ReadableAdapter) {
  let content: Content = {};
  return {
    async load(): Promise<Content> {
      content = await adapter.getPublished();
      return content;
    },
    get(): Content {
      return content;
    },
    set(next: Content): void {
      content = next;
    },
  };
}
