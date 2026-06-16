// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flashElement } from './index.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('rings an element then restores its prior box-shadow', () => {
  document.body.innerHTML = '<h1 data-cms="hero.headline">Hi</h1>';
  const el = document.querySelector('h1') as HTMLElement;
  el.style.boxShadow = '';

  flashElement(el);
  expect(el.style.boxShadow).not.toBe('');

  vi.advanceTimersByTime(700);
  expect(el.style.boxShadow).toBe('');
});
