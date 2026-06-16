import type { CSSProperties } from 'react';

/**
 * Derive a contrast-safe set of admin accent shades from a client's brand colour
 * (cms.site.json -> brand.accent). The client's accent is tuned for their (often
 * dark) website, so we never use it raw on the light admin: we darken it to
 * legible luminance for text/borders and tint it for soft backgrounds. Returns
 * CSS custom properties to set on the app/login root, overriding the defaults.
 */
type RGB = { r: number; g: number; b: number };

function parseHex(hex: string): RGB | null {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function darkenToLum(c: RGB, target: number): RGB {
  let cur = { ...c };
  for (let i = 0; i < 80 && luminance(cur) > target; i++) {
    cur = { r: cur.r * 0.94, g: cur.g * 0.94, b: cur.b * 0.94 };
  }
  return cur;
}

function mixWhite(c: RGB, whiteAmount: number): RGB {
  const t = whiteAmount;
  return { r: c.r * (1 - t) + 255 * t, g: c.g * (1 - t) + 255 * t, b: c.b * (1 - t) + 255 * t };
}

export function accentVars(hex: string): CSSProperties | undefined {
  const base = parseHex(hex);
  if (!base) return undefined;
  const vars: Record<string, string> = {
    // mid shade for icons/dots/focus borders (visible on white)
    '--accent': toHex(darkenToLum(base, 0.45)),
    // dark shade for text on white (>= ~4.5:1 contrast)
    '--accent-2': toHex(darkenToLum(base, 0.18)),
    // very light tint for active backgrounds / focus rings
    '--accent-soft': toHex(mixWhite(base, 0.88)),
    // light border tint
    '--accent-line': toHex(mixWhite(base, 0.62)),
  };
  return vars as CSSProperties;
}
