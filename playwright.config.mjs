import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/auth', testMatch: ['browser.spec.mjs','online.spec.mjs'], workers: 1, timeout: 60000, use: { headless: true, viewport: { width: 1280, height: 900 } } });
