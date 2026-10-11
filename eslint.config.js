// Lint rules. Besides the recommended sets: Babylon.js only through src/world/babylon.ts, and
// src/sim and the layout planner (src/world/ship/{coords,layout,fits}.ts) kept free of
// rendering, React and browser globals so they run headless in Node.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'artifacts', 'coverage', 'playwright-report', 'test-results']),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@babylonjs/core',
              message:
                'Import Babylon.js from src/world/babylon.ts; module-by-module imports keep the bundle small.',
            },
          ],
        },
      ],
    },
  },
  {
    // The simulation must run headless in Node: no rendering, UI or browser APIs.
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@babylonjs/*', 'react', 'react-dom'],
              message: 'src/sim must stay headless.',
            },
            {
              group: ['**/world/**', '**/ui/**'],
              message: 'src/sim must not depend on presentation code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'requestAnimationFrame',
      ],
    },
  },
  {
    // The 3D layout planner runs in Node too (validator, unit tests): plain maths only.
    files: ['src/world/ship/coords.ts', 'src/world/ship/layout.ts', 'src/world/ship/fits.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@babylonjs/*', 'react', 'react-dom', '**/babylon', '**/ui/**'],
              message: 'The layout planner must stay free of rendering and UI code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'requestAnimationFrame',
      ],
    },
  },
  prettier,
]);
