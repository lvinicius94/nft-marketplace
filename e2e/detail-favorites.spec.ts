import { expect, gotoApp, login, test } from './fixtures'

test.describe('Detalhe do NFT', () => {
  test('acesso direto, edição indisponível e limite de quantidade', async ({ page }) => {
    await gotoApp(page, '/nft/nft-001')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
    await expect(page.getByTestId('detail-price')).toHaveText('1.19 ETH')

    // nft-001 has the 1/1 edition sold out.
    await page.getByRole('radio', { name: /Edição 1\/1,/ }).click()
    await expect(page.getByText('Esta edição está esgotada. Escolha outra edição.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'COMPRAR', exact: true })).toBeDisabled()

    // 1/10 edition: limited by stock (2) and maxPerOrder (3).
    await page.getByRole('radio', { name: /Edição 1\/10,/ }).click()
    const plus = page.getByRole('button', { name: 'Aumentar quantidade' })
    await plus.click()
    await expect(page.getByTestId('quantity')).toHaveText('2')
    await expect(plus).toBeDisabled()
  })

  test('edição fora de venda aparece indisponível', async ({ page }) => {
    await gotoApp(page, '/nft/nft-002')
    await page.getByRole('radio', { name: /Edição ABERTA,/ }).click()
    await expect(page.getByText(/indisponível para venda/)).toBeVisible()
  })

  test('NFT inexistente mostra 404', async ({ page }) => {
    await gotoApp(page, '/nft/nao-existe')
    await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible()
  })

  test('rota inexistente mostra 404', async ({ page }) => {
    await gotoApp(page, '/rota/qualquer')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})

test.describe('Favoritos', () => {
  test('visitante é levado ao login; favorito persiste para o usuário', async ({ page }) => {
    await gotoApp(page, '/nft/nft-003')
    await page.getByRole('button', { name: 'Favoritar' }).click()
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fnft%2Fnft-003/)
    await page.getByLabel('E-mail', { exact: true }).fill('ana@greenmint.test')
    await page.getByLabel('Senha', { exact: true }).fill('Colecionador@1')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/nft\/nft-003/)
    const fav = page.getByRole('button', { name: /Favoritar|Favoritado/ })
    await fav.click()
    await expect(fav).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.getByRole('button', { name: /Favoritado/ })).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/perfil/favoritos')
    await expect(page.getByTestId('favorites-grid')).toContainText('Neon Vessel #552')
  })

  test.describe('falha de mutation', () => {
    test.use({ scenario: 'favorites-fail' })
    test('atualização otimista com rollback e recuperação', async ({ page, mocks }) => {
      await login(page)
      await gotoApp(page, '/nft/nft-004')
      const fav = page.getByRole('button', { name: /Favoritar|Favoritado/ })
      await expect(fav).toHaveAttribute('aria-pressed', 'false')
      await fav.click()
      await expect(page.getByText('Não foi possível atualizar os favoritos.')).toBeVisible()
      await expect(fav).toHaveAttribute('aria-pressed', 'false')
      // Recovery: the backend is healthy again and the same action succeeds.
      await mocks.setScenario('fast')
      await fav.click()
      await expect(fav).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
