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
  prettier,
]);
