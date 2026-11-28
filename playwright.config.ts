import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const E2E_PORT = 4173;
const dataDir =
  process.env.HOWARD_E2E_DATA_DIR ||
  path.join(os.tmpdir(), `howard-e2e-${process.pid}`);
process.env.HOWARD_E2E_DATA_DIR = dataDir;
fs.mkdirSync(dataDir, { recursive: true });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ],
  webServer: {
    command: 'node server.ts',
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      DATA_DIR: dataDir
    }
  }
});
