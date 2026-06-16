// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { bind } from './bind.js';

// jsdom has no media impl — silence HTMLMediaElement.load().
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  document.body.innerHTML =
    '<div data-cms="hero.video" data-cms-type="video"><video><source src="/orig.mp4" type="video/mp4"></video></div>';
});

const wrap = () => document.querySelector<HTMLElement>('[data-cms="hero.video"]')!;

it('paints a file URL onto a <video> inside the wrapper', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const video = wrap().querySelector('video')!;
  expect(video.getAttribute('src')).toBe('/uploads/site/new.mp4');
  expect(video.querySelector('source')).toBeNull(); // <source> dropped in favour of src
});

it('is idempotent for an unchanged file value (no rebuild)', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const v1 = wrap().querySelector('video');
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  const v2 = wrap().querySelector('video');
  expect(v2).toBe(v1); // same node identity → not torn down/recreated
});

it('restores the original markup when the key is absent', () => {
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  bind({});
  const video = wrap().querySelector('video')!;
  expect(video.querySelector('source')!.getAttribute('src')).toBe('/orig.mp4');
});

// Capture ResizeObserver instances so we can assert lifecycle (jsdom has none).
class FakeRO {
  static instances: FakeRO[] = [];
  disconnected = false;
  constructor(public cb: () => void) {
    FakeRO.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

it('paints a youtube URL as a cover iframe and observes the container', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  const iframe = wrap().querySelector('iframe')!;
  expect(iframe).toBeTruthy();
  expect(iframe.getAttribute('src')).toContain('youtube.com/embed/abc123_DEF');
  expect(wrap().querySelector('video')).toBeNull(); // video replaced by embed
  expect(FakeRO.instances.length).toBe(1);

  vi.unstubAllGlobals();
});

it('disconnects the embed observer when switching to a file (no leak)', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  bind({ 'hero.video': '/uploads/site/new.mp4' });
  expect(FakeRO.instances[0].disconnected).toBe(true);
  expect(wrap().querySelector('iframe')).toBeNull();

  vi.unstubAllGlobals();
});

it('disconnects the embed observer and restores original on absent key', () => {
  FakeRO.instances = [];
  vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);

  bind({ 'hero.video': 'https://youtu.be/abc123_DEF' });
  bind({});
  expect(FakeRO.instances[0].disconnected).toBe(true);
  expect(wrap().querySelector('iframe')).toBeNull();
  expect(wrap().querySelector('video source')!.getAttribute('src')).toBe('/orig.mp4');

  vi.unstubAllGlobals();
});
