import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * E2E against the production build with MSW enabled (same mocks as the demo).
 * Every test gets a fresh browser context = fresh localStorage = freshly seeded mock DB.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['html', { open: 'never' }], ['list']],
  // Baselines are per OS (font rendering differs). Missing ones (e.g. first run on macOS/Linux)
  // are written instead of failing; versioned baselines here were generated on win32.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  updateSnapshots: 'missing',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Stops the hero autoplay so screenshots and assertions are deterministic.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    {
      // Tablet breakpoint required by the challenge: layout, purchase flow and visual regression.
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      grep: /sem overflow horizontal|compra completa|Regressão visual|busca, filtros/,
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
