// Side-effect CSS imports from Fontsource packages. Declared ambiently so the
// typecheck passes whether or not the packages are installed locally; Vite
// resolves the real .woff2 + @font-face CSS at build time.
declare module '@fontsource/*';
