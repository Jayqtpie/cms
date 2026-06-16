/**
 * Line-icon set for the editor chrome. Single-colour, stroke-based, inherits
 * `currentColor`. Ported from the Content Studio design handoff. A path string
 * may contain several sub-paths; we split on "M" and render each as its own
 * <path> so compound glyphs work.
 */
interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
}

const PATHS: Record<string, string> = {
  star: 'M12 3.5l2.4 5 5.5.7-4 3.9 1 5.4L12 16l-4.9 2.4 1-5.4-4-3.9 5.5-.7z',
  quote: 'M9 7H5v6h4l-2 4M19 7h-4v6h4l-2 4',
  path: 'M5 6h6a3 3 0 010 6H7a3 3 0 000 6h12M5 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm14 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  chat: 'M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z',
  help: 'M9.2 9a2.8 2.8 0 015.4 1c0 2-2.6 2.5-2.6 4M12 17.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  check: 'M5 13l4 4L19 7',
  reset: 'M3 5v5h5M3.5 9.5A8 8 0 113 13',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  x: 'M6 6l12 12M18 6L6 18',
  external: 'M14 4h6v6M20 4l-9 9M10 6H5v13h13v-5',
  ring: 'M12 14a4 4 0 100-8 4 4 0 000 8zM10 4l2-2 2 2M12 14v6',
  chevron: 'M9 6l6 6-6 6',
  bolt: 'M13 3L4 14h6l-1 7 9-11h-6z',
  rocket: 'M5 15c-1 2-1 4-1 4s2 0 4-1M9 11a10 10 0 016-6c3 0 4 1 4 4a10 10 0 01-6 6l-2 1-3-3z',
  monitor: 'M3 5h18v11H3zM8 21h8M12 16v5',
  phone: 'M7 3h10v18H7zM11 18.5h2',
  tag: 'M3 12l9-9 9 9-9 9zM12 12h.01',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4',
};

export function Icon({ name, size = 18, stroke = 1.6 }: IconProps) {
  const d = PATHS[name] || PATHS.doc;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d
        .split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={'M' + seg} />
        ))}
    </svg>
  );
}
