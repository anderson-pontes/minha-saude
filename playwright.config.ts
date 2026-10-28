import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175', channel: 'msedge', headless: true },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175', reuseExistingServer: false, env: { VITE_SUPABASE_URL: 'https://foundation-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' } },
})
