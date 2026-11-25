import { useEffect, useState } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ChevronLeft, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Cart, CartItem } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { useAcknowledgePrices, useApplyCoupon, useCart, useNftList, useRemoveCartItem, useRemoveCoupon, useUpdateCartItem } from '@/api/queries'
import { Field } from '@/components/form-field'
import { NftCard, NftCardSkeleton } from '@/components/nft-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/primitives'
import { announce } from '@/lib/announcer'
import { compareEth, mulEth } from '@/lib/eth'
import { eth } from '@/lib/format'
import { cn } from '@/lib/utils'

export function cartIssues(cart: Cart | undefined) {
  const items = cart?.items ?? []
  return {
    priceChanged: items.filter((i) => compareEth(i.unitPriceEth, i.addedPriceEth) !== 0),
    stock: items.filter((i) => !i.onSale || i.available === 0 || i.quantity > i.available),
  }
}

function QuantityStepper({ item }: { item: CartItem }) {
  const update = useUpdateCartItem()
  const limit = Math.min(item.available, item.maxPerOrder)
  const change = (quantity: number) =>
    update.mutate(
      { nftId: item.nftId, editionId: item.editionId, quantity },
      {
        onSuccess: () => announce(`Quantidade de ${item.name} atualizada para ${quantity}.`),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível alterar a quantidade.'),
      },
    )
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${item.name} (${item.editionName})`}>
      <Button size="icon-sm" className="h-6 w-5 rounded-full" disabled={item.quantity <= 1 || update.isPending} onClick={() => change(item.quantity - 1)} aria-label="Diminuir">
        <Minus className="!size-3" aria-hidden="true" />
      </Button>
      <output className="w-5 text-center" aria-live="polite" data-testid={`qty-${item.editionId}`}>
        {item.quantity}
      </output>
      <Button size="icon-sm" className="h-6 w-5 rounded-full" disabled={item.quantity >= limit || update.isPending} onClick={() => change(item.quantity + 1)} aria-label="Aumentar">
        <Plus className="!size-3" aria-hidden="true" />
      </Button>
    </div>
  )
}

function RemoveButton({ item }: { item: CartItem }) {
  const remove = useRemoveCartItem()
  return (
    <button
      type="button"
      disabled={remove.isPending}
      aria-label={`Remover ${item.name} (${item.editionName}) do carrinho`}
      className="rounded p-1.5 text-muted hover:text-accent-strong disabled:opacity-50"
      onClick={() =>
        remove.mutate(
          { nftId: item.nftId, editionId: item.editionId },
          {
            onSuccess: () => {
              toast.success(`${item.name} removido do carrinho.`)
              announce(`${item.name} removido do carrinho.`)
            },
            onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.'),
          },
        )
      }
    >
      <Trash2 className="size-5" aria-hidden="true" />
    </button>
  )
}

function ItemNotice({ item }: { item: CartItem }) {
  if (!item.onSale) return <p className="text-xs text-danger">Indisponível para venda</p>
  if (item.available === 0) return <p className="text-xs text-danger">Esgotado</p>
  if (item.quantity > item.available) return <p className="text-xs text-danger">Só restam {item.available}</p>
  if (compareEth(item.unitPriceEth, item.addedPriceEth) !== 0)
    return (
      <p className="text-xs text-accent-strong">
        Preço alterado: <s>{eth(item.addedPriceEth)}</s> → {eth(item.unitPriceEth)}
      </p>
    )
  return null
}

export function CouponForm({ cart, compact }: { cart: Cart; compact?: boolean }) {
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  if (cart.summary.coupon) {
    return (
      <div className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm" data-testid="coupon-applied">
        <span>
          Cupom <strong className="text-accent-strong">{cart.summary.coupon.code}</strong> · {cart.summary.coupon.description}
        </span>
        <button
          type="button"
          aria-label={`Remover cupom ${cart.summary.coupon.code}`}
          className="rounded p-1 hover:text-accent-strong"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => announce('Cupom removido.') })}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    )
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!code.trim()) return setError('Informe um código promocional.')
        setError(undefined)
        apply.mutate(code.trim(), {
          onSuccess: () => {
            setCode('')
            announce('Cupom aplicado.')
            toast.success('Cupom aplicado.')
          },
          onError: (err) => setError(err instanceof ApiError ? err.fields.code ?? err.message : 'Não foi possível aplicar o cupom.'),
        })
      }}
    >
      <Field id="coupon" label="Código promocional" srLabel={compact} error={error}>
        {(a11y) => (
          <div className={cn('flex', compact && 'rounded-full bg-surface p-1')}>
            <Input {...a11y} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Digite o código promocional..." className={cn('rounded-r-none', compact && 'border-0')} />
            <Button type="submit" disabled={apply.isPending} className={cn('rounded-l-none', compact && 'rounded-full')}>
              Aplicar
            </Button>
          </div>
        )}
      </Field>
    </form>
  )
}

export function SummaryLines({ summary, estimated = true }: { summary: Cart['summary']; estimated?: boolean }) {
  return (
    <dl className="grid gap-3 text-sm" data-testid="summary">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd className="text-base" data-testid="summary-subtotal">
          {eth(summary.subtotalEth)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt>Desconto do lançamento</dt>
        <dd data-testid="summary-discount">(-) {compareEth(summary.discountEth, '0') === 0 ? '00.00' : eth(summary.discountEth)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Taxa de rede</dt>
        <dd className="text-right text-base">
          {eth(summary.networkFeeEth)}
          {estimated && <span className="block text-[10px] text-accent-strong">Taxa estimada</span>}
        </dd>
      </div>
      <div className="flex justify-between border-t border-line pt-4 font-bold">
        <dt>Total</dt>
        <dd className="text-lg text-accent-strong" data-testid="summary-total">
          {eth(summary.totalEth)}
        </dd>
      </div>
    </dl>
  )
}

function CartSkeleton() {
  return (
    <div className="grid gap-3" data-testid="cart-loading" aria-busy="true">
      <span className="sr-only">Carregando carrinho…</span>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-[56px] w-full" />
      ))}
    </div>
  )
}

export function AlsoViewed({ title = 'Colecionadores também viram' }: { title?: string }) {
  const list = useNftList({ sort: 'popular', pageSize: 5, page: 2 })
  return (
    <section aria-labelledby="tambem-viram" className="mt-20">
      <h2 id="tambem-viram" className="border-b border-line pb-2 text-base font-bold text-accent-strong">
        {title}
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {list.isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <NftCardSkeleton />
              </li>
            ))
          : list.data?.items.map((n) => (
              <li key={n.id}>
                <NftCard nft={n} compact />
              </li>
            ))}
      </ul>
    </section>
  )
}

export function CartPage() {
  const cart = useCart()
  const router = useRouter()
  const navigate = useNavigate()
  const ack = useAcknowledgePrices()
  const data = cart.data
  const { priceChanged, stock } = cartIssues(data)
  const blocked = priceChanged.length > 0 || stock.length > 0

  useEffect(() => {
    document.title = 'Carrinho · Kurio'
  }, [])

  return (
    <div className="container-page pt-4 md:pt-6">
      <div className="mb-6 grid grid-cols-[36px_1fr_36px] items-center md:hidden">
        <button type="button" onClick={() => router.history.back()} className="grid size-9 place-items-center rounded-full border border-line" aria-label="Voltar">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="text-center text-xl font-bold">Carrinho de NFTs</h1>
      </div>
      <nav aria-label="Trilha" className="mb-2 hidden text-sm font-semibold md:block">
        <Link to="/">Início</Link> / <Link to="/" hash="catalogo">Mercado</Link> / <span aria-current="page">Carrinho</span>
      </nav>
      <h1 className="sr-only md:not-sr-only md:mb-4 md:text-lg md:font-bold">Carrinho</h1>

      {blocked && data && (
        <div role="alert" className="mb-6 flex flex-wrap items-start gap-3 rounded border border-accent bg-surface p-4 text-sm" data-testid="cart-alert">
          <AlertTriangle className="mt-0.5 size-5 text-accent-strong" aria-hidden="true" />
          <div className="flex-1">
            {priceChanged.length > 0 && <p>O preço de {priceChanged.map((i) => i.name).join(', ')} mudou enquanto você navegava. Revise o resumo antes de continuar.</p>}
            {stock.length > 0 && <p>Alguns itens estão esgotados ou com quantidade acima do disponível. Ajuste ou remova esses itens.</p>}
          </div>
          {priceChanged.length > 0 && stock.length === 0 && (
            <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate(undefined, { onSuccess: () => announce('Novos preços aceitos.') })}>
              Aceitar novos preços
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_266px] lg:gap-16">
        <div>
          {cart.isPending ? (
            <CartSkeleton />
          ) : cart.isError ? (
            <div role="alert" className="grid justify-items-start gap-3 rounded bg-surface p-6">
              <p>Não foi possível carregar o carrinho.</p>
              <Button onClick={() => cart.refetch()}>
                <RotateCcw aria-hidden="true" /> Tentar novamente
              </Button>
            </div>
          ) : !data?.items.length ? (
            <div className="grid justify-items-center gap-4 rounded bg-surface p-10 text-center" role="status">
              <p className="font-bold">Seu carrinho está vazio.</p>
              <Button asChild>
                <Link to="/" hash="catalogo">
                  Explorar NFTs
                </Link>
              </Button>
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-y-2 text-sm" data-testid="cart-table">
              <caption className="sr-only">Itens do carrinho</caption>
              <thead className="hidden md:table-header-group">
                <tr className="text-left">
                  <th scope="col" className="border-b border-line pb-2 font-semibold">NFTs</th>
                  <th scope="col" className="border-b border-line pb-2 font-semibold">Preço</th>
                  <th scope="col" className="border-b border-line pb-2 font-semibold">Edições</th>
                  <th scope="col" className="border-b border-line pb-2 font-semibold">Total</th>
                  <th scope="col" className="border-b border-line pb-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.editionId} className="bg-surface max-md:grid max-md:grid-cols-[100px_1fr_auto] max-md:items-center max-md:gap-x-3 max-md:rounded-[12px] max-md:p-0" data-testid="cart-row">
                    <td className="p-0 max-md:row-span-3 md:w-[45%]">
                      <div className="flex items-center gap-3">
                        <img src={item.image} alt="" width={56} height={56} className="size-[100px] rounded-l-[12px] object-cover md:size-14 md:rounded-none" />
                        <div className="max-md:hidden">
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs text-muted">
                            ID do token: {item.tokenId} · Edição {item.editionName}
                          </p>
                          <ItemNotice item={item} />
                        </div>
                      </div>
                    </td>
                    <td className="md:hidden">
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-muted">Edição: {item.editionName}</p>
                      <ItemNotice item={item} />
                    </td>
                    <td className="font-bold text-accent-strong max-md:col-start-2 max-md:text-lg md:text-cream">
                      <span className="sr-only">Preço unitário: </span>
                      {eth(item.unitPriceEth)}
                    </td>
                    <td className="max-md:col-start-3 max-md:row-start-1 max-md:row-end-3 max-md:pr-3">
                      <QuantityStepper item={item} />
                    </td>
                    <td className="font-bold text-accent-strong max-md:hidden">{eth(mulEth(item.unitPriceEth, item.quantity))}</td>
                    <td className="text-right max-md:col-start-3 max-md:row-start-3 max-md:pr-2">
                      <RemoveButton item={item} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside aria-labelledby="resumo" className="grid content-start gap-4">
          <h2 id="resumo" className="hidden border-b border-line pb-2 text-lg font-bold md:block">
            Resumo da carteira
          </h2>
          {cart.isPending ? (
            <div className="grid gap-3" data-testid="summary-loading">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : data ? (
            <>
              {data.items.length > 0 && <CouponForm cart={data} />}
              <SummaryLines summary={data.summary} />
              <Button size="lg" className="w-full" disabled={!data.items.length || blocked} onClick={() => navigate({ to: '/pagamento' })}>
                Conectar e finalizar
              </Button>
              {blocked && <p className="text-xs text-muted">Resolva os avisos do carrinho para continuar.</p>}
              <Link to="/" hash="catalogo" className="text-center text-sm text-accent-strong hover:underline">
                Continuar explorando
              </Link>
            </>
          ) : null}
        </aside>
      </div>
      <AlsoViewed />
    </div>
  )
}
