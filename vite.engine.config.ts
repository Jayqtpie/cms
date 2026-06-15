import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist/cms',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/engine/index.ts'),
      name: 'CMSEngine',
      formats: ['iife'],
      fileName: () => 'cms-engine.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});
