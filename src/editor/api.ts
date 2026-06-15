import type { BrandConfig, Bucket, Content } from '../shared/types.js';

export function createApiClient(base: string, getToken: () => string | null) {
  const auth = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  const json = (extra: Record<string, string> = {}) => ({
    'Content-Type': 'application/json',
    ...auth(),
    ...extra,
  });
  const ensureOk = (r: Response): Response => {
    if (!r.ok) throw new Error(`CMS request failed (${r.status}): ${r.url}`);
    return r;
  };
  return {
    async getConfig(): Promise<BrandConfig> {
      return ensureOk(await fetch(`${base}/api/config`)).json();
    },
    async login(email: string, password: string): Promise<string> {
      const r = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error('login failed');
      return ((await r.json()) as { token: string }).token;
    },
    async getDraft(): Promise<Bucket> {
      return ensureOk(await fetch(`${base}/api/content?state=draft`, { headers: auth() })).json();
    },
    async getPublished(): Promise<Bucket> {
      return ensureOk(await fetch(`${base}/api/content?state=published`)).json();
    },
    async saveDraft(content: Content): Promise<Bucket> {
      return ensureOk(
        await fetch(`${base}/api/content/draft`, {
          method: 'PUT',
          headers: json(),
          body: JSON.stringify({ content }),
        }),
      ).json();
    },
    async publish(): Promise<Bucket> {
      return ensureOk(await fetch(`${base}/api/content/publish`, { method: 'POST', headers: auth() })).json();
    },
    async discard(): Promise<Bucket> {
      return ensureOk(await fetch(`${base}/api/content/discard`, { method: 'POST', headers: auth() })).json();
    },
    async upload(file: File): Promise<string> {
      const fd = new FormData();
      fd.append('file', file);
      const r = ensureOk(await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth(), body: fd }));
      return ((await r.json()) as { url: string }).url;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
