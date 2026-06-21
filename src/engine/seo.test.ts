// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { applySeo, _resetSeo } from './seo.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.title = 'Original Title';
  _resetSeo();
});

it('sets the page title and mirrors it to og/twitter', () => {
  applySeo({ 'seo.title': 'New Title' });
  expect(document.title).toBe('New Title');
  expect(document.querySelector('meta[property="og:title"]')!.getAttribute('content')).toBe('New Title');
  expect(document.querySelector('meta[name="twitter:title"]')!.getAttribute('content')).toBe('New Title');
});

it('creates a meta description and its social mirrors', () => {
  applySeo({ 'seo.description': 'A lovely page.' });
  expect(document.querySelector('meta[name="description"]')!.getAttribute('content')).toBe('A lovely page.');
  expect(document.querySelector('meta[property="og:description"]')!.getAttribute('content')).toBe(
    'A lovely page.',
  );
});

it('sets og:image, twitter:image and the card type for the social image', () => {
  applySeo({ 'seo.ogImage': '/uploads/og.webp' });
  expect(document.querySelector('meta[property="og:image"]')!.getAttribute('content')).toBe('/uploads/og.webp');
  expect(document.querySelector('meta[name="twitter:image"]')!.getAttribute('content')).toBe('/uploads/og.webp');
  expect(document.querySelector('meta[name="twitter:card"]')!.getAttribute('content')).toBe(
    'summary_large_image',
  );
});

it('reverts to the original title when the field is cleared', () => {
  applySeo({ 'seo.title': 'Temporary' });
  applySeo({ 'seo.title': '' });
  expect(document.title).toBe('Original Title');
});

it('does nothing when the payload has no seo.* keys', () => {
  applySeo({ 'hero.headline': 'x' });
  expect(document.title).toBe('Original Title');
  expect(document.querySelector('meta[name="description"]')).toBeNull();
});

it('creates the meta tag when the page had none', () => {
  expect(document.querySelector('meta[name="description"]')).toBeNull();
  applySeo({ 'seo.description': 'Brand new.' });
  expect(document.querySelector('meta[name="description"]')!.getAttribute('content')).toBe('Brand new.');
});
