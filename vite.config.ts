import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages /<repo>/).
  base: './',
  server: {
    host: true,
    // big local working folders (frames, art masters, archives) must not be watched
    watch: { ignored: ['**/.tools/**', '**/_archive/**', '**/art/**', '**/docs/**', '**/dist/**'] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
