import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — runs the e2e suite against a local dev stack pointed
 * at the `inventory_test` database (port 5451, brought up by
 * `docker compose -f docker-compose.test.yml up -d` from the repo root).
 *
 * The webServer entries start both the backend (uvicorn) and the frontend
 * (vite dev) processes. The dev `docker compose up` stack must NOT be running
 * during e2e — the ports collide.
 *
 * To run:
 *   1. cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
 *   2. cd .. && docker compose -f docker-compose.test.yml up -d
 *   3. cd frontend && npm run test:e2e
 */

const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5451/inventory_test';
const TEST_JWT_SECRET = 'test-secret-for-e2e';

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  // Sequential — each spec mutates the shared test DB via direct pg writes.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: 'cd ../backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8002',
      url: 'http://localhost:8002/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: TEST_JWT_SECRET,
        FRONTEND_URL: 'http://localhost:5180',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REDIRECT_URI: 'http://localhost:5180/api/auth/google/callback',
        ENVIRONMENT: 'test',
      },
    },
    {
      command: 'npm run dev -- --port 5180 --host 0.0.0.0 --strictPort',
      url: 'http://localhost:5180',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // Override vite.config.js's /api proxy target.
        VITE_API_TARGET: 'http://localhost:8002',
      },
    },
  ],
});
