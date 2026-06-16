export type VideoKind = 'youtube' | 'vimeo' | 'file';

export interface VideoSource {
  kind: VideoKind;
  /** Embeds: iframe src with background params. Files: the URL unchanged. */
  src: string;
}

const YT_RE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

/**
 * Classify a bare video URL into an embed/file source. Expects a single URL
 * (it does match a URL embedded in surrounding text, but that is not a guarantee).
 * Anything not recognised as YouTube/Vimeo is returned as `kind: 'file'` with the
 * URL unchanged. Tolerates null/undefined by treating them as an empty file URL.
 */
export function classifyVideo(url: string | null | undefined): VideoSource {
  const u = (url ?? '').trim();

  const yt = u.match(YT_RE);
  if (yt) {
    const id = yt[1];
    return {
      kind: 'youtube',
      src:
        `https://www.youtube.com/embed/${id}` +
        `?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0`,
    };
  }

  const vm = u.match(VIMEO_RE);
  if (vm) {
    return {
      kind: 'vimeo',
      src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&loop=1&background=1`,
    };
  }

  return { kind: 'file', src: u };
}

export function coverSize(
  containerW: number,
  containerH: number,
  aspectRatio = 16 / 9,
): { w: number; h: number } {
  if (containerW <= 0 || containerH <= 0) return { w: containerW, h: containerH };
  const containerAR = containerW / containerH;
  // Wider than the media → lock width, let height overflow (crop top/bottom).
  if (containerAR > aspectRatio) return { w: containerW, h: containerW / aspectRatio };
  // Taller/narrower → lock height, let width overflow (crop left/right).
  return { w: containerH * aspectRatio, h: containerH };
}
