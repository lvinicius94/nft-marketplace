/**
 * REST + realtime contracts shared by the Axios client, TanStack Query hooks and the MSW mocks.
 * ETH amounts are always decimal strings (see src/lib/eth.ts). Quantities are integers.
 */
import type { EthString } from '@/lib/eth'

// ---------- Errors ----------
export type ApiErrorCode =
  | 'VALIDATION_ERROR' // 422
  | 'UNAUTHENTICATED' // 401
  | 'SESSION_EXPIRED' // 401
  | 'FORBIDDEN' // 403
  | 'NOT_FOUND' // 404
  | 'EMAIL_TAKEN' // 409
  | 'USERNAME_TAKEN' // 409
  | 'OUT_OF_STOCK' // 409
  | 'QUANTITY_LIMIT' // 409
  | 'QUOTE_CHANGED' // 409
  | 'IDEMPOTENCY_MISMATCH' // 409
  | 'COUPON_INVALID' // 422
  | 'COUPON_EXPIRED' // 422
  | 'INVALID_CREDENTIALS' // 401
  | 'UNAVAILABLE' // 503

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    /** Field-level validation messages, keyed by field name. */
    fields?: Record<string, string>
    /** Extra machine-readable context (e.g. the fresh quote on QUOTE_CHANGED). */
    details?: unknown
  }
}

// ---------- Session & account ----------
export interface User {
  id: string
  name: string
  username: string
  email: string
  /** ENS name without the suffix, e.g. "nova" for nova.eth. */
  ensName: string | null
  walletNickname: string
  avatarUrl: string | null
}

export interface Session {
  token: string
  expiresAt: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name?: string
  username: string
  email: string
  password: string
}

export interface UpdateProfileRequest {
  name: string
  username: string
  email: string
  ensName: string | null
  walletNickname: string
  /** data: URL of the new avatar, null to remove, undefined to keep. */
  avatarDataUrl?: string | null
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// ---------- NFTs ----------
export type NftCategory =
  | 'arte-digital'
  | 'fotografia'
  | 'musica'
  | 'arte-3d'
  | 'colecionaveis'
  | 'generativa'
  | 'jogos'
  | 'assinaturas'
  | 'utilidade'
export type NftRarity = 'comum' | 'raro' | 'epico' | 'lendario'
export type NftSort = 'recent' | 'price_asc' | 'price_desc' | 'popular'
/** Catalog tabs: all, new releases, trending. */
export type NftTab = 'all' | 'new' | 'trending'
export type Network = 'ethereum' | 'polygon' | 'solana'

export interface Edition {
  id: string
  name: string
  priceEth: EthString
  /** Units still available for sale. 0 = sold out. */
  available: number
  /** Maximum units a collector can buy in one order. */
  maxPerOrder: number
  /** false = the edition exists but is not on sale (e.g. not released yet). */
  onSale: boolean
}

export interface NftSummary {
  id: string
  /** Public token id, e.g. "#0042". */
  tokenId: string
  name: string
  collection: string
  creator: string
  image: string
  category: NftCategory
  rarity: NftRarity
  chain: Network
  /** Lowest price among on-sale editions with stock. */
  priceEth: EthString
  /** Previous price shown struck through, when the NFT is on sale. */
  compareAtPriceEth: EthString | null
  available: number
  rating: number
  reviewsCount: number
  createdAt: string
  /** Monotonic version, bumped on every price/stock change. Shared with `nft.updated`. */
  version: number
}

export interface NftAttribute {
  label: string
  value: string
}

export interface Review {
  id: string
  author: string
  rating: number
  comment: string
  createdAt: string
}

export interface NftDetail extends NftSummary {
  description: string
  images: string[]
  attributes: NftAttribute[]
  editions: Edition[]
  reviews: Review[]
  contract: string
  tokenStandard: string
}

export interface NftListParams {
  q?: string
  tab?: NftTab
  category?: NftCategory[]
  chain?: Network[]
  rarity?: NftRarity[]
  minPrice?: string
  maxPrice?: string
  availableOnly?: boolean
  sort?: NftSort
  page?: number
  pageSize?: number
}

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface NftListResponse extends Paginated<NftSummary> {
  /** Counts per filter value, computed with every other active filter applied. */
  facets: { category: Record<NftCategory, number>; chain: Record<Network, number> }
  /** Price bounds of the catalog, used by the price range slider. */
  priceRange: { min: EthString; max: EthString }
}

// ---------- Favorites ----------
export interface FavoritesResponse {
  nftIds: string[]
}

// ---------- Cart ----------
export interface CartItem {
  nftId: string
  editionId: string
  tokenId: string
  name: string
  editionName: string
  image: string
  quantity: number
  /** Current unit price from the catalog. */
  unitPriceEth: EthString
  /** Price when the item was added; differs from unitPriceEth if the price changed since. */
  addedPriceEth: EthString
  available: number
  maxPerOrder: number
  onSale: boolean
}

export interface Cart {
  id: string
  items: CartItem[]
  couponCode: string | null
  /** Server-computed estimate (Ethereum fee). The checkout quote is the final reference. */
  summary: { subtotalEth: EthString; discountEth: EthString; networkFeeEth: EthString; totalEth: EthString; coupon: Coupon | null }
  updatedAt: string
}

export interface AddCartItemRequest {
  nftId: string
  editionId: string
  quantity: number
}

export interface UpdateCartItemRequest {
  quantity: number
}

// ---------- Quote ----------
export interface QuoteLine {
  nftId: string
  editionId: string
  tokenId: string
  name: string
  editionName: string
  image: string
  quantity: number
  unitPriceEth: EthString
  lineTotalEth: EthString
}

export interface Coupon {
  code: string
  description: string
  /** Discount in basis points (1000 = 10%). */
  percentBps: number
}

export interface Quote {
  id: string
  network: Network
  lines: QuoteLine[]
  coupon: Coupon | null
  subtotalEth: EthString
  discountEth: EthString
  networkFeeEth: EthString
  totalEth: EthString
  /** Problems that block checkout (sold out, quantity above stock...). */
  issues: QuoteIssue[]
  createdAt: string
}

export interface QuoteIssue {
  nftId: string
  editionId: string
  kind: 'price_changed' | 'out_of_stock' | 'quantity_reduced' | 'not_on_sale'
  message: string
}

// ---------- Wallets ----------
export type WalletProvider = 'metamask' | 'walletconnect' | 'coinbase'
export type WalletRole = 'primary' | 'secondary'

/** Fields mirror the "Carteiras" frame of the layout. */
export interface WalletInput {
  displayName: string
  /** "Apelido da carteira". */
  label: string
  network: Network
  profileName: string
  address: string
  /** "ENS ou carteira secundária (opcional)". */
  secondaryAddress: string
  provider: WalletProvider
  referralCode: string
  email: string
  ensName: string
}

export interface Wallet extends WalletInput {
  id: string
  role: WalletRole
}

export interface WalletConnectRequest {
  network: Network
}

export interface WalletConnection {
  walletId: string
  network: Network
  connected: boolean
}

// ---------- Orders ----------
export type OrderStatus = 'pending' | 'confirmed' | 'declined'

/** "Perfil do colecionador" block of the payment frame. */
export interface BuyerInfo {
  displayName: string
  username: string
  profileName: string
  email: string
  referralCode: string
  ensName: string
  note: string
}

export interface CreateOrderRequest {
  quoteId: string
  walletId: string
  network: Network
  buyer: BuyerInfo
}

export interface Order {
  id: string
  status: OrderStatus
  /** Immutable snapshot of the quote at confirmation time. */
  lines: QuoteLine[]
  coupon: Coupon | null
  subtotalEth: EthString
  discountEth: EthString
  networkFeeEth: EthString
  totalEth: EthString
  network: Network
  wallet: Pick<Wallet, 'id' | 'label' | 'address' | 'provider' | 'network'>
  buyer: BuyerInfo
  txHash: string | null
  explorerUrl: string | null
  declineReason: string | null
  createdAt: string
  updatedAt: string
  version: number
}

// ---------- Realtime events ----------
export interface RealtimeEnvelope<TType extends string, TPayload> {
  /** Stable event identity, used to drop duplicates. */
  eventId: string
  type: TType
  /** Affected resource id. */
  resourceId: string
  /** Resource version after the change. Older or equal versions are ignored. */
  version: number
  /** Owner of the resource for private events; null for public ones. */
  userId: string | null
  occurredAt: string
  payload: TPayload
}

export type NftUpdatedEvent = RealtimeEnvelope<
  'nft.updated',
  { nftId: string; priceEth: EthString; available: number; editions: Edition[] }
>

export type OrderUpdatedEvent = RealtimeEnvelope<'order.updated', { order: Order }>
