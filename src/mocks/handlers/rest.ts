import { delay, http, HttpResponse, type DefaultBodyType, type PathParams, type StrictRequest } from 'msw'
import type {
  AddCartItemRequest,
  ChangePasswordRequest,
  CreateOrderRequest,
  LoginRequest,
  Network,
  NftCategory,
  NftListParams,
  NftRarity,
  NftSort,
  RegisterRequest,
  UpdateCartItemRequest,
  UpdateProfileRequest,
  WalletInput,
} from '@/api/contracts'
import { isEthString } from '@/lib/eth'
import * as db from '../db'
import { MockError } from '../db'
import { scenario, type EndpointKey } from '../scenarios'

export const API = '/api'

const NETWORKS: Network[] = ['ethereum', 'polygon', 'solana']
let listSequence = 0

// ---------- Infrastructure ----------
function errorResponse(error: MockError) {
  return HttpResponse.json(
    { error: { code: error.code, message: error.message, fields: error.fields, details: error.details } },
    { status: error.status },
  )
}

const FAILURE_MESSAGES: Record<number, [string, string]> = {
  400: ['VALIDATION_ERROR', 'Requisição inválida.'],
  401: ['UNAUTHENTICATED', 'Sessão inválida.'],
  403: ['FORBIDDEN', 'Acesso negado.'],
  404: ['NOT_FOUND', 'Recurso não encontrado.'],
  409: ['OUT_OF_STOCK', 'Conflito de disponibilidade.'],
  422: ['VALIDATION_ERROR', 'Dados inválidos.'],
  500: ['UNAVAILABLE', 'Erro interno no servidor simulado.'],
  503: ['UNAVAILABLE', 'Serviço temporariamente indisponível.'],
}

/**
 * Wraps a resolver with the scenario's network conditions: latency, offline mode,
 * configured failures and translation of MockError into the error contract.
 */
function route<P extends Record<string, string>>(
  key: EndpointKey | null,
  resolver: (ctx: { request: StrictRequest<DefaultBodyType>; params: P; latency: number }) => Promise<Response> | Response,
) {
  return async ({ request, params: rawParams }: { request: StrictRequest<DefaultBodyType>; params: PathParams }) => {
    const params = rawParams as unknown as P
    const sc = scenario.get()
    const latency = scenario.nextLatency()
    if (sc.offline) {
      await delay(Math.min(latency, 400))
      return HttpResponse.error()
    }
    const failure = key ? scenario.failureFor(key) : null
    await delay(latency)
    if (failure === 'network') return HttpResponse.error()
    if (typeof failure === 'number') {
      const [code, message] = FAILURE_MESSAGES[failure]
      return HttpResponse.json({ error: { code, message } }, { status: failure })
    }
    try {
      return await resolver({ request, params, latency })
    } catch (e) {
      if (e instanceof MockError) return errorResponse(e)
      console.error('[mocks] unexpected error', e)
      return HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'Erro inesperado no mock.' } }, { status: 500 })
    }
  }
}

function bearer(request: Request) {
  const header = request.headers.get('authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

/** Resolves the authenticated user or throws 401 (missing) / 401 SESSION_EXPIRED. */
function requireUser(request: Request) {
  const result = db.sessionFromToken(bearer(request))
  if (result.status === 'expired') throw new MockError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.')
  if (result.status !== 'ok') throw new MockError(401, 'UNAUTHENTICATED', 'Faça login para continuar.')
  return result.user
}

/** Optional auth: guests use the X-Cart-Id header; an expired token is still an error. */
function optionalUser(request: Request) {
  const token = bearer(request)
  if (!token) return null
  return requireUser(request)
}

function cartIdOf(request: Request) {
  return request.headers.get('x-cart-id') ?? ''
}

async function json<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new MockError(400, 'VALIDATION_ERROR', 'JSON inválido.')
  }
}

// ---------- Validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const ENS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i

function validate(fields: Record<string, string | false | undefined>) {
  const errors = Object.fromEntries(Object.entries(fields).filter(([, v]) => !!v)) as Record<string, string>
  if (Object.keys(errors).length) throw new MockError(422, 'VALIDATION_ERROR', 'Corrija os campos destacados.', { fields: errors })
}

const passwordProblem = (p: string | undefined) =>
  !p ? 'Informe a senha.' : p.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : !/[A-Z]/.test(p) || !/\d/.test(p) ? 'Use ao menos uma letra maiúscula e um número.' : false

// ---------- Handlers ----------
export const restHandlers = [
  // Session & account
  http.post(`${API}/auth/register`, route('auth.register', async ({ request }) => {
    const body = await json<RegisterRequest>(request)
    validate({
      username: !USERNAME_RE.test(body.username ?? '') && 'Use de 3 a 20 letras, números, ponto ou _.',
      email: !EMAIL_RE.test(body.email ?? '') && 'Informe um e-mail válido.',
      password: passwordProblem(body.password),
    })
    const session = await db.register(body)
    db.mergeGuestCart(cartIdOf(request), session.user.id)
    return HttpResponse.json(session, { status: 201 })
  })),

  http.post(`${API}/auth/login`, route('auth.login', async ({ request }) => {
    const body = await json<LoginRequest>(request)
    validate({ email: !EMAIL_RE.test(body.email ?? '') && 'Informe um e-mail válido.', password: !body.password && 'Informe a senha.' })
    const session = await db.login(body.email, body.password)
    db.mergeGuestCart(cartIdOf(request), session.user.id)
    return HttpResponse.json(session)
  })),

  http.get(`${API}/auth/session`, route(null, ({ request }) => {
    const user = requireUser(request)
    const result = db.sessionFromToken(bearer(request))
    const expiresAt = result.status === 'ok' ? new Date(result.session.expiresAt).toISOString() : null
    return HttpResponse.json({ user: db.getUser(user.id), expiresAt })
  })),

  http.post(`${API}/auth/logout`, route(null, ({ request }) => {
    const token = bearer(request)
    if (token) db.logout(token)
    return new HttpResponse(null, { status: 204 })
  })),

  // Catalog
  http.get(`${API}/nfts`, route('nfts.list', async ({ request }) => {
    const url = new URL(request.url)
    const sp = url.searchParams
    const params: NftListParams = {
      q: sp.get('q') ?? undefined,
      tab: (sp.get('tab') as NftListParams['tab']) ?? undefined,
      category: sp.getAll('category') as NftCategory[],
      chain: sp.getAll('chain') as Network[],
      rarity: sp.getAll('rarity') as NftRarity[],
      minPrice: sp.get('minPrice') ?? undefined,
      maxPrice: sp.get('maxPrice') ?? undefined,
      availableOnly: sp.get('availableOnly') === 'true',
      sort: (sp.get('sort') as NftSort) ?? undefined,
      page: Number(sp.get('page') ?? 1),
      pageSize: Number(sp.get('pageSize') ?? 9),
    }
    validate({
      minPrice: !!params.minPrice && !isEthString(params.minPrice) && 'Preço mínimo inválido.',
      maxPrice: !!params.maxPrice && !isEthString(params.maxPrice) && 'Preço máximo inválido.',
    })
    if (scenario.get().outOfOrder) {
      // Older requests take longer than newer ones, so responses arrive out of order.
      listSequence += 1
      const extra = Math.max(0, 1800 - (listSequence % 4) * 600)
      await delay(extra)
    }
    return HttpResponse.json(db.listNfts(params))
  })),

  http.get<{ id: string }>(`${API}/nfts/:id`, route('nfts.detail', ({ params }) => HttpResponse.json(db.getNft(params.id)))),

  // Favorites
  http.get(`${API}/favorites`, route(null, ({ request }) => HttpResponse.json({ nftIds: db.getFavorites(requireUser(request).id) }))),
  http.put<{ nftId: string }>(`${API}/favorites/:nftId`, route('favorites.add', ({ request, params }) =>
    HttpResponse.json({ nftIds: db.setFavorite(requireUser(request).id, params.nftId, true) }))),
  http.delete<{ nftId: string }>(`${API}/favorites/:nftId`, route('favorites.remove', ({ request, params }) =>
    HttpResponse.json({ nftIds: db.setFavorite(requireUser(request).id, params.nftId, false) }))),

  // Cart
  http.get(`${API}/cart`, route('cart.read', ({ request }) => HttpResponse.json(db.getCart(cartIdOf(request), optionalUser(request)?.id ?? null)))),
  http.post(`${API}/cart/items`, route('cart.write', async ({ request }) => {
    const user = optionalUser(request)
    const body = await json<AddCartItemRequest>(request)
    return HttpResponse.json(db.addCartItem(cartIdOf(request), user?.id ?? null, body))
  })),
  http.patch<{ nftId: string; editionId: string }>(`${API}/cart/items/:nftId/:editionId`, route('cart.write', async ({ request, params }) => {
    const user = optionalUser(request)
    const body = await json<UpdateCartItemRequest>(request)
    return HttpResponse.json(db.updateCartItem(cartIdOf(request), user?.id ?? null, params.nftId, params.editionId, body.quantity))
  })),
  http.delete<{ nftId: string; editionId: string }>(`${API}/cart/items/:nftId/:editionId`, route('cart.write', ({ request, params }) =>
    HttpResponse.json(db.removeCartItem(cartIdOf(request), optionalUser(request)?.id ?? null, params.nftId, params.editionId)))),
  http.put(`${API}/cart/coupon`, route('cart.write', async ({ request }) => {
    const body = await json<{ code: string }>(request)
    validate({ code: !body.code?.trim() && 'Informe um cupom.' })
    return HttpResponse.json(db.applyCoupon(cartIdOf(request), optionalUser(request)?.id ?? null, body.code))
  })),
  http.delete(`${API}/cart/coupon`, route('cart.write', ({ request }) =>
    HttpResponse.json(db.removeCoupon(cartIdOf(request), optionalUser(request)?.id ?? null)))),
  http.post(`${API}/cart/acknowledge-prices`, route('cart.write', ({ request }) =>
    HttpResponse.json(db.acknowledgeCartPrices(cartIdOf(request), optionalUser(request)?.id ?? null)))),

  // Quote (authenticated: it is the checkout reference)
  http.post(`${API}/quotes`, route('quote', async ({ request }) => {
    const user = requireUser(request)
    const body = await json<{ network: Network }>(request)
    validate({ network: !NETWORKS.includes(body.network) && 'Rede inválida.' })
    return HttpResponse.json(db.createQuote(cartIdOf(request), user.id, body.network), { status: 201 })
  })),

  // Orders
  http.post(`${API}/orders`, route('orders.create', async ({ request }) => {
    const user = requireUser(request)
    const key = request.headers.get('idempotency-key')
    if (!key) throw new MockError(400, 'VALIDATION_ERROR', 'Cabeçalho Idempotency-Key é obrigatório.')
    const body = await json<CreateOrderRequest>(request)
    validate({
      'buyer.displayName': !body.buyer?.displayName?.trim() && 'Informe o nome de exibição.',
      'buyer.username': !USERNAME_RE.test(body.buyer?.username ?? '') && 'Use de 3 a 20 letras, números, ponto ou _.',
      'buyer.profileName': !body.buyer?.profileName?.trim() && 'Informe o nome do perfil.',
      'buyer.email': !EMAIL_RE.test(body.buyer?.email ?? '') && 'Informe um e-mail válido.',
      'buyer.referralCode': !body.buyer?.referralCode?.trim() && 'Informe o código de indicação.',
      'buyer.ensName': !ENS_RE.test(body.buyer?.ensName ?? '') && 'Informe um nome ENS válido.',
      network: !NETWORKS.includes(body.network) && 'Selecione a rede.',
      walletId: !body.walletId && 'Selecione uma carteira.',
    })
    const { order, replayed } = db.createOrder(user.id, key, body)
    if (scenario.get().orderTimeout && !replayed) {
      // The order exists, but the response arrives after the client gives up (timeout).
      await delay(15_000)
    }
    return HttpResponse.json(order, { status: replayed ? 200 : 201 })
  })),
  http.get(`${API}/orders`, route(null, ({ request }) => HttpResponse.json(db.listOrders(requireUser(request).id)))),
  http.get<{ id: string }>(`${API}/orders/:id`, route(null, ({ request, params }) => HttpResponse.json(db.getOrder(requireUser(request).id, params.id)))),

  // Profile
  http.get(`${API}/me`, route(null, ({ request }) => HttpResponse.json(db.getUser(requireUser(request).id)))),
  http.put(`${API}/me`, route('profile.update', async ({ request }) => {
    const user = requireUser(request)
    const body = await json<UpdateProfileRequest>(request)
    validate({
      name: !body.name?.trim() && 'Informe seu nome.',
      username: !USERNAME_RE.test(body.username ?? '') && 'Use de 3 a 20 letras, números, ponto ou _.',
      email: !EMAIL_RE.test(body.email ?? '') && 'Informe um e-mail válido.',
      ensName: !!body.ensName && !ENS_RE.test(body.ensName) && 'Use letras, números, hífen e ponto.',
      walletNickname: !body.walletNickname?.trim() && 'Informe o apelido da carteira.',
      avatarDataUrl: typeof body.avatarDataUrl === 'string' && (!body.avatarDataUrl.startsWith('data:image/') || body.avatarDataUrl.length > 1_500_000) && 'Envie uma imagem de até 1 MB.',
    })
    return HttpResponse.json(db.updateProfile(user.id, body))
  })),
  http.post(`${API}/me/password`, route('profile.update', async ({ request }) => {
    const user = requireUser(request)
    const body = await json<ChangePasswordRequest>(request)
    validate({ currentPassword: !body.currentPassword && 'Informe a senha atual.', newPassword: passwordProblem(body.newPassword) || (body.newPassword === body.currentPassword && 'A nova senha deve ser diferente da atual.') })
    await db.changePassword(user.id, body.currentPassword, body.newPassword)
    return new HttpResponse(null, { status: 204 })
  })),

  // Wallets
  http.get(`${API}/wallets`, route(null, ({ request }) => HttpResponse.json(db.getWallets(requireUser(request).id)))),
  http.put<{ role: string }>(`${API}/wallets/:role`, route('wallets.write', async ({ request, params }) => {
    const user = requireUser(request)
    if (params.role !== 'primary' && params.role !== 'secondary') throw new MockError(404, 'NOT_FOUND', 'Tipo de carteira inexistente.')
    const body = await json<WalletInput>(request)
    validate({
      displayName: !body.displayName?.trim() && 'Informe o nome de exibição.',
      label: !body.label?.trim() && 'Informe o apelido da carteira.',
      network: !NETWORKS.includes(body.network) && 'Selecione uma rede.',
      profileName: !body.profileName?.trim() && 'Informe o nome do perfil.',
      address: !(body.network === 'solana' ? SOLANA_RE : ADDRESS_RE).test(body.address ?? '') &&
        (body.network === 'solana' ? 'Endereço Solana inválido (base58, 32 a 44 caracteres).' : 'Endereço inválido: use 0x seguido de 40 caracteres hexadecimais.'),
      provider: !['metamask', 'walletconnect', 'coinbase'].includes(body.provider) && 'Selecione o tipo de carteira.',
      referralCode: !body.referralCode?.trim() && 'Informe o código de indicação.',
      email: !EMAIL_RE.test(body.email ?? '') && 'Informe um e-mail válido.',
      ensName: !ENS_RE.test(body.ensName ?? '') && 'Informe um nome ENS válido.',
    })
    return HttpResponse.json(db.upsertWallet(user.id, params.role, body))
  })),
  http.post<{ id: string }>(`${API}/wallets/:id/connect`, route(null, async ({ request, params }) => {
    const user = requireUser(request)
    const body = await json<{ network: Network; simulate?: 'approve' | 'reject' }>(request)
    const wallet = db.getWallets(user.id).find((w) => w.id === params.id)
    if (!wallet) throw new MockError(404, 'NOT_FOUND', 'Carteira não encontrada.')
    if (wallet.network !== body.network) throw new MockError(422, 'VALIDATION_ERROR', 'Esta carteira não suporta a rede escolhida.', { fields: { network: 'Rede não suportada.' } })
    if (body.simulate === 'reject') throw new MockError(403, 'FORBIDDEN', 'Conexão recusada na carteira.')
    return HttpResponse.json({ walletId: wallet.id, network: body.network, connected: true })
  })),

  // Unknown API routes -> 404 in the error contract.
  http.all(`${API}/*`, route(null, () => {
    throw new MockError(404, 'NOT_FOUND', 'Rota de API inexistente.')
  })),
]
