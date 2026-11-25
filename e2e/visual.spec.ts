import { addToCart, expect, gotoApp, login, test } from './fixtures'

/**
 * Visual regression with versioned baselines (e2e/__screenshots__).
 * Data is deterministic (seeded fixtures + "fast" scenario). The Mocks button is hidden.
 */
const hideDevtools = async (page: import('@playwright/test').Page) => {
  await page.addStyleTag({ content: '[aria-label="Abrir painel de cenários simulados"]{display:none!important}' })
  await page.evaluate(() => document.fonts.ready)
}

test.describe('Regressão visual', () => {
  test('início', async ({ page }) => {
    await gotoApp(page, '/')
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await hideDevtools(page)
    await expect(page).toHaveScreenshot('inicio.png', { fullPage: true })
  })

  test('detalhe', async ({ page }) => {
    await gotoApp(page, '/nft/nft-001')
    await expect(page.getByTestId('detail-price')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await hideDevtools(page)
    await expect(page).toHaveScreenshot('detalhe.png', { fullPage: true })
  })

  test('carrinho', async ({ page }) => {
    await addToCart(page, 'nft-001')
    await addToCart(page, 'nft-005')
    await page.waitForLoadState('networkidle')
    await hideDevtools(page)
    await expect(page).toHaveScreenshot('carrinho.png', { fullPage: true })
  })

  test('pagamento', async ({ page }) => {
    await login(page)
    await addToCart(page, 'nft-001')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page.getByTestId('quote-loading')).toBeHidden()
    await page.waitForLoadState('networkidle')
    await hideDevtools(page)
    await expect(page).toHaveScreenshot('pagamento.png', { fullPage: true, mask: [page.locator('[data-sonner-toaster]')] })
  })
})
