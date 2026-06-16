export type FieldType = 'text' | 'rich' | 'image' | 'video' | 'link' | 'boolean' | 'select';

export interface ItemField {
  key: string;
  type: FieldType;
  label: string;
  hint?: string;
}

export interface Field {
  /** Raw data-cms value, e.g. "hero.headline" or "hero.headline@bride". */
  key: string;
  type: FieldType;
  label: string;
  group: string;
  /** Optional helper text shown under the field label in the editor. */
  hint?: string;
  /** Present when key carries an @variant suffix. */
  variant?: string;
  /** True for data-cms-list repeaters. */
  isList?: boolean;
  /** Sub-field shape for list items. */
  itemFields?: ItemField[];
  /** Value read from the DOM at discovery time. */
  defaultContent: unknown;
}

export type Content = Record<string, unknown>;

export interface ContentMeta {
  lastSaved: string | null;
  lastPublished: string | null;
}

export interface Bucket {
  content: Content;
  meta: ContentMeta;
}

export interface BrandConfig {
  siteId: string;
  /** URL of the live client site the editor previews. */
  siteUrl: string;
  brand: {
    name: string;
    eyebrow: string;
    headline: string;
    tagline: string;
    accent: string;
    bg: string;
    logo: string | null;
  };
}
