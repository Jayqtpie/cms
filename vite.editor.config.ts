import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: the editor calls the API on the same origin (base ''), so in dev we
// forward backend paths to the Express server (npm run dev:server, port 4001).
// This makes `npm run dev:editor` work end-to-end with hot reload at :5173.
const API = 'http://localhost:4001';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: { outDir: 'dist/admin', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/uploads': API,
      '/cms': API,
      '/site': API,
    },
  },
});
