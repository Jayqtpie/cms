// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';

const config = {
  siteId: 'test-site',
  siteUrl: 'http://localhost/site',
  brand: {
    name: 'Test Co',
    eyebrow: 'TESTING',
    headline: 'Hello *world.*',
    tagline: 'Just a test.',
    accent: '#a87d2e',
    bg: '#16120b',
    logo: null,
  },
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/config')) return new Response(JSON.stringify(config));
      if (url.includes('/api/auth/login')) return new Response(JSON.stringify({ token: 'tok' }));
      if (url.includes('state=draft'))
        return new Response(JSON.stringify({ content: {}, meta: { lastSaved: null, lastPublished: null } }));
      if (url.includes('state=published'))
        return new Response(JSON.stringify({ content: {}, meta: { lastSaved: null, lastPublished: null } }));
      return new Response(JSON.stringify({}));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('shows the branded login then signs in', async () => {
  render(<App />);
  await waitFor(() => screen.getByRole('button', { name: 'Sign in' }));
  await userEvent.type(screen.getByPlaceholderText('Password'), 'letmein');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => screen.getByText('Content Studio'));
  expect(localStorage.getItem('cms:token')).toBe('tok');
});
