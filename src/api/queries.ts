import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { sessionStore, useSession } from '@/auth/session-store'
import { ApiError } from './client'
import type { Cart, FavoritesResponse, Network, NftListParams, Order, User, Wallet } from './contracts'
import { api } from './endpoints'

// ---------- Cache policy ----------
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // Retry only transient failures (network, timeout, 5xx), at most twice with backoff.
        retry: (count, error) => error instanceof ApiError && error.transient && count < 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
      },
      mutations: { retry: false },
    },
  })
}

// ---------- Keys ----------
/** Private data lives under ['user', userId, ...] so logout / user switch can drop it in one call. */
export const qk = {
  nfts: ['nfts'] as const,
  nftList: (params: NftListParams) => ['nfts', 'list', params] as const,
  nftDetail: (id: string) => ['nfts', 'detail', id] as const,
  user: (userId: string) => ['user', userId] as const,
  favorites: (userId: string) => ['user', userId, 'favorites'] as const,
  cart: (owner: string) => ['cart', owner] as const,
  quote: (userId: string, network: Network, cartStamp: string) => ['user', userId, 'quote', network, cartStamp] as const,
  orders: (userId: string) => ['user', userId, 'orders'] as const,
  order: (userId: string, orderId: string) => ['user', userId, 'order', orderId] as const,
  profile: (userId: string) => ['user', userId, 'profile'] as const,
  wallets: (userId: string) => ['user', userId, 'wallets'] as const,
}

export function useCartOwner() {
  const { user } = useSession()
  return user ? `user:${user.id}` : `guest:${sessionStore.guestCartId()}`
}

// ---------- Catalog ----------
export function useNftList(params: NftListParams) {
  return useQuery({
    queryKey: qk.nftList(params),
    // The AbortSignal cancels the request when params change, so stale responses are discarded.
    queryFn: ({ signal }) => api.nfts.list(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useNft(id: string) {
  return useQuery({
    queryKey: qk.nftDetail(id),
    queryFn: ({ signal }) => api.nfts.detail(id, signal),
    retry: (count, error) => error instanceof ApiError && error.transient && count < 2,
  })
}

// ---------- Favorites (optimistic) ----------
export function useFavorites() {
  const { user } = useSession()
  return useQuery({
    queryKey: qk.favorites(user?.id ?? 'anonymous'),
    queryFn: ({ signal }) => api.favorites.list(signal),
    enabled: !!user,
    select: (data) => new Set(data.nftIds),
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  const { user } = useSession()
  return useMutation({
    mutationFn: ({ nftId, value }: { nftId: string; value: boolean }) => (value ? api.favorites.add(nftId) : api.favorites.remove(nftId)),
    onMutate: async ({ nftId, value }) => {
      if (!user) return
      const key = qk.favorites(user.id)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<FavoritesResponse>(key)
      const ids = new Set(previous?.nftIds ?? [])
      if (value) ids.add(nftId)
      else ids.delete(nftId)
      qc.setQueryData<FavoritesResponse>(key, { nftIds: [...ids] })
      return { previous, key }
    },
    onError: (_error, _vars, context) => {
      if (context) qc.setQueryData(context.key, context.previous)
    },
    onSuccess: (data, _vars, context) => {
      if (context) qc.setQueryData(context.key, data)
    },
  })
}

// ---------- Cart ----------
export function useCart() {
  const owner = useCartOwner()
  return useQuery({ queryKey: qk.cart(owner), queryFn: ({ signal }) => api.cart.get(signal) })
}

function useCartMutation<TVars>(fn: (vars: TVars) => Promise<Cart>) {
  const qc = useQueryClient()
  const owner = useCartOwner()
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => qc.setQueryData(qk.cart(owner), cart),
    onError: (error) => {
      // Conflicts mean our view of stock/price is old: refresh cart and catalog.
      if (error instanceof ApiError && error.status === 409) {
        qc.invalidateQueries({ queryKey: qk.cart(owner) })
        qc.invalidateQueries({ queryKey: qk.nfts })
      }
    },
  })
}

export const useAddToCart = () => useCartMutation((v: { nftId: string; editionId: string; quantity: number }) => api.cart.add(v))
export const useUpdateCartItem = () =>
  useCartMutation((v: { nftId: string; editionId: string; quantity: number }) => api.cart.update(v.nftId, v.editionId, v.quantity))
export const useRemoveCartItem = () => useCartMutation((v: { nftId: string; editionId: string }) => api.cart.remove(v.nftId, v.editionId))
export const useApplyCoupon = () => useCartMutation((code: string) => api.cart.applyCoupon(code))
export const useRemoveCoupon = () => useCartMutation(() => api.cart.removeCoupon())
export const useAcknowledgePrices = () => useCartMutation(() => api.cart.acknowledgePrices())

// ---------- Quote ----------
export function useQuote(network: Network, cart: Cart | undefined) {
  const { user } = useSession()
  return useQuery({
    queryKey: qk.quote(user?.id ?? 'anonymous', network, `${cart?.updatedAt}:${cart?.items.map((i) => `${i.editionId}:${i.quantity}:${i.unitPriceEth}:${i.available}`).join('|')}`),
    queryFn: () => api.quotes.create(network),
    enabled: !!user && !!cart && cart.items.length > 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
}

// ---------- Orders ----------
export function useOrder(orderId: string | null) {
  const { user } = useSession()
  return useQuery({
    queryKey: qk.order(user?.id ?? 'anonymous', orderId ?? 'none'),
    queryFn: ({ signal }) => api.orders.get(orderId!, signal),
    enabled: !!user && !!orderId,
    // Realtime is the primary channel; polling is only a slow safety net while pending.
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 10_000 : false),
  })
}

export function useOrders() {
  const { user } = useSession()
  return useQuery({ queryKey: qk.orders(user?.id ?? 'anonymous'), queryFn: ({ signal }) => api.orders.list(signal), enabled: !!user })
}

// ---------- Profile & wallets ----------
export function useProfile() {
  const { user } = useSession()
  return useQuery({ queryKey: qk.profile(user?.id ?? 'anonymous'), queryFn: ({ signal }) => api.profile.get(signal), enabled: !!user })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.profile.update,
    onSuccess: (user: User) => {
      qc.setQueryData(qk.profile(user.id), user)
      sessionStore.updateUser(user)
    },
  })
}

export const useChangePassword = () => useMutation({ mutationFn: api.profile.changePassword })

export function useWallets() {
  const { user } = useSession()
  return useQuery({ queryKey: qk.wallets(user?.id ?? 'anonymous'), queryFn: ({ signal }) => api.wallets.list(signal), enabled: !!user })
}

export function useSaveWallet() {
  const qc = useQueryClient()
  const { user } = useSession()
  return useMutation({
    mutationFn: ({ role, input }: { role: Wallet['role']; input: Parameters<typeof api.wallets.save>[1] }) => api.wallets.save(role, input),
    onSuccess: (wallets) => user && qc.setQueryData(qk.wallets(user.id), wallets),
  })
}

export function setOrderInCache(qc: QueryClient, userId: string, order: Order) {
  qc.setQueryData(qk.order(userId, order.id), order)
  qc.invalidateQueries({ queryKey: qk.orders(userId) })
}
