import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3005', launchOptions: { executablePath: '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell' }, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Test fixtures are never enabled in normal dev sessions or production.
    env: { VITE_E2E_DEMO_MODE: 'true' },
    command: 'npx vite --port=3005 --host=127.0.0.1',
    url: 'http://127.0.0.1:3005',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
