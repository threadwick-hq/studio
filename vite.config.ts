import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is published to GitHub Pages from /docs (project page served under a
// subpath), so use a relative base and emit the build into docs/.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    sourcemap: false,
  },
});
