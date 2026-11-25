import { addToCart, expect, fillCheckoutAndReview, login, test } from './fixtures'

test.describe('Tempo real (Socket.IO via MSW)', () => {
  test('preço muda no checkout: interface avisa e impede cotação desatualizada', async ({ page, mocks }) => {
    await login(page)
    await addToCart(page, 'nft-001')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await fillCheckoutAndReview(page)

    // Back office changes the price -> nft.updated over Socket.IO -> new quote.
    await mocks.call('updateEdition', 'nft-001', 'nft-001-1-50', { priceEth: '1.50' })
    await expect(page.getByTestId('review-dialog')).toBeHidden()
    await expect(page.getByTestId('checkout-changed')).toContainText('mudaram')
    await expect(page.getByTestId('quote-issues')).toContainText('mudou de 1.19 para 1.50 ETH')
    await expect(page.getByRole('button', { name: 'Confirmar compra' })).toBeDisabled()

    await page.getByRole('button', { name: 'Aceitar novos preços' }).click()
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.50 ETH')
    await page.getByRole('button', { name: 'Confirmar compra' }).click()
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('receipt-total')).toHaveText('1.516 ETH')
  })

  test('edição esgota no carrinho: aviso e bloqueio', async ({ page, mocks }) => {
    await addToCart(page, 'nft-001')
    await mocks.call('updateEdition', 'nft-001', 'nft-001-1-50', { available: 0 })
    await expect(page.getByTestId('cart-alert')).toContainText('esgotados')
    await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()
    await expect(page.getByTestId('cart-row')).toContainText('Esgotado')
  })

  test('evento duplicado e evento antigo não regridem o estado', async ({ page, mocks }) => {
    await page.goto('/nft/nft-001')
    const status = page.getByTestId('edition-status')
    await expect(status).toContainText('1/50: 1.19 ETH')
    await mocks.call('updateEdition', 'nft-001', 'nft-001-1-50', { priceEth: '1.25', available: 7 })
    await expect(status).toContainText('1/50: 1.25 ETH · 7 disponíveis')
    await mocks.call('replayLastEvent')
    await mocks.call('emitStaleNftEvent', 'nft-001') // version - 1 with price 0.01 and stock 999
    await page.waitForTimeout(500)
    await expect(status).toContainText('1/50: 1.25 ETH · 7 disponíveis')
  })

  test('desconexão com pedido pendente: retomada após reconectar e após recarregar', async ({ page, mocks }) => {
    await page.clock.install()
    await login(page)
    await mocks.setScenario('default') // 2.5s settlement window
    await addToCart(page)
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await fillCheckoutAndReview(page)
    await mocks.call('setRealtimeBlocked', true)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    await expect(page.getByText(/Reconectando|indisponíveis/)).toBeVisible()

    // The order settles (2.5s timer) while the socket is down; the event is lost.
    await page.clock.runFor(3000)
    await expect(page.getByTestId('order-pending')).toBeVisible()

    // Reconnect -> REST reconciliation brings the terminal state.
    await mocks.call('setRealtimeBlocked', false)
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10_000 })

    // Reload keeps the same order (no new purchase).
    await page.reload()
    await expect(page.getByTestId('order-confirmed')).toBeVisible()
    const snapshot = await mocks.call<{ orders: unknown[] }>('snapshot')
    expect(snapshot.orders).toHaveLength(1)
  })

  test('evento de pedido de outro usuário não vaza', async ({ page, mocks }) => {
    await login(page, 'bruno')
    // Bruno's socket never receives Ana's private order events: list stays empty.
    await page.goto('/perfil/pedidos')
    await expect(page.getByText('Nenhum pedido ainda.')).toBeVisible()
    expect(await mocks.call<number>('realtimeConnections')).toBeGreaterThan(0)
  })
})
