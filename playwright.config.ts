import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * End-to-end tests and screenshots run against the production build in headless Chromium.
 * WebGL runs on SwiftShader (software rendering), so one worker at a time and generous timeouts.
 * Set PW_SKIP_BUILD=1 to reuse an existing dist/ (CI builds once).
 */
export default defineConfig({
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'e2e', testDir: 'tests/e2e' },
    { name: 'shots', testDir: 'tests/shots' },
  ],
  webServer: {
    command: `${process.env.PW_SKIP_BUILD ? '' : 'npm run build && '}npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
