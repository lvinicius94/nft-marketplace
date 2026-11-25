import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import type { Network, NftCategory, NftListResponse, NftSort, NftTab } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { useNftList } from '@/api/queries'
import { NftCard, NftCardSkeleton } from '@/components/nft-card'
import { comingSoon } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, Slider } from '@/components/ui/primitives'
import { compareEth } from '@/lib/eth'
import { CATEGORY_LABEL, NETWORK_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { validateCatalogSearch, type CatalogSearch } from '@/router'

const PAGE_SIZE = 9

const TAB_LABEL: Record<NftTab, string> = { all: 'Todos os NFTs', new: 'Novos lançamentos', trending: 'Em alta' }
const SORT_LABEL: Record<NftSort, string> = {
  recent: 'Listados recentemente',
  price_asc: 'Menor preço',
  price_desc: 'Maior preço',
  popular: 'Mais avaliados',
}

const HERO_SLIDES = [
  { kicker: 'Bem-vindo à Kurio', title: ['SEJA DONO DO FUTURO', 'DA ARTE DIGITAL'], text: 'Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.', image: '/nfts/emerald-ape-800.webp', alt: 'Emerald Ape #042, macaco ilustrado de óculos e jaqueta verde' },
  { kicker: 'Edições limitadas', title: ['LANÇAMENTOS', 'GÊNESIS 1/50'], text: 'Colecione edições escassas diretamente dos criadores antes da revelação pública, com procedência verificada na rede.', image: '/nfts/golden-beat-800.webp', alt: 'Golden Beat, macaco ilustrado de fones de ouvido' },
  { kicker: 'Coleções verificadas', title: ['ARTE DIGITAL', 'SELECIONADA'], text: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura da rede.', image: '/nfts/neon-vessel-800.webp', alt: 'Neon Vessel, macaco ilustrado de blazer creme' },
]

function useCatalogSearch() {
  // Non-strict: the home is also rendered behind the login/register dialogs.
  const raw = useSearch({ strict: false }) as Record<string, unknown>
  const search = useMemo(() => validateCatalogSearch(raw), [raw])
  const navigate = useNavigate()
  /** Any filter change resets pagination; page changes keep the other params. */
  const update = (patch: Partial<CatalogSearch>, opts: { keepPage?: boolean } = {}) =>
    navigate({ to: '/', search: { ...search, ...patch, page: opts.keepPage ? patch.page : undefined }, resetScroll: false })
  return { search, update }
}

const AUTOPLAY_MS = 2000

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function Hero() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  // Auto-advance every 2s; a manual choice restarts the timer. Pauses on hover/focus and
  // never moves for users who prefer reduced motion (WCAG 2.2.2).
  useEffect(() => {
    if (paused || reducedMotion) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % HERO_SLIDES.length), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [index, paused, reducedMotion])

  const live = paused || reducedMotion ? 'polite' : 'off'
  // All slides are stacked in the same grid cell and cross-fade: no layout shift between
  // slides (the cell is as tall as the tallest slide) and a smooth transition.
  const fade = (i: number) =>
    cn(
      '[grid-area:1/1] transition-[opacity,transform] duration-700 ease-out',
      i === index ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2',
    )
  const imgFade = (i: number) =>
    cn('[grid-area:1/1] transition-[opacity,transform] duration-700 ease-out', i === index ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]')

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques"
      className="container-page"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Desktop */}
      <div className="hidden items-center gap-10 pb-24 pt-8 md:grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_450px]">
        <div className="relative px-6 lg:px-10">
          <div className="grid" aria-live={live}>
            {HERO_SLIDES.map((sl, i) => (
              <div key={sl.kicker} className={fade(i)} aria-hidden={i !== index} inert={i !== index}>
                <p className="mb-4 h-5 text-sm">{sl.kicker}</p>
                {i === index ? (
                  <h1 className="whitespace-nowrap text-xl font-bold leading-[1.6] lg:text-3xl xl:text-[44px]">
                    {sl.title[0]}
                    <br />
                    {sl.title[1]}
                  </h1>
                ) : (
                  <p className="whitespace-nowrap text-xl font-bold leading-[1.6] lg:text-3xl xl:text-[44px]">
                    {sl.title[0]}
                    <br />
                    {sl.title[1]}
                  </p>
                )}
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{sl.text}</p>
              </div>
            ))}
          </div>
          <Button asChild className="mt-8 h-10 w-[140px] text-base">
            <a href="#catalogo">EXPLORAR</a>
          </Button>
          <HeroDots index={index} onChange={setIndex} className="mt-12 justify-end" />
        </div>
        <div className="grid overflow-hidden rounded-[20px]">
          {HERO_SLIDES.map((sl, i) => (
            <img
              key={sl.image}
              src={sl.image}
              alt={i === index ? sl.alt : ''}
              aria-hidden={i !== index}
              width={450}
              height={450}
              fetchPriority={i === 0 ? 'high' : 'low'}
              className={cn('aspect-square w-full rounded-[20px] object-cover', imgFade(i))}
            />
          ))}
        </div>
      </div>
      {/* Mobile card */}
      <div className="relative mb-6 mt-4 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#8a5a30] to-surface p-4 md:hidden">
        <div className="grid grid-cols-[1fr_140px] items-start gap-2">
          <div>
            <div className="grid" aria-live={live}>
              {HERO_SLIDES.map((sl, i) => (
                <div key={sl.kicker} className={fade(i)} aria-hidden={i !== index} inert={i !== index}>
                  <p className="h-4 text-[11px]">{sl.kicker}</p>
                  {i === index ? (
                    <h1 className="mt-2 text-base font-bold leading-7">
                      {sl.title[0]}
                      <br />
                      {sl.title[1]}
                    </h1>
                  ) : (
                    <p className="mt-2 text-base font-bold leading-7">
                      {sl.title[0]}
                      <br />
                      {sl.title[1]}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-cream/80">{sl.text}</p>
                </div>
              ))}
            </div>
            <a href="#catalogo" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent-strong">
              EXPLORAR <ArrowRight className="size-3" aria-hidden="true" />
            </a>
          </div>
          <div className="grid overflow-hidden rounded-xl">
            {HERO_SLIDES.map((sl, i) => (
              <img
                key={sl.image}
                src={sl.image.replace('-800', '-400')}
                alt={i === index ? sl.alt : ''}
                aria-hidden={i !== index}
                width={140}
                height={140}
                fetchPriority={i === 0 ? 'high' : 'low'}
                className={cn('aspect-square w-full rounded-xl object-cover', imgFade(i))}
              />
            ))}
          </div>
        </div>
        <HeroDots index={index} onChange={setIndex} className="mt-3 justify-center" />
      </div>
    </section>
  )
}

function HeroDots({ index, onChange, className }: { index: number; onChange: (i: number) => void; className?: string }) {
  return (
    <div className={cn('flex gap-0.5', className)} role="group" aria-label="Escolher destaque">
      {HERO_SLIDES.map((s, i) => (
        <button
          key={s.kicker}
          type="button"
          onClick={() => onChange(i)}
          aria-label={`Destaque ${i + 1} de ${HERO_SLIDES.length}`}
          aria-current={i === index}
          className="grid size-6 place-items-center rounded-full"
        >
          <span aria-hidden="true" className={cn('size-2.5 rounded-full border border-accent', i === index ? 'bg-accent' : 'bg-accent/60')} />
        </button>
      ))}
    </div>
  )
}

function FilterPanel({ data, onApplied }: { data?: NftListResponse; onApplied?: () => void }) {
  const { search, update } = useCatalogSearch()
  const bounds = data?.priceRange ?? { min: '0', max: '0' }
  const toNum = (v: string) => Number(v)
  const [range, setRange] = useState<[number, number] | null>(null)
  const min = toNum(bounds.min)
  const max = toNum(bounds.max)
  const current: [number, number] = range ?? [search.minPrice ? toNum(search.minPrice) : min, search.maxPrice ? toNum(search.maxPrice) : max]

  const toggle = <T extends string>(list: T[] | undefined, value: T) => {
    const set = new Set(list ?? [])
    if (set.has(value)) set.delete(value)
    else set.add(value)
    return set.size ? [...set] : undefined
  }

  const facetButton = (active: boolean) => cn('flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-surface-2', active ? 'text-accent-strong' : 'text-muted')

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Coleções</legend>
        <ul className="grid gap-1">
          {(Object.keys(CATEGORY_LABEL) as NftCategory[]).map((c) => {
            const active = search.category?.includes(c) ?? false
            return (
              <li key={c}>
                <button type="button" aria-pressed={active} className={facetButton(active)} onClick={() => update({ category: toggle(search.category, c) })}>
                  <span>{CATEGORY_LABEL[c]}</span>
                  <span className={cn('font-semibold', active ? 'text-accent-strong' : 'text-muted')}>({data ? data.facets.category[c] : '–'})</span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-lg font-bold">Faixa de preço</legend>
        <div className="px-3">
          <Slider
            min={min}
            max={max || 1}
            step={0.01}
            value={current}
            onValueChange={(v) => setRange([v[0], v[1]])}
            thumbLabels={['Preço mínimo', 'Preço máximo']}
            disabled={!data}
          />
          <p className="mt-3 text-sm" aria-live="polite">
            Preço: {current[0].toFixed(2).replace('.', ',')} - {current[1].toFixed(2).replace('.', ',')} ETH
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={!data}
              onClick={() => {
                const lo = current[0].toFixed(2)
                const hi = current[1].toFixed(2)
                update({ minPrice: compareEth(lo, bounds.min) > 0 ? lo : undefined, maxPrice: compareEth(hi, bounds.max) < 0 ? hi : undefined })
                setRange(null)
                onApplied?.()
              }}
            >
              Aplicar
            </Button>
            {(search.minPrice || search.maxPrice) && (
              <Button size="sm" variant="ghost" onClick={() => (setRange(null), update({ minPrice: undefined, maxPrice: undefined }))}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Rede</legend>
        <ul className="grid gap-1">
          {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => {
            const active = search.chain?.includes(n) ?? false
            return (
              <li key={n}>
                <button type="button" aria-pressed={active} className={facetButton(active)} onClick={() => update({ chain: toggle(search.chain, n) })}>
                  <span>{NETWORK_LABEL[n]}</span>
                  <span>({data ? data.facets.chain[n] : '–'})</span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>
    </div>
  )
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { update } = useCatalogSearch()
  if (totalPages <= 1) return null
  const go = (p: number) => {
    update({ page: p > 1 ? p : undefined }, { keepPage: true })
    document.getElementById('catalogo')?.scrollIntoView({ block: 'start' })
  }
  const cell = (active: boolean) => cn('grid size-9 place-items-center rounded border text-base', active ? 'border-accent bg-accent font-bold text-ink' : 'border-line hover:border-accent')
  return (
    <nav aria-label="Paginação do catálogo" className="mt-12 flex justify-end gap-2">
      {page > 1 && (
        <button type="button" className={cell(false)} onClick={() => go(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button key={p} type="button" className={cell(p === page)} aria-current={p === page ? 'page' : undefined} aria-label={`Página ${p}`} onClick={() => go(p)}>
          {p}
        </button>
      ))}
      {page < totalPages && (
        <button type="button" className={cell(false)} onClick={() => go(page + 1)} aria-label="Próxima página">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </nav>
  )
}

function Catalog() {
  const { search, update } = useCatalogSearch()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState(search.q ?? '')
  useEffect(() => setQuery(search.q ?? ''), [search.q])

  const params = useMemo(
    () => ({
      q: search.q,
      tab: search.tab,
      category: search.category,
      chain: search.chain,
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      sort: search.sort,
      page: search.page ?? 1,
      pageSize: PAGE_SIZE,
    }),
    [search],
  )
  const list = useNftList(params)
  const data = list.data
  const activeFilters = (search.category?.length ?? 0) + (search.chain?.length ?? 0) + (search.minPrice || search.maxPrice ? 1 : 0)
  const hasAnyFilter = activeFilters > 0 || !!search.q || !!search.tab

  return (
    <section id="catalogo" aria-labelledby="catalogo-titulo" className="container-page scroll-mt-4">
      <h2 id="catalogo-titulo" className="sr-only">
        Catálogo de NFTs
      </h2>
      {/* Mobile search + filters */}
      <form
        role="search"
        className="mb-4 flex gap-2 md:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: query.trim() || undefined })
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="mobile-search" className="sr-only">
            Explorar coleções
          </label>
          <Input id="mobile-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Explorar coleções" className="h-11 rounded-xl border-0 bg-surface pl-9" />
        </div>
        <Button type="button" size="icon" className="size-11 rounded-xl" aria-label={`Filtros${activeFilters ? `, ${activeFilters} ativos` : ''}`} onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </Button>
      </form>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent side="left" className="p-5">
          <DialogTitle className="mb-4">Filtros</DialogTitle>
          <FilterPanel data={data} onApplied={() => setFiltersOpen(false)} />
          <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
            Ver {data?.total ?? ''} resultados
          </Button>
        </DialogContent>
      </Dialog>

      <div className="grid gap-12 md:grid-cols-[230px_1fr] lg:grid-cols-[310px_1fr]">
        <aside aria-label="Filtros" className="hidden md:block">
          <div className="bg-surface p-5">
            <form
              role="search"
              className="mb-6"
              onSubmit={(e) => {
                e.preventDefault()
                update({ q: query.trim() || undefined })
              }}
            >
              <label htmlFor="desktop-search" className="mb-2 block text-lg font-bold">
                Buscar
              </label>
              <div className="flex gap-2">
                <Input id="desktop-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, coleção..." />
                <Button type="submit" size="icon" aria-label="Buscar">
                  <Search aria-hidden="true" />
                </Button>
              </div>
            </form>
            <FilterPanel data={data} />
          </div>
          <FeaturedOffer />
        </aside>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div role="tablist" aria-label="Seções do catálogo" className="-mx-1 flex gap-4 overflow-x-auto px-1">
              {(Object.keys(TAB_LABEL) as NftTab[]).map((t) => {
                const active = (search.tab ?? 'all') === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => update({ tab: t === 'all' ? undefined : t })}
                    className={cn('whitespace-nowrap border-b-2 pb-1 text-sm font-semibold md:text-base', active ? 'border-accent-strong text-accent-strong' : 'border-transparent text-cream')}
                  >
                    {TAB_LABEL[t]}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm md:text-base">
              <label htmlFor="sort">Ordenar por:</label>
              <NativeSelect
                id="sort"
                value={search.sort ?? 'recent'}
                onChange={(e) => update({ sort: e.target.value === 'recent' ? undefined : (e.target.value as NftSort) })}
                className="w-52 [&_select]:border-0 [&_select]:bg-transparent [&_select]:px-0"
              >
                {(Object.keys(SORT_LABEL) as NftSort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {hasAnyFilter && data && !list.isPlaceholderData && (
            <p className="mt-3 text-sm text-muted" role="status">
              {data.total} {data.total === 1 ? 'resultado' : 'resultados'}
              {search.q && <> para “{search.q}”</>}
              {' · '}
              <Link to="/" search={{}} className="text-accent-strong underline-offset-4 hover:underline" resetScroll={false}>
                limpar filtros
              </Link>
            </p>
          )}

          <div aria-busy={list.isFetching} className="mt-6">
            {list.isPending ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3 lg:gap-x-8" data-testid="catalog-loading">
                {Array.from({ length: PAGE_SIZE }, (_, i) => (
                  <NftCardSkeleton key={i} />
                ))}
              </div>
            ) : list.isError && !data ? (
              <div role="alert" className="grid place-items-center gap-4 rounded bg-surface p-10 text-center">
                <p className="font-bold">Não foi possível carregar o catálogo.</p>
                <p className="text-sm text-muted">{list.error instanceof ApiError ? list.error.message : 'Erro inesperado.'}</p>
                <Button onClick={() => list.refetch()}>
                  <RotateCcw aria-hidden="true" /> Tentar novamente
                </Button>
              </div>
            ) : data && data.items.length === 0 ? (
              <div role="status" className="grid place-items-center gap-3 rounded bg-surface p-10 text-center">
                <p className="font-bold">Nenhum NFT encontrado.</p>
                <p className="text-sm text-muted">Ajuste a busca ou os filtros para ver mais resultados.</p>
                {hasAnyFilter && (
                  <Button asChild variant="outline">
                    <Link to="/" search={{}} resetScroll={false}>
                      Limpar filtros
                    </Link>
                  </Button>
                )}
              </div>
            ) : data ? (
              <>
                {list.isError && (
                  <p role="alert" className="mb-4 text-sm text-danger">
                    Falha ao atualizar. Mostrando os últimos resultados carregados.{' '}
                    <button type="button" className="underline" onClick={() => list.refetch()}>
                      Tentar novamente
                    </button>
                  </p>
                )}
                <ul className={cn('grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3 lg:gap-x-8', list.isPlaceholderData && 'opacity-60')} data-testid="catalog-grid">
                  {data.items.map((nft, i) => (
                    <li key={nft.id}>
                      <NftCard nft={nft} priority={i < 3} />
                    </li>
                  ))}
                </ul>
                <Pagination page={data.page} totalPages={data.totalPages} />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturedOffer() {
  return (
    <div className="mt-6 overflow-hidden bg-surface pt-6">
      <p className="px-5 text-2xl font-bold text-accent-strong">NFT EM DESTAQUE</p>
      <p className="mt-2 text-center text-xl font-bold">OFERTA LIMITADA</p>
      <Link to="/nft/$nftId" params={{ nftId: 'nft-005' }} className="mt-3 block" aria-label="Ver Violet Nomad #314 em oferta limitada">
        <img src="/nfts/sage-nomad-400.webp" alt="" width={310} height={310} loading="lazy" className="aspect-square w-full rounded-[20px] object-cover" />
      </Link>
    </div>
  )
}

function PromoBanners() {
  const banners = [
    { title: 'Lançamentos gênesis de edição limitada', text: 'Colecione edições escassas diretamente dos criadores antes da revelação pública.', image: '/nfts/emerald-ape-400.webp', search: { tab: 'new' as const } },
    { title: 'Arte digital selecionada e muito mais', text: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.', image: '/nfts/neon-vessel-400.webp', search: { category: ['arte-digital' as const] } },
  ]
  return (
    <section aria-label="Coleções em destaque" className="container-page mt-24 grid gap-6 lg:grid-cols-2">
      {banners.map((b) => (
        <article key={b.title} className="grid grid-cols-[minmax(0,287px)_1fr] items-center overflow-hidden rounded-[20px] bg-surface">
          <img src={b.image} alt="" width={287} height={250} loading="lazy" className="h-full w-full object-cover" />
          <div className="grid justify-items-end gap-3 p-4 text-right md:p-6">
            <h2 className="text-sm font-bold leading-6 md:text-lg">{b.title}</h2>
            <p className="hidden text-sm leading-6 text-muted sm:block">{b.text}</p>
            <Button asChild size="sm" className="h-10 px-6">
              <Link to="/" search={b.search} hash="catalogo">
                Explorar <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </section>
  )
}

function Journal() {
  const posts = [
    { date: '12 de setembro', read: 6, title: 'Como funciona a propriedade de NFTs', text: 'Aprenda a colecionar, negociar e verificar ativos digitais.', image: '/nfts/neon-vessel-400.webp' },
    { date: '13 de setembro', read: 2, title: '10 artistas digitais para acompanhar', text: 'Conheça criadores que moldam a cultura digital.', image: '/nfts/emerald-ape-400.webp' },
    { date: '15 de setembro', read: 3, title: 'Raridade, atributos e procedência', text: 'Entenda raridade, procedência, direitos autorais e utilidade.', image: '/nfts/sage-nomad-400.webp' },
    { date: '15 de setembro', read: 2, title: 'Como proteger sua carteira', text: 'Proteja sua carteira, seus ativos e sua identidade.', image: '/nfts/golden-beat-400.webp' },
  ]
  return (
    <section aria-labelledby="diario" className="container-page mt-24">
      <h2 id="diario" className="text-center text-2xl font-bold md:text-[28px]">
        Diário da Cunhagem
      </h2>
      <p className="mt-4 text-center text-sm text-muted">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((p) => (
          <li key={p.title}>
            <article className="h-full overflow-hidden rounded-[8px] bg-surface">
              <img src={p.image} alt="" width={268} height={200} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              <div className="grid gap-2 p-4">
                <p className="text-xs text-muted">
                  {p.date} | Leitura de {p.read} min
                </p>
                <h3 className="font-bold leading-6">{p.title}</h3>
                <p className="text-xs leading-5 text-muted">{p.text}</p>
                <button type="button" onClick={comingSoon('O Diário da Cunhagem')} className="justify-self-start text-xs font-bold text-accent-strong hover:underline">
                  Ler mais <span aria-hidden="true">→</span>
                  <span className="sr-only"> sobre {p.title}</span>
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomePage() {
  useEffect(() => {
    document.title = 'Kurio · Marketplace de NFTs'
  }, [])
  return (
    <>
      <Hero />
      <Catalog />
      <PromoBanners />
      <Journal />
    </>
  )
}
