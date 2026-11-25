import { useEffect, useMemo, useState } from 'react'
import { getRouteApi, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, Mail, Minus, Plus, RotateCcw, ShoppingCart, Star, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'
import type { Edition, NftDetail } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { useAddToCart, useNft, useNftList } from '@/api/queries'
import { FavoriteButton, NftCard, NftCardSkeleton } from '@/components/nft-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { announce } from '@/lib/announcer'
import { eth, NETWORK_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TIER } from '@/lib/tiers'
import { NotFound } from './not-found'

const route = getRouteApi('/nft/$nftId')

function Stars({ rating, reviews }: { rating: number; reviews: number }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn('size-4', i < Math.round(rating) ? 'fill-accent-strong text-accent-strong' : 'text-line')} />
        ))}
      </span>
      <span>
        <span className="sr-only">Nota {rating.toFixed(1)} de 5, </span>
        {reviews} avaliações de colecionadores
      </span>
    </p>
  )
}

function Gallery({ nft }: { nft: NftDetail }) {
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(false)
  const image = nft.images[active]
  return (
    <div className="grid gap-4 md:grid-cols-[100px_1fr]">
      <ul className="order-2 flex gap-3 overflow-x-auto md:order-1 md:flex-col" aria-label="Imagens do NFT">
        {nft.images.map((src, i) => (
          <li key={src}>
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver imagem ${i + 1} de ${nft.images.length}`}
              aria-current={i === active}
              className={cn('block size-20 overflow-hidden rounded md:size-[100px]', i === active && 'ring-2 ring-accent-strong')}
            >
              <img src={src.replace('-800', '-400')} alt="" width={100} height={100} loading="lazy" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <div className={cn('relative order-1 rounded p-5 md:order-2', TIER[nft.rarity].frame)} data-tier={nft.rarity}>
        <img src={image} alt={`Arte do NFT ${nft.name}, imagem ${active + 1}`} width={404} height={404} fetchPriority="high" className="aspect-square w-full rounded-[20px] object-cover" />
        <button type="button" onClick={() => setZoom(true)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-ink/70" aria-label="Ampliar imagem">
          <ZoomIn className="size-5" aria-hidden="true" />
        </button>
      </div>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-3xl border-b-0 p-2">
          <DialogTitle className="sr-only">{nft.name} ampliado</DialogTitle>
          <img src={image} alt={`Arte do NFT ${nft.name} ampliada`} className="w-full rounded" />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function editionState(e: Edition) {
  if (!e.onSale) return 'Indisponível'
  if (e.available === 0) return 'Esgotada'
  return `${e.available} disponíveis`
}

function PurchasePanel({ nft }: { nft: NftDetail }) {
  const navigate = useNavigate()
  const add = useAddToCart()
  const sellable = nft.editions.filter((e) => e.onSale && e.available > 0)
  const firstSellable = sellable.find((e) => e.priceEth === nft.priceEth) ?? sellable[0]
  const [editionId, setEditionId] = useState(firstSellable?.id ?? nft.editions[0].id)
  const edition = nft.editions.find((e) => e.id === editionId) ?? nft.editions[0]
  const limit = Math.max(0, Math.min(edition.available, edition.maxPerOrder))
  const [quantity, setQuantity] = useState(1)
  const unavailable = !edition.onSale || edition.available === 0

  // Realtime stock changes can lower the limit below the chosen quantity.
  useEffect(() => {
    if (limit > 0 && quantity > limit) setQuantity(limit)
  }, [limit, quantity])

  const submit = (goToCart: boolean) =>
    add.mutate(
      { nftId: nft.id, editionId: edition.id, quantity },
      {
        onSuccess: () => {
          announce(`${quantity} unidade(s) de ${nft.name} ${edition.name} adicionada(s) ao carrinho.`)
          if (goToCart) navigate({ to: '/carrinho' })
          else toast.success(`${nft.name} (${edition.name}) adicionado ao carrinho.`)
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar ao carrinho.'),
      },
    )

  return (
    <div className="grid gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Edição:</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Edição">
          {nft.editions.map((e) => {
            const selected = e.id === editionId
            const disabled = !e.onSale || e.available === 0
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Edição ${e.name}, ${eth(e.priceEth)}, ${editionState(e)}`}
                onClick={() => {
                  setEditionId(e.id)
                  setQuantity(1)
                }}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  selected ? 'border-accent-strong text-cream' : 'border-line text-muted',
                  disabled && 'border-dashed line-through',
                )}
              >
                {e.name}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted" aria-live="polite" data-testid="edition-status">
          {edition.name}: {eth(edition.priceEth)} · {editionState(edition)}
          {!unavailable && ` · máx. ${edition.maxPerOrder} por pedido`}
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3" role="group" aria-label="Quantidade">
          <Button size="icon" className="size-8 rounded-full" disabled={quantity <= 1 || unavailable} onClick={() => setQuantity((q) => q - 1)} aria-label="Diminuir quantidade">
            <Minus aria-hidden="true" />
          </Button>
          <output aria-live="polite" className="w-6 text-center" data-testid="quantity">
            {quantity}
          </output>
          <Button size="icon" className="size-8 rounded-full" disabled={quantity >= limit || unavailable} onClick={() => setQuantity((q) => q + 1)} aria-label="Aumentar quantidade">
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button className="w-[104px]" disabled={unavailable || add.isPending} onClick={() => submit(true)}>
            COMPRAR
          </Button>
          <Button variant="outline" size="icon" aria-label="Adicionar ao carrinho" disabled={unavailable || add.isPending} onClick={() => submit(false)}>
            <ShoppingCart aria-hidden="true" />
          </Button>
          <FavoriteButton nft={nft} withLabel className="inline-flex h-10 items-center gap-2 rounded-[4px] border border-accent px-3 text-sm text-cream hover:bg-accent/10" />
        </div>
      </div>
      {unavailable && (
        <p role="status" className="text-sm text-danger">
          Esta edição está {edition.onSale ? 'esgotada' : 'indisponível para venda'}. Escolha outra edição.
        </p>
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="container-page grid gap-10 py-6 md:grid-cols-[1fr_1fr]" data-testid="detail-loading" aria-busy="true">
      <span className="sr-only">Carregando NFT…</span>
      <div className="grid gap-4 md:grid-cols-[100px_1fr]">
        <div className="hidden gap-3 md:grid">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="size-[100px]" />
          ))}
        </div>
        <Skeleton className="aspect-square w-full" />
      </div>
      <div className="grid content-start gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}

function Related({ nft }: { nft: NftDetail }) {
  const list = useNftList({ category: undefined, pageSize: 6, sort: 'popular' })
  const items = useMemo(() => (list.data?.items ?? []).filter((n) => n.id !== nft.id).slice(0, 5), [list.data, nft.id])
  return (
    <section aria-labelledby="mais-colecao" className="mt-24">
      <h2 id="mais-colecao" className="border-b border-line pb-2 text-base font-bold text-accent-strong">
        Mais desta coleção
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {list.isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <NftCardSkeleton />
              </li>
            ))
          : items.map((n) => (
              <li key={n.id}>
                <NftCard nft={n} compact />
              </li>
            ))}
      </ul>
    </section>
  )
}

export function NftDetailPage() {
  const { nftId } = route.useParams()
  const router = useRouter()
  const query = useNft(nftId)
  const nft = query.data

  useEffect(() => {
    if (nft) document.title = `${nft.name} · Kurio`
  }, [nft])

  if (query.isPending) return <DetailSkeleton />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound title="NFT não encontrado" message="Este NFT não existe ou foi removido do catálogo." />
    }
    return (
      <div role="alert" className="container-page grid place-items-center gap-4 py-24 text-center">
        <p className="font-bold">Não foi possível carregar este NFT.</p>
        <Button onClick={() => query.refetch()}>
          <RotateCcw aria-hidden="true" /> Tentar novamente
        </Button>
      </div>
    )
  }

  if (!nft) return <DetailSkeleton />
  const share = `${location.origin}/nft/${nft.id}`
  return (
    <div className="container-page pb-6 pt-4 md:pt-6">
      <div className="mb-4 flex items-center justify-between md:hidden">
        <button type="button" onClick={() => router.history.back()} className="grid size-9 place-items-center rounded-full border border-line" aria-label="Voltar">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="Trilha" className="mb-4 hidden text-sm font-semibold md:block">
        <ol className="flex gap-2">
          <li>
            <Link to="/">Início</Link> /
          </li>
          <li>
            <Link to="/" hash="catalogo">
              Mercado
            </Link>
          </li>
        </ol>
      </nav>
      <div className="grid gap-8 md:grid-cols-2 md:gap-6">
        <Gallery nft={nft} />
        <div className="grid content-start gap-4">
          <div>
            <h1 className="text-2xl font-bold md:text-[28px]">{nft.name}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <p className="text-xl font-bold text-accent-strong" data-testid="detail-price">
                {eth(nft.priceEth)}
              </p>
              <Stars rating={nft.rating} reviews={nft.reviewsCount} />
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Sobre este NFT:</h2>
            <p className="text-sm leading-6 text-muted">{nft.description}</p>
          </div>
          <PurchasePanel nft={nft} key={nft.id} />
          <dl className="grid gap-2 text-sm text-muted">
            <div className="flex gap-1">
              <dt>ID do token:</dt>
              <dd>{nft.tokenId}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Coleção:</dt>
              <dd>{nft.collection}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt>Raridade:</dt>
              <dd>
                <span className={cn('rounded px-2 py-0.5 text-xs font-semibold uppercase', TIER[nft.rarity].badge ?? 'border border-line text-cream')}>{TIER[nft.rarity].label}</span>
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Atributos:</dt>
              <dd>{nft.attributes.map((a) => a.value).join(', ')}</dd>
            </div>
          </dl>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span>Compartilhar este NFT:</span>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" aria-label="Compartilhar no LinkedIn (abre em nova aba)" className="hover:text-accent-strong">
              in
            </a>
            <a href={`mailto:?subject=${encodeURIComponent(nft.name)}&body=${encodeURIComponent(share)}`} aria-label="Compartilhar por e-mail" className="hover:text-accent-strong">
              <Mail className="size-4" aria-hidden="true" />
            </a>
            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" aria-label="Compartilhar no X/Twitter (abre em nova aba)" className="hover:text-accent-strong">
              X
            </a>
          </div>
        </div>
      </div>

      <Tabs defaultValue="details" className="mt-16">
        <TabsList>
          <TabsTrigger value="details">Detalhes do NFT</TabsTrigger>
          <TabsTrigger value="reviews">Avaliações de colecionadores ({nft.reviewsCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="grid gap-4 pt-4 text-sm leading-6 text-muted">
          <p>
            {nft.name} é uma obra digital finalizada à mão da coleção {nft.collection}. Cada atributo fica armazenado nos metadados do token e verificado na {NETWORK_LABEL[nft.chain]}.
          </p>
          <p>A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. {nft.creator} recebe 5% de direitos autorais nas vendas secundárias.</p>
          <div>
            <h3 className="font-semibold text-cream">Rede:</h3>
            <p>Cunhado na {NETWORK_LABEL[nft.chain]} com procedência imutável e metadados armazenados no IPFS.</p>
          </div>
          <div>
            <h3 className="font-semibold text-cream">Contrato:</h3>
            <p>
              {nft.contract.slice(0, 6)}…{nft.contract.slice(-4)} · Contrato inteligente {nft.tokenStandard} verificado.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-cream">Direitos autorais:</h3>
            <p>Direitos autorais do criador: 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.</p>
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="pt-4">
          <ul className="grid gap-4">
            {nft.reviews.map((r) => (
              <li key={r.id} className="rounded bg-surface p-4">
                <p className="text-sm font-semibold">
                  {r.author} · <span className="text-accent-strong">{r.rating}/5</span>
                </p>
                <p className="mt-1 text-sm text-muted">{r.comment}</p>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
      <Related nft={nft} />
    </div>
  )
}
