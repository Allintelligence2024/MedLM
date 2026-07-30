// playwright.config.ts — configuration E2E (Phase 13).
//
// Cible : CMS (Next.js) + page de login du backend (auth + redirect).
// On n'e2e pas le mobile (Flutter web est trop instable pour CI
// déterministe — Phase 14+).
//
// Stratégie : on lance un docker-compose de dev (postgres +
// backend + cms), puis Playwright navigue et vérifie les flux
// critiques.

import { defineConfig, devices } from '@playwright/test';

const PORT_BACKEND = process.env.PORT_BACKEND ?? '3000';
const PORT_CMS = process.env.PORT_CMS ?? '3001';
const BASE_BACKEND = `http://localhost:${PORT_BACKEND}`;
const BASE_CMS = `http://localhost:${PORT_CMS}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_CMS,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd ../backend && npm run start:dev',
      url: `${BASE_BACKEND}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: PORT_BACKEND,
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://medanki:medanki@localhost:5432/medanki',
        JWT_SIGNING_KEY: 'e2e-test-key-do-not-use-in-prod',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'cd ../cms && npm run dev',
      url: BASE_CMS,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: PORT_CMS,
        NEXT_PUBLIC_API_BASE_URL: BASE_BACKEND,
        NODE_ENV: 'test',
      },
    },
  ],
});
