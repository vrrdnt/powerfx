import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173/powerfx/', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173/powerfx/',
    reuseExistingServer: !process.env.CI,
  },
});
