/**
 * Build and dev-server settings (Vite), plus the unit-test settings (Vitest), plus two small
 * plugins: content/*.yaml becomes plain data and content/events/*.ink compiled stories, at
 * build time.
 */
import { relative } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { parse } from 'yaml';
import { compileInk } from './src/content/ink.ts';

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

/**
 * Lets the game `import story from '…/x.ink'`: Ink scripts are compiled at build time, so the
 * game only carries the small Ink runtime. A script that doesn't compile fails the build.
 */
function inkStories(): Plugin {
  return {
    name: 'captain-ink-stories',
    transform(source, id) {
      if (!id.endsWith('.ink')) return null;
      const { json, errors } = compileInk(source, relative(process.cwd(), id));
      if (errors.length > 0) this.error(errors.join('\n'));
      return { code: `export default ${JSON.stringify(json)};`, map: null };
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the same build works on GitHub Pages, itch.io and in Electron.
  base: './',
  plugins: [react(), yamlContent(), inkStories()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // The main chunk is ~1.3 MB because of Babylon.js; warn only if it grows well past that.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
