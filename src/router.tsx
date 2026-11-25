import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type ParsedLocation,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { Network, NftCategory, NftSort, NftTab } from '@/api/contracts'
import { sessionStore } from '@/auth/session-store'
import { RootLayout } from '@/pages/root-layout'
import { NotFound } from '@/pages/not-found'

export interface RouterContext {
  queryClient: QueryClient
}

// ---------- Search param schemas ----------
const TABS: NftTab[] = ['all', 'new', 'trending']
const SORTS: NftSort[] = ['recent', 'price_asc', 'price_desc', 'popular']
const CATEGORIES: NftCategory[] = ['arte-digital', 'fotografia', 'musica', 'arte-3d', 'colecionaveis', 'generativa', 'jogos', 'assinaturas', 'utilidade']
const CHAINS: Network[] = ['ethereum', 'polygon', 'solana']
const PRICE_RE = /^\d+(\.\d{1,18})?$/

export interface CatalogSearch {
  q?: string
  tab?: NftTab
  category?: NftCategory[]
  chain?: Network[]
  minPrice?: string
  maxPrice?: string
  sort?: NftSort
  page?: number
}

const asList = <T extends string>(value: unknown, allowed: T[]): T[] | undefined => {
  const list = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []).filter((v): v is T => allowed.includes(v as T))
  return list.length ? [...new Set(list)] : undefined
}

/** Invalid or unknown values are dropped, so any URL renders a coherent catalog. */
export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const page = Number(search.page)
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)
  return {
    q: typeof search.q === 'string' && search.q.trim() ? search.q.slice(0, 80) : undefined,
    tab: TABS.includes(search.tab as NftTab) && search.tab !== 'all' ? (search.tab as NftTab) : undefined,
    category: asList(search.category, CATEGORIES),
    chain: asList(search.chain, CHAINS),
    minPrice: PRICE_RE.test(str(search.minPrice) ?? '') ? str(search.minPrice) : undefined,
    maxPrice: PRICE_RE.test(str(search.maxPrice) ?? '') ? str(search.maxPrice) : undefined,
    sort: SORTS.includes(search.sort as NftSort) && search.sort !== 'recent' ? (search.sort as NftSort) : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}

const requireAuth = ({ location }: { location: ParsedLocation }) => {
  if (!sessionStore.get().token) {
    throw redirect({ to: '/entrar', search: { redirect: location.href } })
  }
}

// ---------- Routes ----------
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateCatalogSearch,
  component: lazyRouteComponent(() => import('@/pages/home'), 'HomePage'),
})

const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nft/$nftId',
  component: lazyRouteComponent(() => import('@/pages/nft-detail'), 'NftDetailPage'),
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carrinho',
  component: lazyRouteComponent(() => import('@/pages/cart'), 'CartPage'),
})

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pagamento',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/checkout'), 'CheckoutPage'),
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedido/$orderId',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/order'), 'OrderPage'),
})

const authSearch = (search: Record<string, unknown>) => ({
  redirect: typeof search.redirect === 'string' && search.redirect.startsWith('/') && !search.redirect.startsWith('//') ? search.redirect : undefined,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  validateSearch: authSearch,
  component: lazyRouteComponent(() => import('@/pages/auth'), 'LoginPage'),
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: authSearch,
  component: lazyRouteComponent(() => import('@/pages/auth'), 'RegisterPage'),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/perfil',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/account'), 'AccountLayout'),
})

const profileIndexRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/pages/account'), 'ProfilePage'),
})

const walletsRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/carteiras',
  component: lazyRouteComponent(() => import('@/pages/account'), 'WalletsPage'),
})

const favoritesRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/favoritos',
  component: lazyRouteComponent(() => import('@/pages/account'), 'FavoritesPage'),
})

const ordersRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/pedidos',
  component: lazyRouteComponent(() => import('@/pages/account'), 'OrdersPage'),
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  nftRoute,
  cartRoute,
  checkoutRoute,
  orderRoute,
  loginRoute,
  registerRoute,
  profileRoute.addChildren([profileIndexRoute, walletsRoute, favoritesRoute, ordersRoute]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: () => <NotFound />,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
