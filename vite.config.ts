import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Published to GitHub Pages via Actions (the workflow uploads dist/). A relative
// base keeps assets working under the project-page subpath (/stitchgrid/).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
