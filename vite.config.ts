import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { parse } from 'yaml';

/** Lets the game `import data from '…/x.yaml'`: content files become plain data at build time. */
function yamlContent(): Plugin {
  return {
    name: 'captain-yaml-content',
    transform(source, id) {
      if (!/\.ya?ml$/.test(id)) return null;
      return { code: `export default ${JSON.stringify(parse(source))};`, map: null };
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the same build works on GitHub Pages, itch.io and in Electron.
  base: './',
  plugins: [react(), yamlContent()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Babylon.js is one large chunk by design; don't warn about it.
    chunkSizeWarningLimit: 6000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
