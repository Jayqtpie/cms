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

/** Content sub-key holding an image field's alt text, e.g. "hero.image#alt". */
export const ALT_KEY_SUFFIX = '#alt';

export interface ContentMeta {
  lastSaved: string | null;
  lastPublished: string | null;
}

export interface Bucket {
  content: Content;
  meta: ContentMeta;
  /**
   * Monotonic draft revision counter, incremented on every saveDraft.
   * Used as an optimistic-concurrency token: an autosave carrying a stale
   * version is rejected (409) rather than clobbering a newer write.
   */
  version: number;
}

export interface BrandConfig {
  siteId: string;
  /** URL of the live client site the editor previews. */
  siteUrl: string;
  /** Whether this site requires a 2FA code at login (set by the server from env). */
  totp?: boolean;
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
