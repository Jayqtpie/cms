import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApiAdapter } from './api.js';

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

it('getPublished returns the content field on success', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ content: { a: 1 } }),
  });
  const api = createApiAdapter('', () => null);
  expect(await api.getPublished()).toEqual({ a: 1 });
});

it('throws when the server responds with a non-OK status', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status: 500,
    url: '/api/content?state=published',
    json: async () => ({}),
  });
  const api = createApiAdapter('', () => null);
  await expect(api.getPublished()).rejects.toThrow();
});
