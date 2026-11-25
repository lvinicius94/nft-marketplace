import { addToCart, expect, fillCheckoutAndReview, gotoApp, login, test, toast } from './fixtures'

test.describe('Carrinho', () => {
  test('quantidades, remoção, cupom e persistência após refresh e login', async ({ page }) => {
    await addToCart(page, 'nft-001') // 1/50 edition, 1.19 ETH
    await addToCart(page, 'nft-002') // 1.69 ETH
    const rows = page.getByTestId('cart-row')
    await expect(rows).toHaveCount(2)
    await expect(page.getByTestId('summary-subtotal')).toHaveText('2.88 ETH')

    await rows.first().getByRole('button', { name: 'Aumentar' }).click()
    await expect(page.getByTestId('summary-subtotal')).toHaveText(/4\.0[0-9]+ ETH|4\.07 ETH/)

    // Coupons: invalid, expired, valid, removed.
    await page.getByLabel('Código promocional').fill('NAOEXISTE')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Cupom não encontrado.')).toBeVisible()
    await page.getByLabel('Código promocional').fill('BLACK30')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Cupom expirado.')).toBeVisible()
    await page.getByLabel('Código promocional').fill('green10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('coupon-applied')).toContainText('GREEN10')
    await expect(page.getByTestId('summary-discount')).not.toHaveText('(-) 00.00')

    // Remove an item.
    await page.getByRole('button', { name: /Remover Sage Nomad #009/ }).click()
    await expect(rows).toHaveCount(1)

    // Refresh keeps the cart; login preserves visitor items.
    await page.reload()
    await expect(rows).toHaveCount(1)
    await expect(page.getByTestId('coupon-applied')).toBeVisible()
    await login(page, 'bruno', '/carrinho')
    await expect(page).toHaveURL(/\/carrinho$/)
    await expect(page.getByTestId('cart-row')).toHaveCount(1)
    await expect(page.getByTestId('cart-row')).toContainText('Emerald Ape #042')
  })

  test('cupom LucasCamargo aplica 15% (sem diferenciar maiúsculas)', async ({ page }) => {
    await addToCart(page, 'nft-001') // 1.19 ETH
    await page.getByLabel('Código promocional').fill('LucasCamargo')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('coupon-applied')).toContainText('LUCASCAMARGO')
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.1785 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('1.0275 ETH')
  })

  test('promoção Black Friday: do carrossel ao NFT lendário com o cupom do criador', async ({ page }) => {
    await gotoApp(page, '/')
    const hero = page.getByRole('region', { name: 'Destaques' })
    await expect(hero.getByRole('heading', { level: 1 }).first()).toContainText('SUA PRIMEIRA NFT')
    await hero.getByRole('link', { name: /QUERO O MEU/ }).first().click()
    await expect(page).toHaveURL(/\/nft\/nft-golden-snub$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Golden Snub #001' })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: 'Lendário' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'COMPRAR', exact: true }).click()
    await page.getByLabel('Código promocional').fill('lucascamargo')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('summary-subtotal')).toHaveText('0.99 ETH')
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.1485 ETH')
  })

  test('valores em ETH mantêm precisão decimal', async ({ page }) => {
    await addToCart(page, 'nft-009', 3) // 0.39 * 3 = 1.17 (float would give 1.1700000000000002)
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.17 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('1.186 ETH')
  })
})

test.describe('Compra', () => {
  test('compra completa do catálogo ao recibo confirmado', async ({ page }) => {
    await login(page)
    await gotoApp(page, '/')
    await page.getByTestId('catalog-grid').getByRole('link', { name: 'Emerald Ape #042', exact: true }).click()
    await page.getByRole('button', { name: 'COMPRAR', exact: true }).click()
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/pagamento$/)
    await fillCheckoutAndReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page).toHaveURL(/\/pedido\/ord_/)
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('receipt-total')).toHaveText('1.206 ETH')
    await expect(page.getByRole('link', { name: /Ver no Etherscan/ })).toHaveAttribute('href', /etherscan\.io\/tx\/0x/)

    // Purchased items left the cart.
    await page.goto('/carrinho')
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible()
  })

  test('recibo é um snapshot: mudar o catálogo depois não altera o pedido', async ({ page, mocks }) => {
    await login(page)
    await addToCart(page, 'nft-001')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await fillCheckoutAndReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10_000 })
    await mocks.call('updateEdition', 'nft-001', 'nft-001-1-50', { priceEth: '9.99' })
    await page.reload()
    await expect(page.getByTestId('receipt-total')).toHaveText('1.206 ETH')
  })

  test('clique repetido cria um único pedido', async ({ page, mocks }) => {
    await login(page)
    await addToCart(page)
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await fillCheckoutAndReview(page)
    const confirm = page.getByTestId('confirm-order')
    await confirm.evaluate((b: HTMLButtonElement) => {
      b.click()
      b.click()
      b.click()
    })
    await expect(page).toHaveURL(/\/pedido\/ord_/)
    const snapshot = await mocks.call<{ orders: unknown[] }>('snapshot')
    expect(snapshot.orders).toHaveLength(1)
  })

  test.describe('pagamento recusado', () => {
    test.use({ scenario: 'payment-declined' })
    test('mostra recusa e preserva os itens', async ({ page }) => {
      await login(page)
      await addToCart(page)
      await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
      await fillCheckoutAndReview(page)
      await page.getByTestId('confirm-order').click()
      await expect(page.getByTestId('order-declined')).toBeVisible({ timeout: 10_000 })
      await page.getByRole('link', { name: 'Ver carrinho' }).click()
      await expect(page.getByTestId('cart-row')).toHaveCount(1)
    })
  })

  test.describe('timeout após criar o pedido', () => {
    test.use({ scenario: 'order-timeout' })
    test('recupera o mesmo pedido pela chave de idempotência', async ({ page, mocks }) => {
      test.setTimeout(60_000)
      await login(page)
      await addToCart(page)
      await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
      await fillCheckoutAndReview(page)
      await page.getByTestId('confirm-order').click()
      // First request times out (8s); the client retries with the same Idempotency-Key.
      await expect(page).toHaveURL(/\/pedido\/ord_/, { timeout: 25_000 })
      const snapshot = await mocks.call<{ orders: { idempotencyKey: string }[] }>('snapshot')
      expect(snapshot.orders).toHaveLength(1)
      await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10_000 })
    })
  })

  test('carteira: recusa e desconexão simuladas', async ({ page }) => {
    await login(page)
    await addToCart(page)
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await page.getByRole('button', { name: 'Conectar carteira' }).click()
    await page.getByRole('button', { name: 'Recusar' }).click()
    await expect(toast(page, 'Conexão recusada na carteira.')).toBeVisible()
    await expect(page.getByTestId('wallet-connection')).toContainText('desconectada')
    await page.getByRole('button', { name: 'Conectar carteira' }).click()
    await page.getByRole('button', { name: 'Aprovar conexão' }).click()
    await expect(page.getByTestId('wallet-connection')).toContainText('Conectada em Ethereum')
    await page.getByRole('button', { name: 'Desconectar' }).click()
    await expect(page.getByTestId('wallet-connection')).toContainText('desconectada')
    // Polygon only has the secondary wallet.
    await page.getByLabel('Rede', { exact: true }).selectOption('polygon')
    await expect(page.getByRole('radio', { name: /Reserva/ })).toBeChecked()
  })
})
