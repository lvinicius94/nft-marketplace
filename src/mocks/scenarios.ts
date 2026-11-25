/**
 * Mock scenarios: deterministic, configurable network conditions and business outcomes.
 *
 * Selection order: `?scenario=<name>` in the URL (persisted) > localStorage > "default".
 * Tests can also set `localStorage['nft-mock-scenario']` through `page.addInitScript`.
 */
import { mulberry32 } from './random'

export type FailureKind = 'network' | 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503

export interface ScenarioConfig {
  name: ScenarioName
  label: string
  /** Fixed latency (ms) or [min, max] for seeded variable latency. */
  latency: number | [number, number]
  /** Catalog list answers out of order: older requests are slower than newer ones. */
  outOfOrder: boolean
  /** Endpoint key -> failure. `once: true` fails only the first call (to test retry/recovery). */
  failures: Partial<Record<EndpointKey, { kind: FailureKind; once?: boolean }>>
  /** Whole API unreachable (connection error). */
  offline: boolean
  /** Catalog returns no items. */
  emptyCatalog: boolean
  /** Session lifetime in ms. */
  sessionTtlMs: number
  /** Outcome of the simulated payment. */
  payment: 'confirm' | 'decline'
  /** Time until a pending order settles. */
  settleMs: number
  /** First POST /orders creates the order but responds after the client timeout. */
  orderTimeout: boolean
  /** After the first quote, change price (or stock) of the first cart item. */
  checkoutChange: 'none' | 'price' | 'sold_out'
}

export type EndpointKey =
  | 'nfts.list'
  | 'nfts.detail'
  | 'favorites.add'
  | 'favorites.remove'
  | 'cart.read'
  | 'cart.write'
  | 'quote'
  | 'orders.create'
  | 'auth.login'
  | 'auth.register'
  | 'profile.update'
  | 'wallets.write'

const BASE: Omit<ScenarioConfig, 'name' | 'label'> = {
  latency: 250,
  outOfOrder: false,
  failures: {},
  offline: false,
  emptyCatalog: false,
  sessionTtlMs: 60 * 60 * 1000,
  payment: 'confirm',
  settleMs: 2500,
  orderTimeout: false,
  checkoutChange: 'none',
}

export const SCENARIOS = {
  default: { label: 'Padrão (sucesso)' },
  fast: { label: 'Sem latência (testes)', latency: 0, settleMs: 600 },
  slow: { label: 'Rede lenta (3s)', latency: 3000 },
  variable: { label: 'Latência variável (100–2500ms)', latency: [100, 2500] as [number, number] },
  'out-of-order': { label: 'Respostas fora de ordem', outOfOrder: true },
  empty: { label: 'Catálogo vazio', emptyCatalog: true },
  'catalog-error': { label: 'Catálogo: erro 500 (1ª vez)', failures: { 'nfts.list': { kind: 500, once: true } } },
  'catalog-unavailable': { label: 'Catálogo: 503 sempre', failures: { 'nfts.list': { kind: 503 } } },
  offline: { label: 'Sem conexão', offline: true },
  'session-short': { label: 'Sessão expira em 30s', sessionTtlMs: 30_000 },
  'favorites-fail': { label: 'Favoritos: falha 500', failures: { 'favorites.add': { kind: 500 }, 'favorites.remove': { kind: 500 } } },
  'payment-declined': { label: 'Pagamento recusado', payment: 'decline' },
  'order-timeout': { label: 'Timeout após criar pedido', orderTimeout: true },
  'price-change': { label: 'Preço muda no checkout', checkoutChange: 'price' },
  'sold-out': { label: 'Edição esgota no checkout', checkoutChange: 'sold_out' },
} satisfies Record<string, Partial<ScenarioConfig> & { label: string }>

export type ScenarioName = keyof typeof SCENARIOS

const STORAGE_KEY = 'nft-mock-scenario'

export function isScenarioName(value: string | null): value is ScenarioName {
  return !!value && value in SCENARIOS
}

export function resolveScenario(name: ScenarioName): ScenarioConfig {
  return { ...BASE, ...SCENARIOS[name], name } as ScenarioConfig
}

export function readScenarioName(): ScenarioName {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('scenario')
    if (isScenarioName(fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl)
      return fromUrl
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isScenarioName(stored)) return stored
  } catch {
    /* storage unavailable */
  }
  return 'default'
}

let current = resolveScenario(readScenarioName())
const consumedOnce = new Set<EndpointKey>()
let rand = mulberry32(7)

export const scenario = {
  get: () => current,
  set(name: ScenarioName) {
    try {
      localStorage.setItem(STORAGE_KEY, name)
    } catch {
      /* ignore */
    }
    current = resolveScenario(name)
    consumedOnce.clear()
    rand = mulberry32(7)
  },
  /** Latency for the next request, deterministic for a given sequence. */
  nextLatency(): number {
    const l = current.latency
    if (typeof l === 'number') return l
    return Math.round(l[0] + rand() * (l[1] - l[0]))
  },
  /** Failure configured for an endpoint, honoring `once`. */
  failureFor(key: EndpointKey): FailureKind | null {
    const f = current.failures[key]
    if (!f) return null
    if (f.once) {
      if (consumedOnce.has(key)) return null
      consumedOnce.add(key)
    }
    return f.kind
  },
}
