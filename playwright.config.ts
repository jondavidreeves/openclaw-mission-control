import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8787',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build:all && npm run server',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
