import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined)

// Pruebas de extremo a extremo contra la interfaz real, con SQLite real (puente de desarrollo) y base de datos nueva.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1421',
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    locale: 'es-CO',
    acceptDownloads: true,
  },
  webServer: {
    command: 'rm -f .dev-data/e2e.db* && MONETA_DEV_DB=.dev-data/e2e.db npx vite --port 1421 --strictPort',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
