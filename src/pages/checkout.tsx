import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Loader2, Plug, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import type { BuyerInfo, CreateOrderRequest, Network, Quote, Wallet } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import { useAcknowledgePrices, useCart, useOrder, useQuote, useWallets } from '@/api/queries'
import { useSession } from '@/auth/session-store'
import { Field } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogTitle, RadioGroup, RadioGroupItem, Skeleton } from '@/components/ui/primitives'
import { attemptStore, useSubmitOrder } from '@/features/checkout-attempt'
import { announce } from '@/lib/announcer'
import { eth, NETWORK_LABEL, PROVIDER_LABEL, shortHash } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CouponForm, SummaryLines } from './cart'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ENS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i

type Draft = BuyerInfo & { network: Network; walletId: string | null }
const draftKey = (userId: string) => `checkout-draft:${userId}`

function loadDraft(userId: string): Partial<Draft> {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(userId)) ?? '{}') as Partial<Draft>
  } catch {
    return {}
  }
}

function validate(d: Draft): Record<string, string> {
  const e: Record<string, string> = {}
  if (!d.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
  if (!/^[a-z0-9_.]{3,20}$/i.test(d.username)) e.username = 'Use de 3 a 20 letras, números, ponto ou _.'
  if (!d.profileName.trim()) e.profileName = 'Informe o nome do perfil.'
  if (!EMAIL_RE.test(d.email)) e.email = 'Informe um e-mail válido.'
  if (!d.referralCode.trim()) e.referralCode = 'Informe o código de indicação.'
  if (!ENS_RE.test(d.ensName)) e.ensName = 'Informe um nome ENS válido.'
  if (!d.walletId) e.walletId = 'Selecione uma carteira compatível com a rede.'
  return e
}

/** Simulated wallet connection: approve, reject and disconnect go through the mocked API. */
function useWalletConnection() {
  const [connected, setConnected] = useState<{ walletId: string; network: Network } | null>(null)
  const [prompt, setPrompt] = useState<Wallet | null>(null)
  const connect = useMutation({
    mutationFn: ({ wallet, network, simulate }: { wallet: Wallet; network: Network; simulate: 'approve' | 'reject' }) => api.wallets.connect(wallet.id, network, simulate),
    onSuccess: (c) => {
      setConnected({ walletId: c.walletId, network: c.network })
      setPrompt(null)
      announce('Carteira conectada.')
      toast.success('Carteira conectada.')
    },
    onError: (err) => {
      setPrompt(null)
      setConnected(null)
      const msg = err instanceof ApiError ? err.message : 'Falha ao conectar.'
      announce(msg, 'assertive')
      toast.error(msg)
    },
  })
  return { connected, setConnected, prompt, setPrompt, connect }
}

function QuoteLines({ quote }: { quote: Quote }) {
  return (
    <ul className="grid gap-2">
      {quote.lines.map((l) => (
        <li key={l.editionId} className="flex items-center gap-3 bg-surface p-1 pr-3">
          <img src={l.image} alt="" width={56} height={56} className="size-14 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{l.name}</p>
            <p className="text-xs text-muted">
              ID do token: {l.tokenId} · {l.editionName}
            </p>
          </div>
          <span className="text-xs text-muted">(x {l.quantity})</span>
          <span className="text-base font-bold text-accent-strong">{eth(l.lineTotalEth)}</span>
        </li>
      ))}
    </ul>
  )
}

export function CheckoutPage() {
  const { user } = useSession()
  const userId = user!.id
  const navigate = useNavigate()
  const router = useRouter()
  const qc = useQueryClient()
  const cart = useCart()
  const wallets = useWallets()
  const ack = useAcknowledgePrices()
  const { submit, pending, retrying } = useSubmitOrder(userId)
  const conn = useWalletConnection()

  // ---------- Recover a previous attempt (refresh / reconnection) ----------
  const [attempt] = useState(() => attemptStore.read(userId))
  const previousOrder = useOrder(attempt?.orderId ?? null)
  useEffect(() => {
    const o = previousOrder.data
    if (o?.status === 'pending') navigate({ to: '/pedido/$orderId', params: { orderId: o.id }, replace: true })
    if (o && o.status !== 'pending') attemptStore.clear(userId)
  }, [previousOrder.data, navigate, userId])

  // ---------- Form state (draft survives refresh and re-login) ----------
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft(userId)
    return {
      displayName: user!.name,
      username: user!.username,
      profileName: user!.username,
      email: user!.email,
      referralCode: '',
      ensName: user!.ensName ?? '',
      note: '',
      network: 'ethereum',
      walletId: null,
      ...saved,
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify(draft))
    } catch {
      /* ignore */
    }
  }, [draft, userId])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [otherWallet, setOtherWallet] = useState(false)
  const [showCoupon, setShowCoupon] = useState(false)
  const [review, setReview] = useState<Quote | null>(null)
  const [changedNotice, setChangedNotice] = useState<string | null>(null)

  const compatible = useMemo(() => (wallets.data ?? []).filter((w) => w.network === draft.network), [wallets.data, draft.network])
  const selectedWallet = (wallets.data ?? []).find((w) => w.id === draft.walletId) ?? null

  // Default to the first compatible wallet; drop the selection when the network changes.
  useEffect(() => {
    if (!wallets.data) return
    if (!selectedWallet || selectedWallet.network !== draft.network) {
      setDraft((d) => ({ ...d, walletId: compatible[0]?.id ?? null }))
    }
  }, [wallets.data, draft.network, compatible, selectedWallet])
  // Any change of wallet/network requires a new connection.
  useEffect(() => {
    if (conn.connected && (conn.connected.walletId !== draft.walletId || conn.connected.network !== draft.network)) conn.setConnected(null)
  }, [draft.walletId, draft.network, conn])

  const quote = useQuote(draft.network, cart.data)
  const q = quote.data
  const priceIssues = q?.issues.filter((i) => i.kind === 'price_changed') ?? []
  const stockIssues = q?.issues.filter((i) => i.kind !== 'price_changed') ?? []
  const quoteReady = !!q && !quote.isFetching && !quote.isPlaceholderData
  const isConnected = !!conn.connected && conn.connected.walletId === draft.walletId

  // If the quote changes while the review dialog is open, require a new confirmation.
  useEffect(() => {
    if (review && q && q.id !== review.id) {
      setReview(null)
      setChangedNotice('Preço, disponibilidade ou taxas mudaram enquanto você revisava. Confira o novo resumo e confirme novamente.')
      announce('Os valores do pedido mudaram. Revise novamente.', 'assertive')
    }
  }, [q, review])

  useEffect(() => {
    document.title = 'Pagamento · Kurio'
  }, [])

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft({ ...draft, [k]: e.target.value })

  const openReview = () => {
    const e = validate(draft)
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) {
      document.getElementById(`checkout-${first}`)?.focus()
      announce('Corrija os campos destacados.', 'assertive')
      return
    }
    if (!isConnected) {
      toast.error('Conecte a carteira selecionada antes de confirmar.')
      document.getElementById('connect-wallet')?.focus()
      return
    }
    if (!q || !quoteReady) return
    setChangedNotice(null)
    setReview(q)
  }

  const confirm = async () => {
    if (!review || !selectedWallet) return
    const body: CreateOrderRequest = {
      quoteId: review.id,
      walletId: selectedWallet.id,
      network: draft.network,
      buyer: { displayName: draft.displayName, username: draft.username, profileName: draft.profileName, email: draft.email, referralCode: draft.referralCode, ensName: draft.ensName, note: draft.note },
    }
    const result = await submit(body)
    if (!result) return
    if (result.ok) {
      setReview(null)
      try {
        sessionStorage.removeItem(draftKey(userId))
      } catch {
        /* ignore */
      }
      navigate({ to: '/pedido/$orderId', params: { orderId: result.order.id } })
      return
    }
    const err = result.error
    setReview(null)
    if (err.code === 'QUOTE_CHANGED' || err.code === 'OUT_OF_STOCK') {
      setChangedNotice(err.message)
      announce(err.message, 'assertive')
      qc.invalidateQueries({ queryKey: ['cart'] })
      qc.invalidateQueries({ queryKey: ['nfts'] })
      qc.invalidateQueries({ queryKey: ['user', userId, 'quote'] })
    } else if (err.code === 'VALIDATION_ERROR') {
      const fields = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace('buyer.', ''), v]))
      setErrors(fields)
      toast.error(err.message)
    } else if (err.code !== 'SESSION_EXPIRED' && err.code !== 'UNAUTHENTICATED') {
      toast.error(err.transient ? 'Não conseguimos confirmar o envio. Seus itens foram preservados; tente novamente — o mesmo pedido será recuperado.' : err.message)
    }
  }

  if (cart.data && cart.data.items.length === 0 && !pending) {
    return (
      <div className="container-page grid place-items-center gap-4 py-24 text-center">
        <p className="font-bold">Seu carrinho está vazio.</p>
        <Button asChild>
          <Link to="/" hash="catalogo">
            Explorar NFTs
          </Link>
        </Button>
      </div>
    )
  }

  const unresolvedAttempt = attempt && !attempt.orderId

  return (
    <div className="container-page pt-4 md:pt-6">
      <div className="mb-6 flex items-center gap-4 md:hidden">
        <button type="button" onClick={() => router.history.back()} className="grid size-9 place-items-center rounded-full border border-line" aria-label="Voltar">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold">Pagamento com carteira</h1>
      </div>
      <nav aria-label="Trilha" className="mb-4 hidden text-sm font-semibold md:block">
        <Link to="/">Início</Link> / <Link to="/carrinho">Mercado</Link> / <span aria-current="page">Pagamento</span>
      </nav>

      {unresolvedAttempt && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded border border-accent bg-surface p-4 text-sm">
          <AlertTriangle className="size-5 text-accent-strong" aria-hidden="true" />
          <p className="flex-1">Uma tentativa de compra anterior não recebeu resposta. Retome para recuperar o mesmo pedido, sem cobrança duplicada.</p>
          <Button
            size="sm"
            disabled={pending}
            onClick={async () => {
              const r = await submit(attempt.body)
              if (r?.ok) navigate({ to: '/pedido/$orderId', params: { orderId: r.order.id } })
              else if (r) toast.error(r.error.message)
            }}
          >
            Retomar pedido
          </Button>
        </div>
      )}

      {changedNotice && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded border border-accent bg-surface p-4 text-sm" data-testid="checkout-changed">
          <AlertTriangle className="mt-0.5 size-5 text-accent-strong" aria-hidden="true" />
          <p>{changedNotice}</p>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_324px] lg:gap-6">
        <form
          noValidate
          aria-labelledby="perfil-colecionador"
          className="grid content-start gap-x-5 gap-y-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            openReview()
          }}
          id="checkout-form"
        >
          <h2 id="perfil-colecionador" className="text-base font-bold md:col-span-2">
            Perfil do colecionador
          </h2>
          <Field id="checkout-displayName" label="Nome de exibição" required error={errors.displayName}>
            {(a) => <Input {...a} autoComplete="name" value={draft.displayName} onChange={set('displayName')} />}
          </Field>
          <Field id="checkout-username" label="Nome de usuário" required error={errors.username}>
            {(a) => <Input {...a} autoComplete="username" value={draft.username} onChange={set('username')} />}
          </Field>
          <Field id="checkout-network" label="Rede" required error={errors.network}>
            {(a) => (
              <NativeSelect {...a} value={draft.network} onChange={set('network')}>
                {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => (
                  <option key={n} value={n}>
                    {NETWORK_LABEL[n]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="checkout-profileName" label="Nome do perfil" required error={errors.profileName}>
            {(a) => <Input {...a} value={draft.profileName} onChange={set('profileName')} />}
          </Field>
          <Field id="checkout-address" label="Endereço da carteira" required hint="Preenchido pela carteira selecionada.">
            {(a) => <Input {...a} readOnly value={selectedWallet?.address ?? ''} placeholder="Endereço 0x da carteira" />}
          </Field>
          <Field id="checkout-secondary" label="ENS ou carteira secundária (opcional)" srLabel className="md:self-end">
            {(a) => <Input {...a} readOnly value={selectedWallet?.secondaryAddress ?? ''} placeholder="ENS ou carteira secundária (opcional)" />}
          </Field>
          <Field id="checkout-provider" label="Tipo de carteira" required>
            {(a) => <Input {...a} readOnly value={selectedWallet ? PROVIDER_LABEL[selectedWallet.provider] : ''} placeholder="Selecione uma carteira" />}
          </Field>
          <Field id="checkout-referralCode" label="Código de indicação" required error={errors.referralCode}>
            {(a) => <Input {...a} value={draft.referralCode} onChange={set('referralCode')} />}
          </Field>
          <Field id="checkout-email" label="E-mail" required error={errors.email}>
            {(a) => <Input {...a} type="email" autoComplete="email" value={draft.email} onChange={set('email')} />}
          </Field>
          <Field id="checkout-ensName" label="Nome ENS" required error={errors.ensName}>
            {(a) => (
              <div className="flex gap-2">
                <span className="grid h-10 place-items-center rounded-[2px] border border-line px-3 text-sm">.eth</span>
                <Input {...a} value={draft.ensName} onChange={set('ensName')} placeholder="seunome" />
              </div>
            )}
          </Field>
          <div className="flex items-center gap-2 md:col-span-2">
            <Checkbox id="other-wallet" checked={otherWallet} onCheckedChange={(v) => setOtherWallet(v === true)} />
            <label htmlFor="other-wallet" className="text-sm">
              Usar outra carteira?
            </label>
          </div>
          {otherWallet && (
            <p className="text-sm text-muted md:col-span-2">
              Cadastre ou edite sua carteira secundária em{' '}
              <Link to="/perfil/carteiras" className="text-accent-strong underline">
                Carteiras
              </Link>
              . Seus dados de pagamento ficam salvos para quando você voltar.
            </p>
          )}
          <Field id="checkout-note" label="Observação do colecionador (opcional)" className="md:col-span-1">
            {(a) => <Textarea {...a} value={draft.note} onChange={set('note')} maxLength={280} />}
          </Field>
        </form>

        <aside aria-labelledby="seus-nfts" className="grid content-start gap-4">
          <h2 id="seus-nfts" className="text-base font-bold">
            Seus NFTs
          </h2>
          {!q ? (
            <div className="grid gap-2" data-testid="quote-loading">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <QuoteLines quote={q} />
              {(priceIssues.length > 0 || stockIssues.length > 0) && (
                <div role="alert" className="grid gap-2 rounded border border-accent p-3 text-sm" data-testid="quote-issues">
                  {[...priceIssues, ...stockIssues].map((i) => (
                    <p key={i.editionId + i.kind}>{i.message}</p>
                  ))}
                  {stockIssues.length > 0 ? (
                    <Link to="/carrinho" className="text-accent-strong underline">
                      Ajustar carrinho
                    </Link>
                  ) : (
                    <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate(undefined, { onSuccess: () => announce('Novos preços aceitos.') })}>
                      Aceitar novos preços
                    </Button>
                  )}
                </div>
              )}
              {cart.data && (showCoupon || cart.data.summary.coupon) ? (
                <CouponForm cart={cart.data} />
              ) : (
                <button type="button" className="text-center text-sm hover:text-accent-strong" onClick={() => setShowCoupon(true)}>
                  Tem um código promocional? Aplique aqui
                </button>
              )}
              <div aria-busy={quote.isFetching} className={cn(quote.isFetching && 'opacity-70')}>
                <SummaryLines summary={q} estimated={false} />
              </div>
            </>
          )}

          <fieldset className="grid gap-3">
            <legend className="mb-3 text-center text-base font-bold">Carteira e rede</legend>
            {wallets.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : !wallets.data?.length ? (
              <p className="text-sm text-muted">
                Nenhuma carteira cadastrada.{' '}
                <Link to="/perfil/carteiras" className="text-accent-strong underline">
                  Cadastrar carteira
                </Link>
              </p>
            ) : (
              <RadioGroup value={draft.walletId ?? ''} onValueChange={(v) => setDraft({ ...draft, walletId: v })} aria-describedby={errors.walletId ? 'wallet-error' : undefined}>
                {wallets.data.map((w) => {
                  const disabled = w.network !== draft.network
                  return (
                    <label key={w.id} className={cn('flex items-center gap-4 border border-line px-4 py-3 text-sm', w.id === draft.walletId && 'border-accent', disabled && 'opacity-50')}>
                      <RadioGroupItem value={w.id} disabled={disabled} aria-label={`${w.label}, ${PROVIDER_LABEL[w.provider]}, rede ${NETWORK_LABEL[w.network]}`} />
                      <span className="flex-1">
                        <span className="block">{PROVIDER_LABEL[w.provider]} · {w.label}</span>
                        <span className="block text-xs text-muted">
                          {shortHash(w.address)} · Rede {NETWORK_LABEL[w.network]}
                          {disabled && ' (rede diferente)'}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </RadioGroup>
            )}
            {errors.walletId && (
              <p id="wallet-error" role="alert" className="text-xs text-danger">
                {errors.walletId}
              </p>
            )}
            {selectedWallet && (
              <div className="flex items-center justify-between gap-2 text-sm" data-testid="wallet-connection">
                <span role="status">{isConnected ? `Conectada em ${NETWORK_LABEL[draft.network]}` : 'Carteira desconectada'}</span>
                {isConnected ? (
                  <Button size="sm" variant="ghost" onClick={() => (conn.setConnected(null), announce('Carteira desconectada.'))}>
                    <Unplug aria-hidden="true" /> Desconectar
                  </Button>
                ) : (
                  <Button id="connect-wallet" size="sm" variant="outline" onClick={() => conn.setPrompt(selectedWallet)}>
                    <Plug aria-hidden="true" /> Conectar carteira
                  </Button>
                )}
              </div>
            )}
          </fieldset>

          <Button type="submit" form="checkout-form" size="lg" className="w-full" disabled={!quoteReady || priceIssues.length > 0 || stockIssues.length > 0 || pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Confirmar compra
          </Button>
        </aside>
      </div>

      {/* Simulated wallet extension prompt */}
      <Dialog open={!!conn.prompt} onOpenChange={(o) => !o && conn.setPrompt(null)}>
        <DialogContent className="grid gap-4 p-6">
          <DialogTitle>Conectar {conn.prompt ? PROVIDER_LABEL[conn.prompt.provider] : ''}</DialogTitle>
          <DialogDescription>Simulação da extensão da carteira: aprove ou recuse a conexão na rede {NETWORK_LABEL[draft.network]}.</DialogDescription>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={conn.connect.isPending} onClick={() => conn.prompt && conn.connect.mutate({ wallet: conn.prompt, network: draft.network, simulate: 'approve' })}>
              Aprovar conexão
            </Button>
            <Button variant="outline" className="flex-1" disabled={conn.connect.isPending} onClick={() => conn.prompt && conn.connect.mutate({ wallet: conn.prompt, network: draft.network, simulate: 'reject' })}>
              Recusar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review before submitting */}
      <Dialog open={!!review} onOpenChange={(o) => !o && !pending && setReview(null)}>
        <DialogContent className="grid max-w-lg gap-4 p-6" data-testid="review-dialog">
          <DialogTitle>Revise seu pedido</DialogTitle>
          <DialogDescription>Confira os itens, a rede e o total antes de assinar a transação.</DialogDescription>
          {review && (
            <>
              <QuoteLines quote={review} />
              <SummaryLines summary={review} estimated={false} />
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Carteira</dt>
                  <dd>
                    {selectedWallet && `${PROVIDER_LABEL[selectedWallet.provider]} · ${shortHash(selectedWallet.address)}`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Rede</dt>
                  <dd>{NETWORK_LABEL[draft.network]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Colecionador</dt>
                  <dd>
                    {draft.displayName} · {draft.email}
                  </dd>
                </div>
              </dl>
              {retrying > 0 && (
                <p role="status" className="text-sm text-muted">
                  Conexão instável. Tentando novamente com a mesma chave de pedido ({retrying}/2)…
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setReview(null)}>
                  Voltar
                </Button>
                <Button className="flex-1" disabled={pending} onClick={confirm} data-testid="confirm-order">
                  {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {pending ? 'Enviando…' : 'Confirmar e assinar'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
