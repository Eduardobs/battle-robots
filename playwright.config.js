import { defineConfig } from '@playwright/test';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, browserName: 'chromium', locale: 'en-US' },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1`,
    url: baseURL,
  },
});
