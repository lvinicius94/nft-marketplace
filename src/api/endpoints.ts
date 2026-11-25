import { request } from './client'
import type {
  AddCartItemRequest,
  Cart,
  ChangePasswordRequest,
  CreateOrderRequest,
  FavoritesResponse,
  LoginRequest,
  Network,
  NftDetail,
  NftListParams,
  NftListResponse,
  Order,
  Quote,
  RegisterRequest,
  Session,
  UpdateProfileRequest,
  User,
  Wallet,
  WalletConnection,
  WalletInput,
  WalletRole,
} from './contracts'

/** Serializes list params with repeated keys (category=a&category=b), skipping empty values. */
function listQuery(params: NftListParams) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '' || value === false) return
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)))
    else sp.set(key, String(value))
  })
  return sp
}

export const api = {
  auth: {
    login: (body: LoginRequest) => request<Session>({ method: 'POST', url: '/auth/login', data: body }),
    register: (body: RegisterRequest) => request<Session>({ method: 'POST', url: '/auth/register', data: body }),
    session: (signal?: AbortSignal) => request<{ user: User; expiresAt: string }>({ url: '/auth/session', signal }),
    logout: () => request<void>({ method: 'POST', url: '/auth/logout' }),
  },
  nfts: {
    list: (params: NftListParams, signal?: AbortSignal) => request<NftListResponse>({ url: '/nfts', params: listQuery(params), signal }),
    detail: (id: string, signal?: AbortSignal) => request<NftDetail>({ url: `/nfts/${encodeURIComponent(id)}`, signal }),
  },
  favorites: {
    list: (signal?: AbortSignal) => request<FavoritesResponse>({ url: '/favorites', signal }),
    add: (nftId: string) => request<FavoritesResponse>({ method: 'PUT', url: `/favorites/${nftId}` }),
    remove: (nftId: string) => request<FavoritesResponse>({ method: 'DELETE', url: `/favorites/${nftId}` }),
  },
  cart: {
    get: (signal?: AbortSignal) => request<Cart>({ url: '/cart', signal }),
    add: (body: AddCartItemRequest) => request<Cart>({ method: 'POST', url: '/cart/items', data: body }),
    update: (nftId: string, editionId: string, quantity: number) =>
      request<Cart>({ method: 'PATCH', url: `/cart/items/${nftId}/${editionId}`, data: { quantity } }),
    remove: (nftId: string, editionId: string) => request<Cart>({ method: 'DELETE', url: `/cart/items/${nftId}/${editionId}` }),
    applyCoupon: (code: string) => request<Cart>({ method: 'PUT', url: '/cart/coupon', data: { code } }),
    removeCoupon: () => request<Cart>({ method: 'DELETE', url: '/cart/coupon' }),
    acknowledgePrices: () => request<Cart>({ method: 'POST', url: '/cart/acknowledge-prices' }),
  },
  quotes: {
    create: (network: Network) => request<Quote>({ method: 'POST', url: '/quotes', data: { network } }),
  },
  orders: {
    create: (body: CreateOrderRequest, idempotencyKey: string) =>
      request<Order>({ method: 'POST', url: '/orders', data: body, headers: { 'Idempotency-Key': idempotencyKey } }),
    get: (id: string, signal?: AbortSignal) => request<Order>({ url: `/orders/${encodeURIComponent(id)}`, signal }),
    list: (signal?: AbortSignal) => request<Order[]>({ url: '/orders', signal }),
  },
  profile: {
    get: (signal?: AbortSignal) => request<User>({ url: '/me', signal }),
    update: (body: UpdateProfileRequest) => request<User>({ method: 'PUT', url: '/me', data: body }),
    changePassword: (body: ChangePasswordRequest) => request<void>({ method: 'POST', url: '/me/password', data: body }),
  },
  wallets: {
    list: (signal?: AbortSignal) => request<Wallet[]>({ url: '/wallets', signal }),
    save: (role: WalletRole, body: WalletInput) => request<Wallet[]>({ method: 'PUT', url: `/wallets/${role}`, data: body }),
    connect: (id: string, network: Network, simulate: 'approve' | 'reject') =>
      request<WalletConnection>({ method: 'POST', url: `/wallets/${id}/connect`, data: { network, simulate } }),
  },
}
