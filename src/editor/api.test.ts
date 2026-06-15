import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApiClient } from './api.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('login posts the password and returns a token', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ token: 'abc' }),
  });
  const api = createApiClient('', () => null);
  expect(await api.login('e@x.com', 'pw')).toBe('abc');
});

it('saveDraft sends the bearer token', async () => {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValue({ ok: true, json: async () => ({}) });
  const api = createApiClient('', () => 'tok');
  await api.saveDraft({ a: 1 });
  const [, opts] = f.mock.calls[0];
  expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
});

it('login throws when credentials are rejected', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
  const api = createApiClient('', () => null);
  await expect(api.login('e@x.com', 'bad')).rejects.toThrow();
});

it('throws when an authed GET returns a non-OK status', async () => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status: 500,
    url: '/api/content?state=published',
  });
  const api = createApiClient('', () => null);
  await expect(api.getPublished()).rejects.toThrow();
});

it('omits the Authorization header when no token is present', async () => {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValue({ ok: true, json: async () => ({}) });
  const api = createApiClient('', () => null);
  await api.getDraft();
  const [, opts] = f.mock.calls[0];
  expect((opts as RequestInit).headers).not.toHaveProperty('Authorization');
});
