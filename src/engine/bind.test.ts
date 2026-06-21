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

it('escapes HTML in rich content so stored markup cannot execute', () => {
  bind({ 'hero.headline': '<img src=x onerror=alert(1)> *hi*' }, document);
  const html = document.querySelector('[data-cms="hero.headline"]')!.innerHTML;
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
  expect(html).toContain('<em>hi</em>'); // supported markup still applied
});

it('paints image src', () => {
  bind({ 'hero.image': '/uploads/test/new.jpg' }, document);
  expect(document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!.getAttribute('src')).toBe(
    '/uploads/test/new.jpg',
  );
});

it('applies alt text from the key#alt content value', () => {
  bind({ 'hero.image': '/uploads/test/new.jpg', 'hero.image#alt': 'A smiling couple' }, document);
  expect(document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!.getAttribute('alt')).toBe(
    'A smiling couple',
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

it('restores an element to its original DOM content when its key is absent (declarative bind)', () => {
  const headline = document.querySelector('[data-cms="hero.headline"]')!;
  const tagline = document.querySelector('[data-cms="hero.tagline"]')!;
  const originalHeadline = headline.innerHTML;
  const originalTagline = tagline.textContent;

  // Paint both fields.
  bind({ 'hero.headline': 'Changed headline', 'hero.tagline': 'Changed tagline' }, document);
  expect(headline.textContent).toBe('Changed headline');
  expect(tagline.textContent).toBe('Changed tagline');

  // Re-bind with only one key present → the other must revert to its original (this is the undo case).
  bind({ 'hero.headline': 'Changed headline' }, document);
  expect(headline.textContent).toBe('Changed headline');
  expect(tagline.textContent).toBe(originalTagline);

  // Empty content → everything reverts to the original DOM.
  bind({}, document);
  expect(headline.innerHTML).toBe(originalHeadline);
});

it('restores the original image src when the key is absent', () => {
  const img = document.querySelector<HTMLImageElement>('[data-cms="hero.image"]')!;
  const originalSrc = img.getAttribute('src');
  bind({ 'hero.image': '/uploads/new.jpg' }, document);
  expect(img.getAttribute('src')).toBe('/uploads/new.jpg');
  bind({}, document);
  expect(img.getAttribute('src')).toBe(originalSrc);
});

it('re-rendering a list clears previously rendered items', () => {
  bind({ faq: [{ q: 'Q1', a: 'A1' }] }, document);
  bind({ faq: [{ q: 'Only', a: 'One' }] }, document);
  const rendered = document.querySelectorAll('[data-cms-list="faq"] [data-cms-rendered]');
  expect(rendered.length).toBe(1);
  expect(rendered[0].querySelector('.faq-q')!.textContent).toBe('Only');
});
