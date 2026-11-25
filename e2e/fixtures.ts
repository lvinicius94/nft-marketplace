import { test as base, expect, type Page } from '@playwright/test'
import type { ScenarioName } from '../src/mocks/scenarios'

export const USERS = {
  ana: { email: 'ana@greenmint.test', password: 'Colecionador@1', name: 'Ana Prado', username: 'anaprado' },
  bruno: { email: 'bruno@greenmint.test', password: 'Colecionador@2', name: 'Bruno Lima', username: 'brunolima' },
} as const

type Mocks = {
  /** Calls a function of window.__mocks (the MSW mock server control surface). */
  call: <T = unknown>(fn: string, ...args: unknown[]) => Promise<T>
  setScenario: (name: ScenarioName) => Promise<void>
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768

/**
 * Every test starts from an isolated context with the deterministic "fast" scenario
 * (no latency). Tests that need another scenario pass it through `scenario`.
 */
export const test = base.extend<{ scenario: ScenarioName; mocks: Mocks }>({
  scenario: ['fast', { option: true }],
  page: async ({ page, scenario }, use) => {
    await page.addInitScript((name) => {
      if (!sessionStorage.getItem('__e2e_init')) {
        sessionStorage.setItem('__e2e_init', '1')
        localStorage.setItem('nft-mock-scenario', name)
      }
    }, scenario)
    await use(page)
  },
  mocks: async ({ page }, use) => {
    const call = async <T,>(fn: string, ...args: unknown[]) => {
      await page.waitForFunction(() => !!window.__mocks)
      return page.evaluate(([f, a]) => (window.__mocks as unknown as Record<string, (...x: unknown[]) => unknown>)[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>
    }
    await use({ call, setScenario: (name) => call('setScenario', name) })
  },
})

export { expect }

/** Waits until the app (and MSW) booted. */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(path)
  await page.waitForFunction(() => !!window.__mocks)
}

export async function login(page: Page, user: keyof typeof USERS = 'ana', redirect?: string) {
  await gotoApp(page, redirect ? `/entrar?redirect=${encodeURIComponent(redirect)}` : '/entrar')
  await page.getByLabel('E-mail', { exact: true }).fill(USERS[user].email)
  await page.getByLabel('Senha', { exact: true }).fill(USERS[user].password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText(`Bem-vindo, ${USERS[user].name}!`)).toBeVisible()
}

export async function addToCart(page: Page, nftId = 'nft-001', quantity = 1) {
  await gotoApp(page, `/nft/${nftId}`)
  for (let i = 1; i < quantity; i++) await page.getByRole('button', { name: 'Aumentar quantidade' }).click()
  await page.getByRole('button', { name: 'COMPRAR', exact: true }).click()
  await expect(page).toHaveURL(/\/carrinho$/)
  await expect(page.getByTestId('cart-row').first()).toBeVisible()
}

/** Fills the checkout, connects the wallet and opens the review dialog. */
export async function fillCheckoutAndReview(page: Page) {
  await expect(page.getByTestId('quote-loading')).toBeHidden()
  await page.getByLabel('Código de indicação').fill('KURIO-ANA')
  await page.getByRole('button', { name: 'Conectar carteira' }).click()
  await page.getByRole('button', { name: 'Aprovar conexão' }).click()
  await expect(page.getByTestId('wallet-connection')).toContainText('Conectada')
  await page.getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page.getByTestId('review-dialog')).toBeVisible()
}

/** Visible toast (the same text also goes to the sr-only live region). */
export const toast = (page: Page, text: string) => page.locator('[data-sonner-toaster]').getByText(text)
