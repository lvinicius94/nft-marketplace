import { addToCart, expect, gotoApp, login, test, USERS, toast } from './fixtures'

test.describe('Conta e sessão', () => {
  test('cadastro com validação e conflito, depois conta nova', async ({ page }) => {
    await gotoApp(page, '/cadastro')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('Use de 3 a 20 letras, números, ponto ou _.')).toBeVisible()
    await expect(page.getByLabel('Nome de usuário')).toBeFocused()

    await page.getByLabel('Nome de usuário').fill('novo_colecionador')
    await page.getByLabel('E-mail', { exact: true }).fill(USERS.ana.email) // conflict
    await page.getByLabel('Senha', { exact: true }).fill('Segura123')
    await page.getByLabel('Confirmar senha').fill('Segura123')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('Este e-mail já está cadastrado.')).toBeVisible()

    await page.getByLabel('E-mail', { exact: true }).fill('novo@greenmint.test')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('Perfil criado! Bem-vindo à Kurio.')).toBeVisible()
    await page.reload()
    await page.goto('/perfil')
    await expect(page.getByLabel('Nome de usuário')).toHaveValue('novo_colecionador')
  })

  test('login com credenciais inválidas e retorno ao fluxo anterior', async ({ page }) => {
    await gotoApp(page, '/perfil/carteiras')
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fperfil%2Fcarteiras/)
    await page.getByLabel('E-mail', { exact: true }).fill(USERS.ana.email)
    await page.getByLabel('Senha', { exact: true }).fill('errada')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await page.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/perfil\/carteiras$/)
  })

  test('sessão recuperada após refresh e expiração durante a navegação', async ({ page, mocks }) => {
    await login(page)
    await page.goto('/perfil')
    await expect(page.getByLabel('Nome de usuário')).toHaveValue(USERS.ana.username)
    await page.reload()
    await expect(page.getByLabel('Nome de usuário')).toHaveValue(USERS.ana.username)

    await mocks.call('expireSessions')
    await page.getByRole('link', { name: 'Carteiras' }).click()
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fperfil%2Fcarteiras/)
    await expect(page.getByText('Sua sessão expirou. Entre novamente para continuar de onde parou.')).toBeVisible()
  })

  test('sessão expira pelo relógio (clock controlado do Playwright)', async ({ page }) => {
    await page.clock.install()
    await login(page)
    await page.goto('/perfil')
    await expect(page.getByLabel('Nome de usuário')).toHaveValue(USERS.ana.username)
    // Sessions last 1h in the test scenario; jump past it without waiting.
    await page.clock.fastForward('01:01:00')
    await page.getByRole('link', { name: 'Carteiras' }).click()
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fperfil%2Fcarteiras/)
  })

  test('expiração no checkout preserva o contexto para retomada', async ({ page, mocks }) => {
    await login(page)
    await addToCart(page)
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await page.getByLabel('Código de indicação').fill('CODIGO-SALVO')
    await mocks.call('expireSessions')
    await page.getByLabel('Rede', { exact: true }).selectOption('polygon') // triggers a new quote -> 401
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fpagamento/)
    await page.getByLabel('E-mail', { exact: true }).fill(USERS.ana.email)
    await page.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/pagamento$/)
    await expect(page.getByLabel('Código de indicação')).toHaveValue('CODIGO-SALVO')
    await expect(page.getByTestId('cart-row')).toHaveCount(0) // we are on checkout, items come from the quote
    await expect(page.getByText('Emerald Ape #042').first()).toBeVisible()
  })

  test('logout e troca de usuário limpam dados privados', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'nft-006')
    await page.goto('/perfil/favoritos')
    await expect(page.getByTestId('favorites-grid')).toBeVisible() // Ana has seeded favorites
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(toast(page, 'Você saiu da sua conta.')).toBeVisible()

    await login(page, 'bruno')
    await page.goto('/perfil/favoritos')
    await expect(page.getByText('Você ainda não favoritou nenhum NFT.')).toBeVisible()
    await page.goto('/carrinho')
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible()
    await page.goto('/perfil/carteiras')
    await expect(page.getByText('Você ainda não adicionou uma carteira secundária.')).toBeVisible()
    await expect(page.getByTestId('primary-wallet')).toHaveCount(0)
  })
})
