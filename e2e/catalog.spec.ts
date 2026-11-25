import { expect, gotoApp, isMobile, test } from './fixtures'

test.describe('Catálogo', () => {
  test('busca, filtros combinados, ordenação, paginação e restauração pelo histórico', async ({ page }) => {
    await gotoApp(page, '/')
    const grid = page.getByTestId('catalog-grid')
    await expect(grid.getByTestId('nft-card')).toHaveCount(9)

    // Pagination keeps other params; filter change resets page.
    await page.getByRole('navigation', { name: 'Paginação do catálogo' }).getByRole('button', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/page=2/)

    if (isMobile(page)) {
      await page.getByRole('button', { name: /^Filtros/ }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: /Arte digital/ }).click()
      await dialog.getByRole('button', { name: /Ethereum/ }).click()
      await dialog.getByRole('button', { name: /Ver .* resultados/ }).click()
    } else {
      const filters = page.getByRole('complementary', { name: 'Filtros' })
      await filters.getByRole('button', { name: /Arte digital/ }).click()
      await expect(page).not.toHaveURL(/page=2/)
      await filters.getByRole('button', { name: /Ethereum/ }).click()
    }
    await expect(page).toHaveURL(/category=.*arte-digital/)
    await expect(page).toHaveURL(/chain=.*ethereum/)
    await expect(page).not.toHaveURL(/page=/)
    await expect(page.getByRole('status').filter({ hasText: 'resultado' })).toBeVisible()

    // Sort by price ascending: prices are non-decreasing.
    await page.getByLabel('Ordenar por:').selectOption('price_asc')
    await expect(page).toHaveURL(/sort=price_asc/)
    const prices = await grid.getByTestId('nft-card').locator('p').evaluateAll((els) => els.map((e) => parseFloat(e.textContent!.split(' ')[0])))
    expect(prices).toEqual([...prices].sort((a, b) => a - b))

    // Search composes with the filters.
    const search = isMobile(page) ? page.locator('#mobile-search') : page.locator('#desktop-search')
    await search.fill('Emerald')
    await search.press('Enter')
    await expect(page).toHaveURL(/q=Emerald/)
    await expect(grid.getByTestId('nft-card').first()).toContainText('Emerald')

    // Refresh keeps everything.
    await page.reload()
    await expect(page).toHaveURL(/q=Emerald/)
    await expect(search).toHaveValue('Emerald')
    await expect(grid.getByTestId('nft-card').first()).toContainText('Emerald')

    // History back restores the previous state.
    await page.goBack()
    await expect(page).not.toHaveURL(/q=Emerald/)
    await expect(page).toHaveURL(/sort=price_asc/)
  })

  test('resultado vazio com ação de limpar filtros', async ({ page }) => {
    await gotoApp(page, '/?q=inexistente-xyz')
    await expect(page.getByText('Nenhum NFT encontrado.')).toBeVisible()
    await page.getByRole('link', { name: 'Limpar filtros', exact: true }).click()
    await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
  })

  test('parâmetros inválidos na URL são ignorados', async ({ page }) => {
    await gotoApp(page, '/?sort=hack&page=-3&category=%5B%22nada%22%5D')
    await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
  })

  test.describe('rede lenta e falhas', () => {
    test.use({ scenario: 'slow' })
    test('skeletons com shimmer durante carregamento lento', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByTestId('catalog-loading')).toBeVisible()
      await expect(page.getByTestId('nft-card-skeleton').first()).toBeVisible()
      await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('catalog-loading')).toBeHidden()
    })
  })

  test.describe('falha e nova tentativa', () => {
    test.use({ scenario: 'catalog-unavailable' })
    test('feedback de falha e recuperação após nova tentativa', async ({ page, mocks }) => {
      await page.goto('/')
      await expect(page.getByText('Não foi possível carregar o catálogo.')).toBeVisible({ timeout: 15_000 })
      await mocks.setScenario('fast')
      await page.getByRole('button', { name: 'Tentar novamente' }).click()
      await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
    })
  })

  test.describe('respostas fora de ordem', () => {
    test.use({ scenario: 'out-of-order' })
    test('a resposta obsoleta não sobrescreve a mais recente', async ({ page }) => {
      test.skip(isMobile(page), 'mesma lógica nos dois viewports')
      await gotoApp(page, '/')
      await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 10_000 })
      const filters = page.getByRole('complementary', { name: 'Filtros' })
      await filters.getByRole('button', { name: /Fotografia/ }).click()
      await filters.getByRole('button', { name: /Música/ }).click()
      await expect(page).toHaveURL(/musica/)
      const status = page.getByRole('status').filter({ hasText: 'resultado' })
      await expect(status).toContainText('12 resultados', { timeout: 10_000 })
      // The slower, older response (only "Fotografia") arrives later and must not overwrite it.
      await page.waitForTimeout(2500)
      await expect(status).toContainText('12 resultados')
      await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
    })
  })
})
