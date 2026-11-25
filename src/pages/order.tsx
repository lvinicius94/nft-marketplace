import { useEffect } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Loader2, MailOpen, RotateCcw, XCircle } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useOrder } from '@/api/queries'
import { useSession } from '@/auth/session-store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/primitives'
import { attemptStore } from '@/features/checkout-attempt'
import { announce } from '@/lib/announcer'
import { EXPLORER_LABEL, eth, formatDate, NETWORK_LABEL, PROVIDER_LABEL, shortHash } from '@/lib/format'
import { NotFound } from './not-found'

const route = getRouteApi('/pedido/$orderId')

export function OrderPage() {
  const { orderId } = route.useParams()
  const { user } = useSession()
  const order = useOrder(orderId)
  const o = order.data

  useEffect(() => {
    document.title = 'Pedido · Kurio'
  }, [])
  // Terminal states end the checkout attempt and are announced once.
  useEffect(() => {
    if (!o || o.status === 'pending' || !user) return
    attemptStore.clear(user.id)
    announce(o.status === 'confirmed' ? 'Pagamento confirmado. Seus NFTs estão na sua carteira.' : 'Pagamento recusado.', 'assertive')
  }, [o?.status, o, user])

  if (order.isPending) {
    return (
      <div className="container-page grid max-w-[462px] gap-4 py-16" data-testid="order-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (order.isError) {
    if (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 403)) {
      return <NotFound title="Pedido não encontrado" message="Este pedido não existe ou não pertence à sua conta." />
    }
    return (
      <div role="alert" className="container-page grid place-items-center gap-4 py-24">
        <p>Não foi possível carregar o pedido.</p>
        <Button onClick={() => order.refetch()}>
          <RotateCcw aria-hidden="true" /> Tentar novamente
        </Button>
      </div>
    )
  }
  if (!o) return null

  if (o.status === 'pending') {
    return (
      <section className="container-page grid max-w-[462px] place-items-center gap-4 py-24 text-center" aria-busy="true" data-testid="order-pending">
        <Loader2 className="size-10 animate-spin text-accent-strong" aria-hidden="true" />
        <h1 className="text-xl font-bold">Aguardando confirmação na rede {NETWORK_LABEL[o.network]}…</h1>
        <p role="status" className="text-sm text-muted">
          Pedido {o.id} pendente. Você pode recarregar a página: o status será recuperado sem criar outra compra.
        </p>
      </section>
    )
  }

  if (o.status === 'declined') {
    return (
      <section className="container-page grid max-w-[462px] place-items-center gap-4 py-24 text-center" data-testid="order-declined">
        <XCircle className="size-10 text-danger" aria-hidden="true" />
        <h1 className="text-xl font-bold">Pagamento recusado</h1>
        <p className="text-sm text-muted">{o.declineReason} Seus itens continuam no carrinho.</p>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/pagamento">Tentar novamente</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/carrinho">Ver carrinho</Link>
          </Button>
        </div>
      </section>
    )
  }

  // Confirmed: the receipt is the immutable order snapshot returned by the API.
  return (
    <section className="container-page py-10 md:py-20" data-testid="order-confirmed">
      <div className="mx-auto max-w-[462px] border-b-8 border-accent bg-surface">
        <div className="grid justify-items-center gap-4 px-6 pb-6 pt-6">
          <MailOpen className="size-16 text-accent-strong" strokeWidth={1.25} aria-hidden="true" />
          <h1 className="text-center text-base font-bold text-muted">Seus NFTs agora estão na sua carteira</h1>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-y border-accent px-6 py-3 text-xs sm:grid-cols-4 sm:divide-x sm:divide-accent">
          <div className="sm:pr-3">
            <dt className="font-bold">ID da transação</dt>
            <dd className="text-muted" data-testid="tx-hash">
              {o.txHash ? shortHash(o.txHash) : '—'}
            </dd>
          </div>
          <div className="sm:px-3">
            <dt className="font-bold">Data</dt>
            <dd className="text-muted">{formatDate(o.updatedAt)}</dd>
          </div>
          <div className="sm:px-3">
            <dt className="font-bold">Total</dt>
            <dd className="text-muted">{eth(o.totalEth)}</dd>
          </div>
          <div className="sm:pl-3">
            <dt className="font-bold">Carteira</dt>
            <dd className="text-muted">{PROVIDER_LABEL[o.wallet.provider]}</dd>
          </div>
        </dl>
        <div className="grid gap-4 px-6 py-6 md:px-9">
          <h2 className="text-sm font-bold">Detalhes da transação</h2>
          <table className="w-full text-sm">
            <caption className="sr-only">Itens comprados</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="pb-2 font-semibold">NFTs</th>
                <th scope="col" className="pb-2 text-center font-semibold">Edições</th>
                <th scope="col" className="pb-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.editionId}>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <img src={l.image} alt="" width={56} height={56} className="size-14 rounded object-cover" />
                      <div>
                        <p className="font-bold">{l.name}</p>
                        <p className="text-xs text-muted">
                          ID do token: {l.tokenId} · {l.editionName}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-center text-xs text-muted">(x {l.quantity})</td>
                  <td className="text-right font-bold text-accent-strong">{eth(l.lineTotalEth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto grid w-full max-w-[260px] gap-1 text-sm">
            {o.coupon && (
              <div className="flex justify-between">
                <dt>Desconto ({o.coupon.code})</dt>
                <dd>(-) {eth(o.discountEth)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Taxa de rede</dt>
              <dd>{eth(o.networkFeeEth)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-bold">
              <dt>Total</dt>
              <dd className="text-accent-strong" data-testid="receipt-total">
                {eth(o.totalEth)}
              </dd>
            </div>
          </dl>
          <p className="text-center text-xs leading-5 text-muted">
            Transação confirmada na {NETWORK_LABEL[o.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede.
          </p>
          {o.explorerUrl && (
            <Button asChild className="justify-self-center">
              <a href={o.explorerUrl} target="_blank" rel="noreferrer">
                Ver no {EXPLORER_LABEL[o.network]}
                <span className="sr-only"> (link simulado, abre em nova aba)</span>
              </a>
            </Button>
          )}
          <Link to="/" className="text-center text-sm text-accent-strong hover:underline">
            Continuar explorando
          </Link>
        </div>
      </div>
    </section>
  )
}
