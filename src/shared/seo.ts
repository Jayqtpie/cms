import type { FieldType } from './types.js';

/** Sidebar group the synthetic SEO fields live under. */
export const SEO_GROUP = 'Page & SEO';

export interface SeoFieldDef {
  key: string;
  type: FieldType;
  label: string;
  hint: string;
}

/**
 * The fixed set of page-level SEO fields the engine manages in <head>. These are
 * not marked up on the client site — the engine writes the tags itself — so the
 * editor synthesizes this group for every site.
 */
export const SEO_FIELDS: SeoFieldDef[] = [
  {
    key: 'seo.title',
    type: 'text',
    label: 'Page title',
    hint: 'Shown in the browser tab and as the search-result heading (~60 characters).',
  },
  {
    key: 'seo.description',
    type: 'text',
    label: 'Search description',
    hint: 'The summary shown by search engines and social posts (~155 characters).',
  },
  {
    key: 'seo.ogImage',
    type: 'image',
    label: 'Social share image',
    hint: 'Shown when the page is shared on social media. 1200×630 works best.',
  },
];

export const SEO_KEYS = SEO_FIELDS.map((f) => f.key);
