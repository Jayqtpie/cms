import { SEO_KEYS } from '../shared/seo.js';
import type { Content } from '../shared/types.js';

interface SeoOriginal {
  title: string;
  description: string | null;
  ogImage: string | null;
}

// The page's head as it was before the engine first touched it, so cleared
// fields can revert instead of leaving the last applied value behind.
let original: SeoOriginal | null = null;

function getMeta(doc: Document, attr: 'name' | 'property', value: string): HTMLMetaElement | null {
  return doc.querySelector<HTMLMetaElement>(`meta[${attr}="${value}"]`);
}

function metaValue(doc: Document, attr: 'name' | 'property', value: string): string | null {
  return getMeta(doc, attr, value)?.getAttribute('content') ?? null;
}

function upsertMeta(doc: Document, attr: 'name' | 'property', value: string, content: string): void {
  let el = getMeta(doc, attr, value);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, value);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Write the seo.* content into <head>: page title, meta description, and the
 * Open Graph / Twitter mirrors, creating tags as needed. Empty values fall back
 * to whatever the page originally had. A no-op when the payload carries no seo.*
 * keys, so a site that never sets SEO keeps its hand-written head untouched.
 */
export function applySeo(content: Content, doc: Document = document): void {
  if (!doc || !doc.head) return;
  if (!original) {
    original = {
      title: doc.title,
      description: metaValue(doc, 'name', 'description'),
      ogImage: metaValue(doc, 'property', 'og:image'),
    };
  }
  if (!SEO_KEYS.some((k) => k in content)) return;

  const title = str(content['seo.title']) || original.title;
  if (title) {
    doc.title = title;
    upsertMeta(doc, 'property', 'og:title', title);
    upsertMeta(doc, 'name', 'twitter:title', title);
  }

  const description = str(content['seo.description']) || original.description || '';
  if (description) {
    upsertMeta(doc, 'name', 'description', description);
    upsertMeta(doc, 'property', 'og:description', description);
    upsertMeta(doc, 'name', 'twitter:description', description);
  }

  const ogImage = str(content['seo.ogImage']) || original.ogImage || '';
  if (ogImage) {
    upsertMeta(doc, 'property', 'og:image', ogImage);
    upsertMeta(doc, 'name', 'twitter:image', ogImage);
    upsertMeta(doc, 'name', 'twitter:card', 'summary_large_image');
  }
}

/** Test-only: forget the captured original head state. */
export function _resetSeo(): void {
  original = null;
}
