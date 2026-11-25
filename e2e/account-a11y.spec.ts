import { expect, gotoApp, isMobile, login, test, USERS, toast } from './fixtures'

test.describe('Perfil e carteiras', () => {
  test('edição de perfil, avatar e senha com erros de validação', async ({ page }) => {
    await login(page)
    await page.goto('/perfil')
    await page.getByLabel('E-mail', { exact: true }).fill('invalido')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute('aria-invalid', 'true')

    // Conflict returned by the API.
    await page.getByLabel('E-mail', { exact: true }).fill(USERS.bruno.email)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Este e-mail já está em uso.')).toBeVisible()

    await page.getByLabel('E-mail', { exact: true }).fill('ana.nova@greenmint.test')
    await page.getByLabel('Nome de exibição').fill('Ana P. Prado')
    await page.locator('#profile-avatar').setInputFiles('e2e/assets/avatar.png')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Perfil atualizado.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana P. Prado')
    await expect(page.getByRole('img', { name: 'Seu avatar' })).toBeVisible()

    // Password: wrong current password, then success.
    await page.getByLabel('Senha atual').fill('errada123')
    await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha1')
    await page.getByLabel('Confirmar nova senha').fill('NovaSenha1')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Senha atual incorreta.').first()).toBeVisible()
    await page.getByLabel('Senha atual').fill(USERS.ana.password)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Senha alterada.')).toBeVisible()
  })

  test('cadastro e edição de carteiras com validação', async ({ page }) => {
    await login(page, 'bruno')
    await page.goto('/perfil/carteiras')
    await page.getByRole('button', { name: 'Adicionar carteira principal' }).click()
    const form = page.getByRole('form', { name: 'Carteira principal' })
    await form.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(form.getByText('Endereço inválido: use 0x seguido de 40 caracteres hexadecimais.')).toBeVisible()

    await form.getByLabel('Nome de exibição').fill('Bruno Lima')
    await form.getByLabel('Apelido da carteira').fill('Principal')
    await form.getByLabel('Nome do perfil').fill('brunolima')
    await form.getByLabel('Endereço da carteira').fill('0x1111111111111111111111111111111111111111')
    await form.getByLabel('Código de indicação').fill('KURIO-BR')
    await form.getByLabel('E-mail', { exact: true }).fill(USERS.bruno.email)
    await form.getByLabel('Nome ENS').fill('bruno')
    await form.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(page.getByTestId('primary-wallet')).toContainText('0x1111111111111111111111111111111111111111')

    // Secondary with the same address -> conflict from the API.
    await page.getByRole('button', { name: 'Adicionar carteira secundária' }).click()
    const second = page.getByRole('form', { name: 'Carteira secundária' })
    await second.getByLabel('Nome de exibição').fill('Bruno Lima')
    await second.getByLabel('Apelido da carteira').fill('Reserva')
    await second.getByLabel('Nome do perfil').fill('brunolima')
    await second.getByLabel('Endereço da carteira').fill('0x1111111111111111111111111111111111111111')
    await second.getByLabel('Código de indicação').fill('KURIO-BR')
    await second.getByLabel('E-mail', { exact: true }).fill(USERS.bruno.email)
    await second.getByLabel('Nome ENS').fill('bruno')
    await second.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(second.getByText(/Endereço já usado na carteira principal/)).toBeVisible()
    await second.getByLabel('Endereço da carteira').fill('0x2222222222222222222222222222222222222222')
    await second.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(page.getByTestId('secondary-wallet')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('primary-wallet')).toBeVisible()
    await expect(page.getByTestId('secondary-wallet')).toBeVisible()
  })
})

test.describe('Acessibilidade', () => {
  test('navegação por teclado, link de pular e foco visível', async ({ page }) => {
    test.skip(isMobile(page), 'teclado físico: desktop')
    await gotoApp(page, '/')
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#conteudo')).toBeFocused()
    // Tab reaches a card action and Enter opens the detail.
    const link = page.getByTestId('catalog-grid').getByRole('link', { name: 'Emerald Ape #042', exact: true })
    await link.focus()
    const outline = await link.evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/nft\/nft-001/)
  })

  test('diálogo prende o foco e devolve ao fechar', async ({ page }) => {
    test.skip(isMobile(page), 'busca do cabeçalho existe só no desktop')
    await gotoApp(page, '/')
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Buscar NFTs' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Nome, coleção ou criador')).toBeFocused()
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('formulário de login: erros associados aos campos', async ({ page }) => {
    await gotoApp(page, '/entrar')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    const email = page.getByLabel('E-mail', { exact: true })
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await email.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy}`)).toHaveText('Informe um e-mail válido.')
    await expect(email).toBeFocused()
  })

  test('sem overflow horizontal', async ({ page }) => {
    await login(page)
    for (const p of ['/', '/nft/nft-001', '/carrinho', '/entrar', '/perfil/carteiras']) {
      await gotoApp(page, p)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, p).toBeLessThanOrEqual(0)
    }
  })
})
