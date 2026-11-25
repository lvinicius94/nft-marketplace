import { Link, useNavigate } from '@tanstack/react-router'
import { Heart, Search, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import type { NftSummary } from '@/api/contracts'
import { useAddToCart, useFavorites, useToggleFavorite } from '@/api/queries'
import { ApiError } from '@/api/client'
import { useSession } from '@/auth/session-store'
import { announce } from '@/lib/announcer'
import { eth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TIER } from '@/lib/tiers'
import { Skeleton } from './ui/primitives'


/** Favorite toggle with optimistic update + rollback (see useToggleFavorite). */
export function FavoriteButton({ nft, className, withLabel }: { nft: Pick<NftSummary, 'id' | 'name'>; className?: string; withLabel?: boolean }) {
  const { user } = useSession()
  const navigate = useNavigate()
  const favorites = useFavorites()
  const toggle = useToggleFavorite()
  const active = favorites.data?.has(nft.id) ?? false
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={withLabel ? undefined : active ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!user) {
          toast.info('Entre para salvar favoritos.')
          navigate({ to: '/entrar', search: { redirect: location.pathname + location.search } })
          return
        }
        toggle.mutate(
          { nftId: nft.id, value: !active },
          {
            onSuccess: () => announce(active ? `${nft.name} removido dos favoritos.` : `${nft.name} adicionado aos favoritos.`),
            onError: (err) => {
              const msg = err instanceof ApiError ? err.message : 'Erro inesperado.'
              toast.error('Não foi possível atualizar os favoritos.', { description: `${msg} O estado anterior foi restaurado.` })
              announce('Falha ao atualizar favoritos. O estado anterior foi restaurado.', 'assertive')
            },
          },
        )
      }}
    >
      <Heart className={cn('size-5', active && 'fill-accent-strong text-accent-strong')} aria-hidden="true" />
      {withLabel && <span>{active ? 'Favoritado' : 'Favoritar'}</span>}
    </button>
  )
}

export function NftCard({ nft, priority = false, compact = false }: { nft: NftSummary; priority?: boolean; compact?: boolean }) {
  const add = useAddToCart()
  const tier = TIER[nft.rarity]
  const soldOut = nft.available === 0
  return (
    <article className="group relative" aria-label={nft.name} data-testid="nft-card">
      <div className="relative overflow-hidden bg-surface p-1" data-tier={nft.rarity}>
        {tier.badge && <span className={cn('absolute left-2 top-2 z-10 rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase shadow', tier.badge)}>{tier.label}</span>}
        <img
          src={nft.image}
          alt={`Arte do NFT ${nft.name}`}
          width={400}
          height={400}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="aspect-square w-full rounded-[10px] object-cover"
        />
        {soldOut && <span className="absolute bottom-2 left-2 rounded bg-ink/80 px-2 py-0.5 text-xs">Esgotado</span>}
        {!compact && (
          <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <button
              type="button"
              disabled={soldOut || add.isPending}
              aria-label={`Adicionar ${nft.name} ao carrinho`}
              className="grid size-9 place-items-center rounded bg-surface/90 text-cream hover:text-accent-strong disabled:opacity-50"
              onClick={() =>
                add.mutate(
                  { nftId: nft.id, editionId: `${nft.id}-1-50`, quantity: 1 },
                  {
                    onSuccess: () => {
                      toast.success(`${nft.name} (1/50) adicionado ao carrinho.`)
                      announce(`${nft.name} adicionado ao carrinho.`)
                    },
                    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar.'),
                  },
                )
              }
            >
              <ShoppingCart className="size-5" aria-hidden="true" />
            </button>
            <FavoriteButton nft={nft} className="grid size-9 place-items-center rounded bg-surface/90 text-cream hover:text-accent-strong" />
            <Link to="/nft/$nftId" params={{ nftId: nft.id }} aria-label={`Ver detalhes de ${nft.name}`} className="grid size-9 place-items-center rounded bg-surface/90 text-cream hover:text-accent-strong">
              <Search className="size-5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
      <h3 className="mt-3 text-sm md:text-base">
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="after:absolute after:inset-0 hover:text-accent-strong">
          {nft.name}
        </Link>
      </h3>
      <p className="text-sm font-bold text-accent-strong md:text-base">
        {eth(nft.priceEth)}
        {nft.compareAtPriceEth && (
          <>
            {' '}
            <span className="font-normal text-strike line-through">
              <span className="sr-only">preço anterior </span>
              {eth(nft.compareAtPriceEth)}
            </span>
          </>
        )}
      </p>
    </article>
  )
}

export function NftCardSkeleton() {
  return (
    <div data-testid="nft-card-skeleton">
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  )
}
