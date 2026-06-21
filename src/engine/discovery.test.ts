// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { discover, discoverSeo } from './discovery.js';

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    path.resolve(process.cwd(), 'tests/fixtures/discovery.html'),
    'utf8',
  );
});

it('discovers simple fields with type, label, group', () => {
  const fields = discover(document);
  const headline = fields.find((f) => f.key === 'hero.headline');
  expect(headline).toBeTruthy();
  expect(headline!.type).toBe('rich');
  expect(headline!.label).toBe('Headline');
  expect(headline!.group).toBe('Hero');
});

it('humanizes labels when data-cms-label is absent', () => {
  const tagline = discover(document).find((f) => f.key === 'hero.tagline');
  expect(tagline!.label).toBe('Tagline');
});

it('detects variant fields via the @variant suffix', () => {
  const v = discover(document).find((f) => f.key === 'hero.headline@bride');
  expect(v!.variant).toBe('bride');
});

it('discovers a list with its item sub-fields', () => {
  const faq = discover(document).find((f) => f.key === 'faq');
  expect(faq!.isList).toBe(true);
  expect(faq!.itemFields!.map((i) => i.key)).toEqual(['q', 'a']);
  expect(faq!.itemFields!.find((i) => i.key === 'a')!.type).toBe('rich');
});

it('discovers a video field and reads its source as the default', () => {
  const v = discover(document).find((f) => f.key === 'hero.video');
  expect(v).toBeTruthy();
  expect(v!.type).toBe('video');
  expect(v!.label).toBe('Hero video');
  expect(v!.defaultContent).toBe('/media/hero.mp4');
});

it('synthesizes a Page & SEO group with defaults read from <head>', () => {
  document.title = 'My Site';
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'description');
  meta.setAttribute('content', 'A lovely site.');
  document.head.appendChild(meta);

  const seo = discoverSeo(document);
  expect(seo.map((f) => f.key)).toEqual(['seo.title', 'seo.description', 'seo.ogImage']);
  expect(seo.every((f) => f.group === 'Page & SEO')).toBe(true);
  expect(seo.find((f) => f.key === 'seo.title')!.defaultContent).toBe('My Site');
  expect(seo.find((f) => f.key === 'seo.description')!.defaultContent).toBe('A lovely site.');
  expect(seo.find((f) => f.key === 'seo.ogImage')!.type).toBe('image');

  meta.remove();
  document.title = '';
});
