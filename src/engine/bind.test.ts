// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { bind } from './bind.js';

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

it('paints text and rich content (rich converts *x* and \\n)', () => {
  bind({ 'hero.headline': 'Get *Ready*\nNow', 'hero.tagline': 'Be your best.' }, document);
  expect(document.querySelector('[data-cms="hero.headline"]')!.innerHTML).toBe(
    'Get <em>Ready</em><br>Now',
  );
  expect(document.querySelector('[data-cms="hero.tagline"]')!.textContent).toBe('Be your best.');
});

it('paints image src', () => {
  bind({ 'hero.image': '/uploads/test/new.jpg' }, document);
  expect(document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!.getAttribute('src')).toBe(
    '/uploads/test/new.jpg',
  );
});

it('uses the variant value when a variant is active', () => {
  bind(
    { 'hero.headline': 'Grooms Get Ready', 'hero.headline@bride': 'Brides Get Ready' },
    document,
    'bride',
  );
  // the base element repaints with the variant value
  expect(document.querySelector('[data-cms="hero.headline"]')!.textContent).toContain('Brides');
});

it('renders a list by cloning the template per item', () => {
  bind(
    {
      faq: [
        { q: 'Q1', a: 'A1' },
        { q: 'Q2', a: 'A2' },
      ],
    },
    document,
  );
  const rendered = document.querySelectorAll('[data-cms-list="faq"] [data-cms-rendered]');
  expect(rendered.length).toBe(2);
  expect(rendered[0].querySelector('.faq-q')!.textContent).toBe('Q1');
});

it('re-rendering a list clears previously rendered items', () => {
  bind({ faq: [{ q: 'Q1', a: 'A1' }] }, document);
  bind({ faq: [{ q: 'Only', a: 'One' }] }, document);
  const rendered = document.querySelectorAll('[data-cms-list="faq"] [data-cms-rendered]');
  expect(rendered.length).toBe(1);
  expect(rendered[0].querySelector('.faq-q')!.textContent).toBe('Only');
});
