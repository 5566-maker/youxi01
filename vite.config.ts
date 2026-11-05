import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the build works from any folder, a GitHub Pages subpath or an iframe
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
