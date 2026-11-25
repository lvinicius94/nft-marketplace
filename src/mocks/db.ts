/**
 * In-memory mock database, persisted to localStorage so refreshes keep a consistent state.
 * Every REST handler and every realtime event reads/writes through this module, so the
 * catalog, favorites, cart, profile, wallets and orders always agree with each other.
 */
import type {
  BuyerInfo,
  Cart,
  CartItem,
  Coupon,
  Edition,
  Network,
  NftDetail,
  NftCategory,
  NftListParams,
  NftListResponse,
  NftSummary,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
  Quote,
  QuoteIssue,
  QuoteLine,
  User,
  Wallet,
  WalletInput,
} from '@/api/contracts'
import { addEth, compareEth, mulEth, percentEth, subEth, toWei } from '@/lib/eth'
import { buildNftFixtures, CATEGORIES } from './fixtures/nfts'
import { fakeHex, mockId } from './random'
import { scenario } from './scenarios'

// ---------- Types ----------
interface UserRecord extends User {
  passwordSalt: string
  passwordHash: string
}
interface SessionRecord {
  token: string
  userId: string
  expiresAt: number
}
interface CartRecord {
  id: string
  userId: string | null
  items: { nftId: string; editionId: string; quantity: number; addedPriceEth: string }[]
  couponCode: string | null
  updatedAt: string
}
interface OrderRecord extends Order {
  userId: string
  idempotencyKey: string
  requestHash: string
  settleAt: number
  /** Cart lines reserved by this order (removed from the cart on confirmation). */
  reserved: { nftId: string; editionId: string; quantity: number }[]
}
interface QuoteRecord {
  userId: string
  cartId: string
  quote: Quote
  fingerprint: string
}
interface DbState {
  schema: 3
  users: UserRecord[]
  sessions: SessionRecord[]
  nfts: NftDetail[]
  favorites: Record<string, string[]>
  carts: Record<string, CartRecord>
  wallets: Record<string, Wallet[]>
  orders: OrderRecord[]
  quotes: Record<string, QuoteRecord>
  checkoutChangeApplied: boolean
}

export class MockError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  details?: unknown
  constructor(status: number, code: string, message: string, extra?: { fields?: Record<string, string>; details?: unknown }) {
    super(message)
    this.status = status
    this.code = code
    this.fields = extra?.fields
    this.details = extra?.details
  }
}

// ---------- Seed ----------
const STORAGE_KEY = 'nft-mock-db'

export const SEED_USERS = [
  { email: 'ana@greenmint.test', password: 'Colecionador@1' },
  { email: 'bruno@greenmint.test', password: 'Colecionador@2' },
] as const

function seed(): DbState {
  const users: UserRecord[] = [
    {
      id: 'user-ana',
      name: 'Ana Prado',
      username: 'anaprado',
      email: SEED_USERS[0].email,
      ensName: 'nova',
      walletNickname: 'Principal',
      avatarUrl: null,
      passwordSalt: 'salt-ana',
      passwordHash: '800fd681a0594d0017dab8d2d7d7c91548eeb8b1402ad32ad45521dcfc61dd60',
    },
    {
      id: 'user-bruno',
      name: 'Bruno Lima',
      username: 'brunolima',
      email: SEED_USERS[1].email,
      ensName: null,
      walletNickname: 'Minha carteira',
      avatarUrl: null,
      passwordSalt: 'salt-bruno',
      passwordHash: '8867980a7b1dc9baf3eecbe84b548fc77c9ca1a599c673b1a69c449da1f8fd4b',
    },
  ]
  return {
    schema: 3,
    users,
    sessions: [],
    nfts: buildNftFixtures(),
    favorites: { 'user-ana': ['nft-002', 'nft-005'], 'user-bruno': [] },
    carts: {},
    wallets: {
      'user-ana': [
        { id: 'wallet-ana-1', role: 'primary', displayName: 'Ana Prado', label: 'Principal', network: 'ethereum', profileName: 'anaprado', address: '0xA91F3c5B2e7D9046aB31c0Ee5D2f7A9b4C6eE82C', secondaryAddress: '', provider: 'metamask', referralCode: 'KURIO-ANA', email: 'ana@greenmint.test', ensName: 'nova' },
        { id: 'wallet-ana-2', role: 'secondary', displayName: 'Ana Prado', label: 'Reserva', network: 'polygon', profileName: 'anaprado', address: '0x2B7c9D4e1F0a3C5b8E6d7A2f9C1e4B3a5D8f0E71', secondaryAddress: 'nova.kurio.eth', provider: 'coinbase', referralCode: 'KURIO-ANA', email: 'ana@greenmint.test', ensName: 'nova.kurio' },
      ],
      'user-bruno': [],
    },
    orders: [],
    quotes: {},
    checkoutChangeApplied: false,
  }
}

let state: DbState = load()

function load(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DbState
      if (parsed.schema === 3) return parsed
    }
  } catch {
    /* corrupted or unavailable storage: reseed */
  }
  return seed()
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota or private mode: keep in memory */
  }
}

// ---------- Realtime bus ----------
type RealtimeEvent = NftUpdatedEvent | OrderUpdatedEvent
type Listener = (event: RealtimeEvent) => void
const listeners = new Set<Listener>()
let lastEvent: RealtimeEvent | null = null

export function onRealtime(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(event: RealtimeEvent) {
  lastEvent = event
  listeners.forEach((l) => l(event))
}

/** Re-sends the last event (duplicate) — used to prove the client is idempotent. */
export function replayLastEvent() {
  if (lastEvent) listeners.forEach((l) => l(lastEvent!))
}

/** Sends an event with an older version than the current one — the client must ignore it. */
export function emitStaleNftEvent(nftId: string) {
  const nft = findNft(nftId)
  emit({
    eventId: mockId('evt'),
    type: 'nft.updated',
    resourceId: nft.id,
    version: Math.max(0, nft.version - 1),
    userId: null,
    occurredAt: new Date().toISOString(),
    payload: { nftId: nft.id, priceEth: '0.01', available: 999, editions: nft.editions.map((e) => ({ ...e, priceEth: '0.01', available: 999 })) },
  })
}

// ---------- Helpers ----------
const now = () => Date.now()
const iso = () => new Date().toISOString()

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function publicUser(u: UserRecord): User {
  const { passwordHash: _h, passwordSalt: _s, ...user } = u
  return user
}

function findNft(id: string) {
  const nft = state.nfts.find((n) => n.id === id)
  if (!nft) throw new MockError(404, 'NOT_FOUND', 'NFT não encontrado.')
  return nft
}

function findEdition(nft: NftDetail, editionId: string) {
  const edition = nft.editions.find((e) => e.id === editionId)
  if (!edition) throw new MockError(404, 'NOT_FOUND', 'Edição não encontrada.')
  return edition
}

function summarize(nft: NftDetail): NftSummary {
  const { description: _d, images: _i, attributes: _a, editions: _e, reviews: _r, contract: _c, tokenStandard: _t, ...summary } = nft
  return summary
}

function refreshNftAggregates(nft: NftDetail) {
  const sellable = nft.editions.filter((e) => e.onSale && e.available > 0)
  const pool = sellable.length ? sellable : nft.editions
  nft.priceEth = pool.reduce((m, e) => (compareEth(e.priceEth, m) < 0 ? e.priceEth : m), pool[0].priceEth)
  nft.available = sellable.reduce((s, e) => s + e.available, 0)
}

function changeNft(nft: NftDetail) {
  refreshNftAggregates(nft)
  nft.version += 1
  save()
  emit({
    eventId: mockId('evt'),
    type: 'nft.updated',
    resourceId: nft.id,
    version: nft.version,
    userId: null,
    occurredAt: iso(),
    payload: { nftId: nft.id, priceEth: nft.priceEth, available: nft.available, editions: nft.editions.map((e) => ({ ...e })) },
  })
}

// ---------- Admin / control ----------
export const db = {
  reset() {
    state = seed()
    save()
  },
  snapshot: () => state,
}

/** Changes price/stock of an edition, as the marketplace back office would. Emits `nft.updated`. */
export function updateEdition(nftId: string, editionId: string, patch: Partial<Pick<Edition, 'priceEth' | 'available' | 'onSale'>>) {
  const nft = findNft(nftId)
  const edition = findEdition(nft, editionId)
  Object.assign(edition, patch)
  changeNft(nft)
  return nft
}

// ---------- Auth ----------
export function sessionFromToken(token: string | null): { status: 'ok'; user: UserRecord; session: SessionRecord } | { status: 'expired' | 'missing' } {
  if (!token) return { status: 'missing' }
  const session = state.sessions.find((s) => s.token === token)
  if (!session) return { status: 'missing' }
  if (session.expiresAt <= now()) return { status: 'expired' }
  const user = state.users.find((u) => u.id === session.userId)
  if (!user) return { status: 'missing' }
  return { status: 'ok', user, session }
}

function createSession(userId: string) {
  const session: SessionRecord = { token: `tok_${crypto.randomUUID().replace(/-/g, '')}`, userId, expiresAt: now() + scenario.get().sessionTtlMs }
  state.sessions.push(session)
  save()
  const user = state.users.find((u) => u.id === userId)!
  return { token: session.token, expiresAt: new Date(session.expiresAt).toISOString(), user: publicUser(user) }
}

export async function login(email: string, password: string) {
  const user = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user || (await sha256(`${user.passwordSalt}:${password}`)) !== user.passwordHash) {
    throw new MockError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
  }
  return createSession(user.id)
}

export async function register(input: { name?: string; username: string; email: string; password: string }) {
  const fields: Record<string, string> = {}
  if (state.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) fields.email = 'Este e-mail já está cadastrado.'
  if (state.users.some((u) => u.username.toLowerCase() === input.username.trim().toLowerCase())) fields.username = 'Este nome de usuário já está em uso.'
  if (Object.keys(fields).length) throw new MockError(409, fields.email ? 'EMAIL_TAKEN' : 'USERNAME_TAKEN', 'Conta já existente.', { fields })
  const salt = fakeHex(16, mockId('salt'))
  const user: UserRecord = {
    id: mockId('user'),
    name: input.name?.trim() || input.username.trim(),
    username: input.username.trim(),
    email: input.email.trim().toLowerCase(),
    ensName: null,
    walletNickname: '',
    avatarUrl: null,
    passwordSalt: salt,
    passwordHash: await sha256(`${salt}:${input.password}`),
  }
  state.users.push(user)
  state.favorites[user.id] = []
  state.wallets[user.id] = []
  return createSession(user.id)
}

export function logout(token: string) {
  state.sessions = state.sessions.filter((s) => s.token !== token)
  save()
}

export function expireAllSessions() {
  state.sessions.forEach((s) => (s.expiresAt = now() - 1))
  save()
}

// ---------- Catalog ----------
export function listNfts(params: NftListParams): NftListResponse {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 9))
  const all = scenario.get().emptyCatalog ? [] : state.nfts
  const q = params.q?.trim().toLowerCase()
  const newest = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map((n) => n.id)

  type Skip = 'category' | 'chain' | null
  const matches = (n: NftDetail, skip: Skip) => {
    if (q && !`${n.name} ${n.collection} ${n.creator} ${n.tokenId}`.toLowerCase().includes(q)) return false
    if (params.tab === 'new' && !newest.includes(n.id)) return false
    if (params.tab === 'trending' && n.rating < 4.5) return false
    if (skip !== 'category' && params.category?.length && !params.category.includes(n.category)) return false
    if (skip !== 'chain' && params.chain?.length && !params.chain.includes(n.chain)) return false
    if (params.rarity?.length && !params.rarity.includes(n.rarity)) return false
    if (params.minPrice && toWei(n.priceEth) < toWei(params.minPrice)) return false
    if (params.maxPrice && toWei(n.priceEth) > toWei(params.maxPrice)) return false
    if (params.availableOnly && n.available === 0) return false
    return true
  }

  let items = all.filter((n) => matches(n, null))
  const sort = params.sort ?? 'recent'
  items = [...items].sort((a, b) => {
    if (sort === 'price_asc') return compareEth(a.priceEth, b.priceEth) || a.id.localeCompare(b.id)
    if (sort === 'price_desc') return compareEth(b.priceEth, a.priceEth) || a.id.localeCompare(b.id)
    if (sort === 'popular') return b.reviewsCount - a.reviewsCount || b.rating - a.rating || a.id.localeCompare(b.id)
    return b.createdAt.localeCompare(a.createdAt)
  })

  const category = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<NftCategory, number>
  all.filter((n) => matches(n, 'category')).forEach((n) => (category[n.category] += 1))
  const chain = { ethereum: 0, polygon: 0, solana: 0 } as Record<Network, number>
  all.filter((n) => matches(n, 'chain')).forEach((n) => (chain[n.chain] += 1))
  const prices = state.nfts.map((n) => n.priceEth).sort(compareEth)

  const total = items.length
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize).map(summarize),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    facets: { category, chain },
    priceRange: { min: prices[0] ?? '0', max: prices[prices.length - 1] ?? '0' },
  }
}

export const getNft = (id: string): NftDetail => structuredClone(findNft(id))

// ---------- Favorites ----------
export const getFavorites = (userId: string) => [...(state.favorites[userId] ?? [])]

export function setFavorite(userId: string, nftId: string, value: boolean) {
  findNft(nftId)
  const set = new Set(state.favorites[userId] ?? [])
  if (value) set.add(nftId)
  else set.delete(nftId)
  state.favorites[userId] = [...set]
  save()
  return state.favorites[userId]
}

// ---------- Cart ----------
export const userCartId = (userId: string) => `cart-user-${userId}`

function cartRecord(cartId: string, userId: string | null): CartRecord {
  const id = userId ? userCartId(userId) : cartId
  let cart = state.carts[id]
  if (!cart) {
    cart = { id, userId, items: [], couponCode: null, updatedAt: iso() }
    state.carts[id] = cart
  }
  if (cart.userId && cart.userId !== userId) throw new MockError(403, 'FORBIDDEN', 'Carrinho de outro usuário.')
  return cart
}

function cartView(cart: CartRecord): Cart {
  const items: CartItem[] = cart.items.flatMap((item) => {
    const nft = state.nfts.find((n) => n.id === item.nftId)
    const edition = nft?.editions.find((e) => e.id === item.editionId)
    if (!nft || !edition) return []
    return [{
      nftId: nft.id,
      editionId: edition.id,
      tokenId: nft.tokenId,
      name: nft.name,
      editionName: edition.name,
      image: nft.image,
      quantity: item.quantity,
      unitPriceEth: edition.priceEth,
      addedPriceEth: item.addedPriceEth,
      available: edition.available,
      maxPerOrder: edition.maxPerOrder,
      onSale: edition.onSale,
    }]
  })
  const { quote } = computeQuote(cart, 'ethereum')
  return {
    id: cart.id,
    items,
    couponCode: cart.couponCode,
    summary: { subtotalEth: quote.subtotalEth, discountEth: quote.discountEth, networkFeeEth: quote.networkFeeEth, totalEth: quote.totalEth, coupon: quote.coupon },
    updatedAt: cart.updatedAt,
  }
}

function assertQuantity(edition: Edition, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new MockError(422, 'VALIDATION_ERROR', 'Quantidade inválida.', { fields: { quantity: 'Informe um número inteiro maior que zero.' } })
  if (!edition.onSale) throw new MockError(409, 'OUT_OF_STOCK', 'Esta edição não está à venda.')
  if (edition.available === 0) throw new MockError(409, 'OUT_OF_STOCK', 'Edição esgotada.')
  if (quantity > edition.available) throw new MockError(409, 'OUT_OF_STOCK', `Só restam ${edition.available} unidade(s) desta edição.`, { details: { available: edition.available } })
  if (quantity > edition.maxPerOrder) throw new MockError(409, 'QUANTITY_LIMIT', `Limite de ${edition.maxPerOrder} unidade(s) por pedido.`, { details: { maxPerOrder: edition.maxPerOrder } })
}

export const getCart = (cartId: string, userId: string | null) => {
  const cart = cartRecord(cartId, userId)
  return cartView(cart)
}

export function addCartItem(cartId: string, userId: string | null, input: { nftId: string; editionId: string; quantity: number }) {
  const cart = cartRecord(cartId, userId)
  const edition = findEdition(findNft(input.nftId), input.editionId)
  const existing = cart.items.find((i) => i.nftId === input.nftId && i.editionId === input.editionId)
  assertQuantity(edition, (existing?.quantity ?? 0) + input.quantity)
  if (existing) existing.quantity += input.quantity
  else cart.items.push({ ...input, addedPriceEth: edition.priceEth })
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

export function updateCartItem(cartId: string, userId: string | null, nftId: string, editionId: string, quantity: number) {
  const cart = cartRecord(cartId, userId)
  const item = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
  if (!item) throw new MockError(404, 'NOT_FOUND', 'Item não está no carrinho.')
  assertQuantity(findEdition(findNft(nftId), editionId), quantity)
  item.quantity = quantity
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

export function removeCartItem(cartId: string, userId: string | null, nftId: string, editionId: string) {
  const cart = cartRecord(cartId, userId)
  cart.items = cart.items.filter((i) => !(i.nftId === nftId && i.editionId === editionId))
  if (!cart.items.length) cart.couponCode = null
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

/** Moves the visitor's items into the user's cart after login/registration. */
export function mergeGuestCart(guestCartId: string | null, userId: string) {
  if (!guestCartId || guestCartId.startsWith('cart-user-')) return
  const guest = state.carts[guestCartId]
  if (!guest || guest.userId) return
  const cart = cartRecord('', userId)
  for (const item of guest.items) {
    const nft = state.nfts.find((n) => n.id === item.nftId)
    const edition = nft?.editions.find((e) => e.id === item.editionId)
    if (!edition) continue
    const existing = cart.items.find((i) => i.nftId === item.nftId && i.editionId === item.editionId)
    const limit = Math.min(edition.available, edition.maxPerOrder)
    if (existing) existing.quantity = Math.min(limit, existing.quantity + item.quantity) || existing.quantity
    else cart.items.push({ ...item, quantity: Math.max(1, Math.min(limit, item.quantity)) })
  }
  if (!cart.couponCode) cart.couponCode = guest.couponCode
  delete state.carts[guestCartId]
  cart.updatedAt = iso()
  save()
}

// ---------- Coupons & quote ----------
const COUPONS: Record<string, Coupon & { expired?: boolean }> = {
  GREEN10: { code: 'GREEN10', description: '10% de desconto', percentBps: 1000 },
  BEMVINDO5: { code: 'BEMVINDO5', description: '5% de desconto na primeira compra', percentBps: 500 },
  LUCASCAMARGO: { code: 'LUCASCAMARGO', description: '15% de desconto do criador da demo', percentBps: 1500 },
  BLACK30: { code: 'BLACK30', description: '30% Black Friday (expirado)', percentBps: 3000, expired: true },
}

const NETWORK_FEES: Record<Network, string> = { ethereum: '0.016', polygon: '0.0004', solana: '0.0002' }

export function applyCoupon(cartId: string, userId: string | null, code: string) {
  const coupon = COUPONS[code.trim().toUpperCase()]
  if (!coupon) throw new MockError(422, 'COUPON_INVALID', 'Cupom inválido.', { fields: { code: 'Cupom não encontrado.' } })
  if (coupon.expired) throw new MockError(422, 'COUPON_EXPIRED', 'Este cupom expirou.', { fields: { code: 'Cupom expirado.' } })
  const cart = cartRecord(cartId, userId)
  if (!cart.items.length) throw new MockError(422, 'VALIDATION_ERROR', 'Adicione itens antes de aplicar um cupom.')
  cart.couponCode = coupon.code
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

export function removeCoupon(cartId: string, userId: string | null) {
  const cart = cartRecord(cartId, userId)
  cart.couponCode = null
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

function computeQuote(cart: CartRecord, network: Network): { quote: Quote; fingerprint: string } {
  const issues: QuoteIssue[] = []
  const lines: QuoteLine[] = cart.items.flatMap((item) => {
    const nft = state.nfts.find((n) => n.id === item.nftId)
    const edition = nft?.editions.find((e) => e.id === item.editionId)
    if (!nft || !edition) return []
    if (!edition.onSale) issues.push({ nftId: nft.id, editionId: edition.id, kind: 'not_on_sale', message: `${nft.name} (${edition.name}) não está mais à venda.` })
    else if (edition.available === 0) issues.push({ nftId: nft.id, editionId: edition.id, kind: 'out_of_stock', message: `${nft.name} (${edition.name}) esgotou.` })
    else if (item.quantity > edition.available) issues.push({ nftId: nft.id, editionId: edition.id, kind: 'quantity_reduced', message: `${nft.name} (${edition.name}): só restam ${edition.available} unidade(s).` })
    if (compareEth(edition.priceEth, item.addedPriceEth) !== 0) issues.push({ nftId: nft.id, editionId: edition.id, kind: 'price_changed', message: `O preço de ${nft.name} (${edition.name}) mudou de ${item.addedPriceEth} para ${edition.priceEth} ETH.` })
    return [{ nftId: nft.id, editionId: edition.id, tokenId: nft.tokenId, name: nft.name, editionName: edition.name, image: nft.image, quantity: item.quantity, unitPriceEth: edition.priceEth, lineTotalEth: mulEth(edition.priceEth, item.quantity) }]
  })
  const coupon = cart.couponCode ? COUPONS[cart.couponCode] ?? null : null
  const subtotalEth = lines.length ? addEth(...lines.map((l) => l.lineTotalEth)) : '0'
  const discountEth = coupon ? percentEth(subtotalEth, coupon.percentBps) : '0'
  const networkFeeEth = lines.length ? NETWORK_FEES[network] : '0'
  const totalEth = addEth(subEth(subtotalEth, discountEth), networkFeeEth)
  const quote: Quote = {
    id: mockId('quote'),
    network,
    lines,
    coupon: coupon ? { code: coupon.code, description: coupon.description, percentBps: coupon.percentBps } : null,
    subtotalEth,
    discountEth,
    networkFeeEth,
    totalEth,
    issues,
    createdAt: iso(),
  }
  const fingerprint = JSON.stringify([network, lines.map((l) => [l.editionId, l.quantity, l.unitPriceEth]), coupon?.code ?? null, networkFeeEth])
  return { quote, fingerprint }
}

export function createQuote(cartId: string, userId: string, network: Network) {
  const cart = cartRecord(cartId, userId)
  const { quote, fingerprint } = computeQuote(cart, network)
  state.quotes[quote.id] = { userId, cartId: cart.id, quote, fingerprint }
  save()
  maybeTriggerCheckoutChange(cart)
  return quote
}

/** Scenario hook: after the first quote, the first cart item changes price or sells out. */
function maybeTriggerCheckoutChange(cart: CartRecord) {
  const mode = scenario.get().checkoutChange
  if (mode === 'none' || state.checkoutChangeApplied || !cart.items.length) return
  state.checkoutChangeApplied = true
  save()
  const { nftId, editionId } = cart.items[0]
  setTimeout(() => {
    const edition = findEdition(findNft(nftId), editionId)
    if (mode === 'price') updateEdition(nftId, editionId, { priceEth: addEth(edition.priceEth, '0.15') })
    else updateEdition(nftId, editionId, { available: 0 })
  }, 2000)
}

/** Accepts a price change: the cart's reference price becomes the current catalog price. */
export function acknowledgeCartPrices(cartId: string, userId: string | null) {
  const cart = cartRecord(cartId, userId)
  for (const item of cart.items) {
    const edition = state.nfts.find((n) => n.id === item.nftId)?.editions.find((e) => e.id === item.editionId)
    if (edition) item.addedPriceEth = edition.priceEth
  }
  cart.updatedAt = iso()
  save()
  return cartView(cart)
}

// ---------- Orders ----------
const EXPLORERS: Record<Network, string> = {
  ethereum: 'https://sepolia.etherscan.io/tx/',
  polygon: 'https://amoy.polygonscan.com/tx/',
  solana: 'https://explorer.solana.com/tx/',
}

function publicOrder(o: OrderRecord): Order {
  const { userId: _u, idempotencyKey: _k, requestHash: _h, settleAt: _s, reserved: _r, ...order } = o
  return structuredClone(order)
}

export function createOrder(
  userId: string,
  idempotencyKey: string,
  body: { quoteId: string; walletId: string; network: Network; buyer: BuyerInfo },
): { order: Order; replayed: boolean } {
  const requestHash = JSON.stringify(body)
  const existing = state.orders.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey)
  if (existing) {
    if (existing.requestHash !== requestHash) throw new MockError(409, 'IDEMPOTENCY_MISMATCH', 'Esta chave de idempotência já foi usada com outro conteúdo.')
    return { order: publicOrder(existing), replayed: true }
  }
  const stored = state.quotes[body.quoteId]
  if (!stored || stored.userId !== userId) throw new MockError(422, 'VALIDATION_ERROR', 'Cotação inválida. Atualize o resumo.', { fields: { quoteId: 'Cotação desconhecida.' } })
  const wallet = (state.wallets[userId] ?? []).find((w) => w.id === body.walletId)
  if (!wallet) throw new MockError(422, 'VALIDATION_ERROR', 'Selecione uma carteira válida.', { fields: { walletId: 'Carteira não encontrada.' } })
  if (wallet.network !== body.network) throw new MockError(422, 'VALIDATION_ERROR', 'Rede não suportada por esta carteira.', { fields: { network: 'Rede não suportada pela carteira.' } })

  const cart = cartRecord('', userId)
  const fresh = computeQuote(cart, body.network)
  if (!fresh.quote.lines.length) throw new MockError(422, 'VALIDATION_ERROR', 'Seu carrinho está vazio.')
  const blocking = fresh.quote.issues.filter((i) => i.kind !== 'price_changed')
  if (fresh.fingerprint !== stored.fingerprint || blocking.length) {
    state.quotes[fresh.quote.id] = { userId, cartId: cart.id, quote: fresh.quote, fingerprint: fresh.fingerprint }
    save()
    const code = blocking.length ? 'OUT_OF_STOCK' : 'QUOTE_CHANGED'
    throw new MockError(409, code, blocking.length ? 'Alguns itens não estão mais disponíveis.' : 'Preço, disponibilidade ou taxas mudaram. Revise o pedido.', { details: { quote: fresh.quote } })
  }

  // Reserve stock.
  for (const line of fresh.quote.lines) {
    const nft = findNft(line.nftId)
    const edition = findEdition(nft, line.editionId)
    edition.available -= line.quantity
    changeNft(nft)
  }
  const q = fresh.quote
  const order: OrderRecord = {
    id: `ord_${fakeHex(10, idempotencyKey)}`,
    status: 'pending',
    lines: q.lines,
    coupon: q.coupon,
    subtotalEth: q.subtotalEth,
    discountEth: q.discountEth,
    networkFeeEth: q.networkFeeEth,
    totalEth: q.totalEth,
    network: body.network,
    wallet: { id: wallet.id, label: wallet.label, address: wallet.address, provider: wallet.provider, network: wallet.network },
    buyer: body.buyer,
    txHash: null,
    explorerUrl: null,
    declineReason: null,
    createdAt: iso(),
    updatedAt: iso(),
    version: 1,
    userId,
    idempotencyKey,
    requestHash,
    settleAt: now() + scenario.get().settleMs,
    reserved: q.lines.map((l) => ({ nftId: l.nftId, editionId: l.editionId, quantity: l.quantity })),
  }
  state.orders.push(order)
  save()
  scheduleSettlement(order)
  return { order: publicOrder(order), replayed: false }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleSettlement(order: OrderRecord) {
  if (order.status !== 'pending' || timers.has(order.id)) return
  timers.set(order.id, setTimeout(() => settleOrder(order.id), Math.max(0, order.settleAt - now())))
}

function settleOrder(orderId: string) {
  timers.delete(orderId)
  const order = state.orders.find((o) => o.id === orderId)
  if (!order || order.status !== 'pending') return
  if (scenario.get().payment === 'confirm') {
    order.status = 'confirmed'
    order.txHash = `0x${fakeHex(64, order.id)}`
    order.explorerUrl = EXPLORERS[order.network] + order.txHash
    const cart = state.carts[userCartId(order.userId)]
    if (cart) {
      for (const r of order.reserved) {
        const item = cart.items.find((i) => i.nftId === r.nftId && i.editionId === r.editionId)
        if (item) item.quantity -= r.quantity
      }
      cart.items = cart.items.filter((i) => i.quantity > 0)
      if (!cart.items.length) cart.couponCode = null
      cart.updatedAt = iso()
    }
  } else {
    order.status = 'declined'
    order.declineReason = 'A carteira recusou a assinatura da transação.'
    for (const r of order.reserved) {
      const nft = findNft(r.nftId)
      findEdition(nft, r.editionId).available += r.quantity
      changeNft(nft)
    }
  }
  order.version += 1
  order.updatedAt = iso()
  save()
  emit({ eventId: mockId('evt'), type: 'order.updated', resourceId: order.id, version: order.version, userId: order.userId, occurredAt: iso(), payload: { order: publicOrder(order) } })
}

/** Settles orders whose time passed while the page was closed, and re-arms timers for the rest. */
export function resumePendingOrders() {
  for (const order of state.orders) {
    if (order.status !== 'pending') continue
    if (order.settleAt <= now()) settleOrder(order.id)
    else scheduleSettlement(order)
  }
}

export function getOrder(userId: string, orderId: string): Order {
  resumePendingOrders()
  const order = state.orders.find((o) => o.id === orderId)
  if (!order) throw new MockError(404, 'NOT_FOUND', 'Pedido não encontrado.')
  if (order.userId !== userId) throw new MockError(403, 'FORBIDDEN', 'Este pedido pertence a outro usuário.')
  return publicOrder(order)
}

export function listOrders(userId: string): Order[] {
  resumePendingOrders()
  return state.orders.filter((o) => o.userId === userId).map(publicOrder).reverse()
}

// ---------- Profile ----------
export function getUser(userId: string): User {
  return publicUser(state.users.find((u) => u.id === userId)!)
}

export function updateProfile(userId: string, input: { name: string; username: string; email: string; ensName: string | null; walletNickname: string; avatarDataUrl?: string | null }) {
  const user = state.users.find((u) => u.id === userId)!
  const fields: Record<string, string> = {}
  if (state.users.some((u) => u.id !== userId && u.email.toLowerCase() === input.email.trim().toLowerCase())) fields.email = 'Este e-mail já está em uso.'
  if (state.users.some((u) => u.id !== userId && u.username.toLowerCase() === input.username.trim().toLowerCase())) fields.username = 'Este nome de usuário já está em uso.'
  if (Object.keys(fields).length) throw new MockError(409, fields.email ? 'EMAIL_TAKEN' : 'USERNAME_TAKEN', 'Dados em conflito com outra conta.', { fields })
  user.name = input.name.trim()
  user.username = input.username.trim()
  user.email = input.email.trim().toLowerCase()
  user.ensName = input.ensName?.trim() || null
  user.walletNickname = input.walletNickname.trim()
  if (input.avatarDataUrl !== undefined) user.avatarUrl = input.avatarDataUrl
  save()
  return publicUser(user)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = state.users.find((u) => u.id === userId)!
  if ((await sha256(`${user.passwordSalt}:${currentPassword}`)) !== user.passwordHash) {
    throw new MockError(422, 'VALIDATION_ERROR', 'Senha atual incorreta.', { fields: { currentPassword: 'Senha atual incorreta.' } })
  }
  user.passwordSalt = fakeHex(16, mockId('salt'))
  user.passwordHash = await sha256(`${user.passwordSalt}:${newPassword}`)
  save()
}

// ---------- Wallets ----------
export const getWallets = (userId: string) => structuredClone(state.wallets[userId] ?? [])

export function upsertWallet(userId: string, role: 'primary' | 'secondary', input: WalletInput) {
  const list = (state.wallets[userId] ??= [])
  const duplicate = list.find((w) => w.role !== role && w.address.toLowerCase() === input.address.toLowerCase())
  if (duplicate) throw new MockError(409, 'VALIDATION_ERROR', 'Este endereço já está cadastrado na outra carteira.', { fields: { address: 'Endereço já usado na carteira ' + (duplicate.role === 'primary' ? 'principal' : 'secundária') + '.' } })
  const existing = list.find((w) => w.role === role)
  if (existing) Object.assign(existing, input)
  else list.push({ id: mockId('wallet'), role, ...input })
  save()
  return getWallets(userId)
}

export function removeAllMockTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
}
