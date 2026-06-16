import { describe, expect, it } from 'vitest';
import { classifyVideo, coverSize } from './video.js';

describe('classifyVideo', () => {
  it('classifies a youtube watch URL and builds a background embed src', () => {
    const r = classifyVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('youtube.com/embed/dQw4w9WgXcQ');
    expect(r.src).toContain('autoplay=1');
    expect(r.src).toContain('mute=1');
    expect(r.src).toContain('loop=1');
    expect(r.src).toContain('playlist=dQw4w9WgXcQ');
  });

  it('classifies youtu.be short links and extracts the id (ignoring trailing params)', () => {
    const r = classifyVideo('https://youtu.be/dQw4w9WgXcQ?t=10');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('embed/dQw4w9WgXcQ');
  });

  it('classifies youtube-nocookie embed links', () => {
    const r = classifyVideo('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('embed/dQw4w9WgXcQ');
  });

  it('classifies youtube shorts', () => {
    const r = classifyVideo('https://www.youtube.com/shorts/abc123_DEF');
    expect(r.kind).toBe('youtube');
    expect(r.src).toContain('embed/abc123_DEF');
  });

  it('classifies vimeo and builds a background embed src', () => {
    const r = classifyVideo('https://vimeo.com/76979871');
    expect(r.kind).toBe('vimeo');
    expect(r.src).toContain('player.vimeo.com/video/76979871');
    expect(r.src).toContain('background=1');
  });

  it('treats direct file and HLS URLs as files (src unchanged)', () => {
    expect(classifyVideo('/uploads/site/hero.mp4')).toEqual({ kind: 'file', src: '/uploads/site/hero.mp4' });
    expect(classifyVideo('https://cdn.example.com/a.m3u8').kind).toBe('file');
  });

  it('treats empty/garbage as a file', () => {
    expect(classifyVideo('').kind).toBe('file');
    expect(classifyVideo('not a url').kind).toBe('file');
  });
});

describe('coverSize', () => {
  it('fills width when the container is wider than the aspect ratio', () => {
    expect(coverSize(1600, 400)).toEqual({ w: 1600, h: 900 });
  });

  it('fills height when the container is taller/narrower', () => {
    const r = coverSize(400, 1600);
    expect(r.h).toBe(1600);
    expect(r.w).toBeCloseTo((1600 * 16) / 9, 3);
  });

  it('matches both dims when the container is already 16:9 (no crop)', () => {
    const r = coverSize(1920, 1080);
    expect(r.w).toBeCloseTo(1920, 3);
    expect(r.h).toBeCloseTo(1080, 3);
  });

  it('returns the input unchanged for a zero-size container', () => {
    expect(coverSize(0, 0)).toEqual({ w: 0, h: 0 });
  });
});
