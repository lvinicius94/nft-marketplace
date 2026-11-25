import type { Edition, Network, NftCategory, NftDetail, NftRarity, Review } from '@/api/contracts'
import { compareEth, mulEth } from '@/lib/eth'
import { mulberry32 } from '../random'

/**
 * Deterministic catalog fixtures (fixed seed) so tests, visual baselines and Lighthouse
 * always see the same data. Names and art follow the Figma layout.
 */
type Art = 'emerald-ape' | 'sage-nomad' | 'neon-vessel' | 'golden-beat' | 'golden-snub'

const SERIES: { name: string; art: Art; collection: string }[] = [
  { name: 'Emerald Ape', art: 'emerald-ape', collection: 'Kurio Apes' },
  { name: 'Sage Nomad', art: 'sage-nomad', collection: 'Nomad Club' },
  { name: 'Neon Vessel', art: 'neon-vessel', collection: 'Kurio Editions' },
  { name: 'Cosmic Bloom', art: 'sage-nomad', collection: 'Nomad Club' },
  { name: 'Violet Nomad', art: 'sage-nomad', collection: 'Nomad Club' },
  { name: 'Ivory Baron', art: 'neon-vessel', collection: 'Kurio Editions' },
  { name: 'Golden Beat', art: 'golden-beat', collection: 'Golden Era' },
  { name: 'Golden Echo', art: 'golden-beat', collection: 'Golden Era' },
  { name: 'Golden Signal', art: 'golden-beat', collection: 'Golden Era' },
  { name: 'Jade Monarch', art: 'emerald-ape', collection: 'Kurio Apes' },
  { name: 'Onyx Drifter', art: 'neon-vessel', collection: 'Kurio Editions' },
  { name: 'Lilac Wander', art: 'sage-nomad', collection: 'Nomad Club' },
]

/** First items reproduce the exact names/prices shown in the layout. */
const FIGMA_ITEMS: { series: number; number: string; price: string; compareAt?: string }[] = [
  { series: 0, number: '042', price: '1.19' },
  { series: 1, number: '009', price: '1.69' },
  { series: 2, number: '552', price: '1.99', compareAt: '2.29' },
  { series: 3, number: '118', price: '1.29' },
  { series: 4, number: '314', price: '1.39' },
  { series: 5, number: '088', price: '1.79' },
  { series: 6, number: '207', price: '0.99' },
  { series: 7, number: '133', price: '0.59' },
  { series: 8, number: '160', price: '0.39' },
]

export const CATEGORIES: NftCategory[] = ['arte-digital', 'fotografia', 'musica', 'arte-3d', 'colecionaveis', 'generativa', 'jogos', 'assinaturas', 'utilidade']
const CHAINS: Network[] = ['ethereum', 'polygon', 'solana']
const RARITIES: NftRarity[] = ['comum', 'raro', 'epico', 'lendario']
const CREATORS = ['Nova Sato', 'Kira Lumen', 'Theo Vargas', 'Iris Moreau']
const REVIEWERS = ['Ana P.', 'Bruno L.', 'Carla M.', 'Diego R.', 'Elisa T.', 'Fábio S.', 'Gabi N.']
const COMMENTS = [
  'Arte impecável e entrega instantânea na carteira.',
  'Comprei a edição 1/50 e valeu cada ETH.',
  'Coleção consistente, criador muito ativo na comunidade.',
  'Ótimo detalhe nas texturas, fica lindo em alta resolução.',
  'Procedência clara e metadados completos. Recomendo.',
]
const ATTRS = [
  ['Óculos', 'Esmeralda', 'Raro'],
  ['Chapéu', 'Lilás', 'Comum'],
  ['Brinco', 'Marfim', 'Épico'],
  ['Fones', 'Dourado', 'Lendário'],
]

export const NFT_COUNT = 48
const BASE_DATE = Date.UTC(2026, 9, 1)

export const artUrl = (art: Art, size: 400 | 800 = 800) => `/nfts/${art}-${size}.webp`

function randomPrice(rand: () => number): string {
  const cents = 12 + Math.floor(rand() * 290)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function buildNftFixtures(): NftDetail[] {
  return [...buildGenerated(), buildGoldenSnub()]
}

function buildGenerated(): NftDetail[] {
  const rand = mulberry32(42)
  return Array.from({ length: NFT_COUNT }, (_, i) => {
    const figma = FIGMA_ITEMS[i]
    const series = SERIES[figma ? figma.series : i % SERIES.length]
    const number = figma?.number ?? String((i * 73 + 11) % 1000).padStart(3, '0')
    const id = `nft-${String(i + 1).padStart(3, '0')}`
    const basePrice = figma?.price ?? randomPrice(rand)
    const others = (['emerald-ape', 'sage-nomad', 'neon-vessel', 'golden-beat'] as Art[]).filter((a) => a !== series.art)

    const editions: Edition[] = [
      { id: `${id}-1-1`, name: '1/1', priceEth: mulEth(basePrice, 5), available: i % 4 === 0 ? 0 : 1, maxPerOrder: 1, onSale: true },
      { id: `${id}-1-10`, name: '1/10', priceEth: mulEth(basePrice, 2), available: 2 + (i % 8), maxPerOrder: 3, onSale: true },
      { id: `${id}-1-50`, name: '1/50', priceEth: basePrice, available: 6 + Math.floor(rand() * 40), maxPerOrder: 10, onSale: true },
      { id: `${id}-aberta`, name: 'ABERTA', priceEth: basePrice, available: 999, maxPerOrder: 20, onSale: i % 3 === 0 },
    ]
    // A few NFTs with the cheapest edition sold out, to exercise availability states.
    if (i % 11 === 10) editions[2].available = 0

    const reviewsCount = 3 + ((i * 7) % 17)
    const reviews: Review[] = Array.from({ length: Math.min(reviewsCount, 6) }, (_, r) => ({
      id: `${id}-r${r}`,
      author: REVIEWERS[(i + r) % REVIEWERS.length],
      rating: 4 + ((i + r) % 2),
      comment: COMMENTS[(i + r) % COMMENTS.length],
      createdAt: new Date(BASE_DATE - (r + 1) * 86_400_000).toISOString(),
    }))
    const sellable = editions.filter((e) => e.onSale && e.available > 0)
    const pool = sellable.length ? sellable : editions
    const creator = CREATORS[i % CREATORS.length]
    const chain = i < 9 ? 'ethereum' : CHAINS[i % CHAINS.length]
    const rarity = i === 2 ? 'raro' : RARITIES[Math.floor(rand() * RARITIES.length)]
    const tokenId = `#${number.padStart(4, '0')}`

    return {
      id,
      tokenId,
      name: `${series.name} #${number}`,
      collection: series.collection,
      creator,
      image: artUrl(series.art, 400),
      images: [artUrl(series.art), ...others.map((a) => artUrl(a))],
      category: CATEGORIES[i % CATEGORIES.length],
      rarity,
      chain,
      priceEth: pool.reduce((m, e) => (compareEth(e.priceEth, m) < 0 ? e.priceEth : m), pool[0].priceEth),
      compareAtPriceEth: figma?.compareAt ?? (i % 13 === 7 ? mulEth(basePrice, 2) : null),
      available: sellable.reduce((s, e) => s + e.available, 0),
      rating: 4 + ((i * 3) % 10) / 10,
      reviewsCount,
      createdAt: new Date(BASE_DATE + (NFT_COUNT - i) * 3_600_000 * 7).toISOString(),
      version: 1,
      description: `Um colecionável digital finalizado à mão da coleção ${series.collection}, verificado na ${chain === 'ethereum' ? 'Ethereum' : chain === 'polygon' ? 'Polygon' : 'Solana'}, com arte desbloqueável e acesso para colecionadores.`,
      attributes: ATTRS[i % ATTRS.length].map((value, k) => ({ label: ['Acessório', 'Cor', 'Raridade'][k], value })),
      editions,
      reviews,
      contract: `0x7A42${(0x1000 + i).toString(16)}${'0'.repeat(28)}19E8`,
      tokenStandard: 'ERC-721',
    }
  })
}

/** Black Friday highlight (first hero slide): the author's own legendary piece. */
export const GOLDEN_SNUB_ID = 'nft-golden-snub'

function buildGoldenSnub(): NftDetail {
  const id = GOLDEN_SNUB_ID
  const editions: Edition[] = [
    { id: `${id}-1-1`, name: '1/1', priceEth: '4.95', available: 1, maxPerOrder: 1, onSale: true },
    { id: `${id}-1-10`, name: '1/10', priceEth: '1.98', available: 10, maxPerOrder: 2, onSale: true },
    { id: `${id}-1-50`, name: '1/50', priceEth: '0.99', available: 50, maxPerOrder: 5, onSale: true },
    { id: `${id}-aberta`, name: 'ABERTA', priceEth: '0.99', available: 999, maxPerOrder: 20, onSale: false },
  ]
  return {
    id,
    tokenId: '#0001',
    name: 'Golden Snub #001',
    collection: 'Kurio Originals',
    creator: 'Lucas Camargo',
    image: artUrl('golden-snub', 400),
    images: [artUrl('golden-snub'), artUrl('golden-beat'), artUrl('emerald-ape'), artUrl('sage-nomad')],
    category: 'colecionaveis',
    rarity: 'lendario',
    chain: 'ethereum',
    priceEth: '0.99',
    compareAtPriceEth: '1.49',
    available: 61,
    rating: 5,
    reviewsCount: 3,
    // Oldest listing: stays out of the first catalog page, so the catalog keeps the layout order.
    createdAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    version: 1,
    description:
      'Um macaco-dourado-de-nariz-arrebitado de moletom verde, pintado à mão pelo criador da Kurio. Peça lendária da coleção Kurio Originals, verificada na Ethereum, em edição especial de Black Friday.',
    attributes: [
      { label: 'Acessório', value: 'Moletom' },
      { label: 'Cor', value: 'Dourado' },
      { label: 'Raridade', value: 'Lendário' },
    ],
    editions,
    reviews: [
      { id: `${id}-r0`, author: 'Ana P.', rating: 5, comment: 'Expressão impagável. Melhor compra da Black Friday.', createdAt: new Date(Date.UTC(2026, 10, 20)).toISOString() },
      { id: `${id}-r1`, author: 'Diego R.', rating: 5, comment: 'O cupom do criador ainda deixou mais barato.', createdAt: new Date(Date.UTC(2026, 10, 21)).toISOString() },
      { id: `${id}-r2`, author: 'Elisa T.', rating: 5, comment: 'Textura do pelo incrível em alta resolução.', createdAt: new Date(Date.UTC(2026, 10, 22)).toISOString() },
    ],
    contract: '0x7A42a11ce0000000000000000000000000000001',
    tokenStandard: 'ERC-721',
  }
}
