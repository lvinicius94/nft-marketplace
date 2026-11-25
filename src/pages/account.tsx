import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Download, Heart, ImageIcon, LifeBuoy, LogOut, MapPin, ShoppingCart, TrendingUp, User } from 'lucide-react'
import { toast } from 'sonner'
import type { Network, Wallet, WalletInput, WalletProvider, WalletRole } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import { qk, useChangePassword, useFavorites, useOrders, useProfile, useSaveWallet, useUpdateProfile, useWallets } from '@/api/queries'
import { sessionStore } from '@/auth/session-store'
import { Field, PasswordInput } from '@/components/form-field'
import { comingSoon } from '@/components/layout'
import { NftCard, NftCardSkeleton } from '@/components/nft-card'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Checkbox, Skeleton } from '@/components/ui/primitives'
import { announce } from '@/lib/announcer'
import { eth, formatDate, NETWORK_LABEL, PROVIDER_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ENS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i

// ---------- Layout ----------
export function AccountLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      /* the local session is cleared anyway */
    }
    sessionStore.signOut('logout')
    qc.removeQueries({ queryKey: ['user'] })
    announce('Você saiu da sua conta.')
    toast.success('Você saiu da sua conta.')
    navigate({ to: '/' })
  }
  const items: { to?: string; label: string; icon: typeof User; soon?: string }[] = [
    { to: '/perfil', label: 'Dados do perfil', icon: User },
    { to: '/perfil/carteiras', label: 'Carteiras', icon: MapPin },
    { to: '/perfil/pedidos', label: 'Atividade', icon: ShoppingCart },
    { to: '/perfil/favoritos', label: 'Lista de interesse', icon: Heart },
    { label: 'Ofertas', icon: TrendingUp, soon: 'Ofertas' },
    { label: 'Arquivos baixados', icon: Download, soon: 'Arquivos baixados' },
    { label: 'Suporte', icon: LifeBuoy, soon: 'Suporte' },
  ]
  return (
    <div className="container-page grid gap-6 pt-6 md:grid-cols-[248px_1fr] md:gap-6">
      <nav aria-label="Meu perfil" className="h-fit min-w-0 bg-surface py-4">
        <h1 className="mb-2 px-2 text-lg font-bold">Meu perfil</h1>
        <ul className="flex overflow-x-auto md:grid">
          {items.map((it) => {
            const active = it.to === pathname
            const cls = cn('flex w-full items-center gap-3 whitespace-nowrap border-l-4 px-3 py-2 text-sm text-accent-strong md:py-2.5', active ? 'border-accent text-accent-strong' : 'border-transparent hover:bg-surface-2')
            return (
              <li key={it.label}>
                {it.to ? (
                  <Link to={it.to} className={cls} aria-current={active ? 'page' : undefined}>
                    <it.icon className="size-4" aria-hidden="true" /> {it.label}
                  </Link>
                ) : (
                  <button type="button" className={cls} onClick={comingSoon(it.soon!)}>
                    <it.icon className="size-4" aria-hidden="true" /> {it.label}
                  </button>
                )}
              </li>
            )
          })}
          <li className="md:border-t md:border-line">
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 px-4 py-2 text-sm font-bold text-accent-strong hover:bg-surface-2">
              <LogOut className="size-4" aria-hidden="true" /> Sair
            </button>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

// ---------- Profile ----------
const MAX_AVATAR = 1_000_000

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ProfilePage() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const changePassword = useChangePassword()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', username: '', email: '', ensName: '', walletNickname: '' })
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = 'Meu perfil · Kurio'
  }, [])
  useEffect(() => {
    if (profile.data) {
      const p = profile.data
      setForm({ name: p.name, username: p.username, email: p.email, ensName: p.ensName ?? '', walletNickname: p.walletNickname })
    }
  }, [profile.data])

  if (profile.isPending) {
    return (
      <div className="grid gap-4" data-testid="profile-loading">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const currentAvatar = avatar === undefined ? profile.data?.avatarUrl : avatar
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submitProfile = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Informe o nome de exibição.'
    if (!/^[a-z0-9_.]{3,20}$/i.test(form.username)) e.username = 'Use de 3 a 20 letras, números, ponto ou _.'
    if (!EMAIL_RE.test(form.email)) e.email = 'Informe um e-mail válido.'
    if (form.ensName && !ENS_RE.test(form.ensName)) e.ensName = 'Use letras, números, hífen e ponto.'
    if (!form.walletNickname.trim()) e.walletNickname = 'Informe o apelido da carteira.'
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) return document.getElementById(`profile-${first}`)?.focus()
    update.mutate(
      { ...form, ensName: form.ensName || null, avatarDataUrl: avatar },
      {
        onSuccess: () => {
          setAvatar(undefined)
          toast.success('Perfil atualizado.')
          announce('Perfil atualizado.')
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k === 'avatarDataUrl' ? 'avatar' : k, v])))
            toast.error(err.message)
          }
        },
      },
    )
  }

  const submitPassword = () => {
    if (!pw.current && !pw.next && !pw.confirm) return
    const e: Record<string, string> = {}
    if (!pw.current) e.current = 'Informe a senha atual.'
    if (pw.next.length < 8) e.next = 'A nova senha precisa ter pelo menos 8 caracteres.'
    else if (!/[A-Z]/.test(pw.next) || !/\d/.test(pw.next)) e.next = 'Use ao menos uma letra maiúscula e um número.'
    if (pw.confirm !== pw.next) e.confirm = 'As senhas não conferem.'
    setPwErrors(e)
    const first = Object.keys(e)[0]
    if (first) return document.getElementById(`password-${first}`)?.focus()
    changePassword.mutate(
      { currentPassword: pw.current, newPassword: pw.next },
      {
        onSuccess: () => {
          setPw({ current: '', next: '', confirm: '' })
          toast.success('Senha alterada.')
          announce('Senha alterada com sucesso.')
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            setPwErrors({ current: err.fields.currentPassword, next: err.fields.newPassword })
            toast.error(err.message)
          }
        },
      },
    )
  }

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submitProfile()
        submitPassword()
      }}
    >
      <h2 className="text-base font-bold">Perfil do colecionador</h2>
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <Field id="profile-name" label="Nome de exibição" required error={errors.name}>
          {(a) => <Input {...a} autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field id="profile-username" label="Nome de usuário" required error={errors.username}>
          {(a) => <Input {...a} autoComplete="username" value={form.username} onChange={set('username')} />}
        </Field>
        <Field id="profile-email" label="E-mail" required error={errors.email}>
          {(a) => <Input {...a} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field id="profile-ensName" label="Nome ENS" required error={errors.ensName}>
          {(a) => (
            <div className="flex gap-2">
              <span className="grid h-10 place-items-center rounded-[2px] border border-line px-3 text-sm">.eth</span>
              <Input {...a} value={form.ensName} onChange={set('ensName')} />
            </div>
          )}
        </Field>
        <Field id="profile-walletNickname" label="Apelido da carteira" required error={errors.walletNickname}>
          {(a) => <Input {...a} value={form.walletNickname} onChange={set('walletNickname')} />}
        </Field>
        <div className="grid gap-2">
          <span className="text-sm" id="avatar-label">
            Avatar
          </span>
          <div className="flex items-center gap-4">
            <div className="grid size-10 place-items-center overflow-hidden rounded-full border border-line bg-surface">
              {currentAvatar ? <img src={currentAvatar} alt="Seu avatar" className="size-full object-cover" /> : <ImageIcon className="size-5 text-accent-strong" aria-label="Sem avatar" />}
            </div>
            <input
              ref={fileRef}
              id="profile-avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-labelledby="avatar-label"
              aria-describedby={errors.avatar ? 'avatar-error' : undefined}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (!file.type.startsWith('image/')) return setErrors({ ...errors, avatar: 'Envie uma imagem PNG, JPG ou WebP.' })
                if (file.size > MAX_AVATAR) return setErrors({ ...errors, avatar: 'A imagem pode ter até 1 MB.' })
                setErrors({ ...errors, avatar: '' })
                setAvatar(await readFile(file))
              }}
            />
            <Button type="button" size="sm" className="h-8 px-5" onClick={() => fileRef.current?.click()}>
              Alterar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAvatar(null)} disabled={!currentAvatar}>
              Remover
            </Button>
          </div>
          {errors.avatar && (
            <p id="avatar-error" role="alert" className="text-xs text-danger">
              {errors.avatar}
            </p>
          )}
          {avatar !== undefined && <p className="text-xs text-muted">Alteração de avatar pendente: clique em Salvar.</p>}
        </div>
      </div>

      <fieldset className="grid max-w-[334px] gap-4">
        <legend className="mb-2 text-base font-bold">Alterar senha</legend>
        <Field id="password-current" label="Senha atual" error={pwErrors.current}>
          {(a) => <PasswordInput {...a} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
        </Field>
        <Field id="password-next" label="Nova senha" error={pwErrors.next}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}
        </Field>
        <Field id="password-confirm" label="Confirmar nova senha" error={pwErrors.confirm}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}
        </Field>
      </fieldset>
      <Button type="submit" className="w-[105px]" disabled={update.isPending || changePassword.isPending}>
        Salvar
      </Button>
    </form>
  )
}

// ---------- Wallets ----------
const emptyWallet = (): WalletInput => ({
  displayName: '',
  label: '',
  network: 'ethereum',
  profileName: '',
  address: '',
  secondaryAddress: '',
  provider: 'metamask',
  referralCode: '',
  email: '',
  ensName: '',
})

function validateWallet(w: WalletInput) {
  const e: Record<string, string> = {}
  if (!w.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
  if (!w.label.trim()) e.label = 'Informe o apelido da carteira.'
  if (!w.profileName.trim()) e.profileName = 'Informe o nome do perfil.'
  const re = w.network === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[a-fA-F0-9]{40}$/
  if (!re.test(w.address)) e.address = w.network === 'solana' ? 'Endereço Solana inválido (base58, 32 a 44 caracteres).' : 'Endereço inválido: use 0x seguido de 40 caracteres hexadecimais.'
  if (!w.referralCode.trim()) e.referralCode = 'Informe o código de indicação.'
  if (!EMAIL_RE.test(w.email)) e.email = 'Informe um e-mail válido.'
  if (!ENS_RE.test(w.ensName)) e.ensName = 'Informe um nome ENS válido.'
  return e
}

function WalletForm({ role, wallet, onDone }: { role: WalletRole; wallet: Wallet | null; onDone: () => void }) {
  const save = useSaveWallet()
  const [form, setForm] = useState<WalletInput>(() => (wallet ? { ...wallet } : emptyWallet()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const p = `${role}-wallet`
  const set = (k: keyof WalletInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })
  return (
    <form
      noValidate
      className="grid gap-x-6 gap-y-5 md:grid-cols-2"
      aria-label={role === 'primary' ? 'Carteira principal' : 'Carteira secundária'}
      onSubmit={(e) => {
        e.preventDefault()
        const errs = validateWallet(form)
        setErrors(errs)
        const first = Object.keys(errs)[0]
        if (first) return document.getElementById(`${p}-${first}`)?.focus()
        save.mutate(
          { role, input: form },
          {
            onSuccess: () => {
              toast.success('Carteira salva.')
              announce('Carteira salva.')
              onDone()
            },
            onError: (err) => {
              if (err instanceof ApiError) {
                setErrors(err.fields)
                toast.error(err.message)
              }
            },
          },
        )
      }}
    >
      <Field id={`${p}-displayName`} label="Nome de exibição" required error={errors.displayName}>
        {(a) => <Input {...a} value={form.displayName} onChange={set('displayName')} />}
      </Field>
      <Field id={`${p}-label`} label="Apelido da carteira" required error={errors.label}>
        {(a) => <Input {...a} value={form.label} onChange={set('label')} />}
      </Field>
      <Field id={`${p}-network`} label="Rede" required>
        {(a) => (
          <NativeSelect {...a} value={form.network} onChange={set('network')}>
            {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => (
              <option key={n} value={n}>
                {NETWORK_LABEL[n]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field id={`${p}-profileName`} label="Nome do perfil" required error={errors.profileName}>
        {(a) => <Input {...a} value={form.profileName} onChange={set('profileName')} />}
      </Field>
      <Field id={`${p}-address`} label="Endereço da carteira" required error={errors.address}>
        {(a) => <Input {...a} value={form.address} onChange={set('address')} placeholder="Endereço 0x da carteira" spellCheck={false} />}
      </Field>
      <Field id={`${p}-secondaryAddress`} label="ENS ou carteira secundária (opcional)" srLabel className="md:self-end">
        {(a) => <Input {...a} value={form.secondaryAddress} onChange={set('secondaryAddress')} placeholder="ENS ou carteira secundária (opcional)" />}
      </Field>
      <Field id={`${p}-provider`} label="Tipo de carteira" required>
        {(a) => (
          <NativeSelect {...a} value={form.provider} onChange={set('provider')}>
            {(Object.keys(PROVIDER_LABEL) as WalletProvider[]).map((n) => (
              <option key={n} value={n}>
                {PROVIDER_LABEL[n]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field id={`${p}-referralCode`} label="Código de indicação" required error={errors.referralCode}>
        {(a) => <Input {...a} value={form.referralCode} onChange={set('referralCode')} />}
      </Field>
      <Field id={`${p}-email`} label="E-mail" required error={errors.email}>
        {(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} />}
      </Field>
      <Field id={`${p}-ensName`} label="Nome ENS" required error={errors.ensName}>
        {(a) => (
          <div className="flex gap-2">
            <span className="grid h-10 place-items-center rounded-[2px] border border-line px-3 text-sm">.eth</span>
            <Input {...a} value={form.ensName} onChange={set('ensName')} />
          </div>
        )}
      </Field>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" className="h-8" disabled={save.isPending}>
          Salvar carteira
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function WalletSection({ role, wallet, primary }: { role: WalletRole; wallet: Wallet | null; primary?: Wallet | null }) {
  const [editing, setEditing] = useState(false)
  const save = useSaveWallet()
  const title = role === 'primary' ? 'Carteira principal' : 'Carteira secundária'
  return (
    <section aria-labelledby={`${role}-title`} className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`${role}-title`} className="text-base font-bold">
            {title}
          </h2>
          {role === 'primary' ? (
            <p className="text-xs text-muted">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
          ) : (
            !wallet && <p className="text-xs text-muted">Você ainda não adicionou uma carteira secundária.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {role === 'secondary' && primary && !wallet && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                onCheckedChange={(v) =>
                  v === true &&
                  save.mutate(
                    { role: 'secondary', input: { ...primary, label: `${primary.label} (cópia)`, address: primary.secondaryAddress && /^0x[a-fA-F0-9]{40}$/.test(primary.secondaryAddress) ? primary.secondaryAddress : primary.address.replace(/.$/, (c) => (c === '0' ? '1' : '0')) } },
                    { onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível copiar.') },
                  )
                }
              />
              Igual à carteira principal
            </label>
          )}
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="font-bold text-accent-strong hover:underline">
              {wallet ? 'Editar' : 'Adicionar'}
              <span className="sr-only"> {title.toLowerCase()}</span>
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <WalletForm role={role} wallet={wallet} onDone={() => setEditing(false)} />
      ) : (
        wallet && (
          <dl className="grid gap-1 rounded bg-surface p-4 text-sm sm:grid-cols-2" data-testid={`${role}-wallet`}>
            <div>
              <dt className="text-muted">Apelido</dt>
              <dd>{wallet.label}</dd>
            </div>
            <div>
              <dt className="text-muted">Tipo</dt>
              <dd>{PROVIDER_LABEL[wallet.provider]}</dd>
            </div>
            <div>
              <dt className="text-muted">Rede</dt>
              <dd>{NETWORK_LABEL[wallet.network]}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Endereço</dt>
              <dd className="truncate">{wallet.address}</dd>
            </div>
          </dl>
        )
      )}
    </section>
  )
}

export function WalletsPage() {
  const wallets = useWallets()
  useEffect(() => {
    document.title = 'Carteiras · Kurio'
  }, [])
  if (wallets.isPending) return <Skeleton className="h-64 w-full" />
  if (wallets.isError)
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p>Não foi possível carregar as carteiras.</p>
        <Button onClick={() => wallets.refetch()}>Tentar novamente</Button>
      </div>
    )
  const primary = wallets.data.find((w) => w.role === 'primary') ?? null
  const secondary = wallets.data.find((w) => w.role === 'secondary') ?? null
  return (
    <div className="grid gap-10">
      <WalletSection role="primary" wallet={primary} />
      <WalletSection role="secondary" wallet={secondary} primary={primary} />
    </div>
  )
}

// ---------- Favorites ----------
export function FavoritesPage() {
  const favorites = useFavorites()
  const ids = [...(favorites.data ?? [])]
  const details = useQueries({
    queries: ids.map((id) => ({ queryKey: qk.nftDetail(id), queryFn: ({ signal }: { signal: AbortSignal }) => api.nfts.detail(id, signal) })),
  })
  useEffect(() => {
    document.title = 'Lista de interesse · Kurio'
  }, [])
  return (
    <section aria-labelledby="fav-title">
      <h2 id="fav-title" className="mb-6 text-base font-bold">
        Lista de interesse
      </h2>
      {favorites.isPending ? (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <NftCardSkeleton key={i} />
          ))}
        </div>
      ) : ids.length === 0 ? (
        <p className="text-sm text-muted" role="status">
          Você ainda não favoritou nenhum NFT.{' '}
          <Link to="/" hash="catalogo" className="text-accent-strong underline">
            Explorar
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 lg:grid-cols-3" data-testid="favorites-grid">
          {details.map((d, i) => (
            <li key={ids[i]}>{d.data ? <NftCard nft={d.data} /> : <NftCardSkeleton />}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- Orders ----------
export function OrdersPage() {
  const orders = useOrders()
  useEffect(() => {
    document.title = 'Atividade · Kurio'
  }, [])
  const label = { pending: 'Pendente', confirmed: 'Confirmado', declined: 'Recusado' } as const
  return (
    <section aria-labelledby="orders-title">
      <h2 id="orders-title" className="mb-6 text-base font-bold">
        Atividade
      </h2>
      {orders.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !orders.data?.length ? (
        <p className="text-sm text-muted">Nenhum pedido ainda.</p>
      ) : (
        <ul className="grid gap-3">
          {orders.data.map((o) => (
            <li key={o.id}>
              <Link to="/pedido/$orderId" params={{ orderId: o.id }} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface p-4 text-sm hover:bg-surface-2">
                <span>
                  {o.id} · {formatDate(o.createdAt)}
                </span>
                <span>{o.lines.length} item(ns)</span>
                <span className={cn('font-bold', o.status === 'confirmed' ? 'text-success' : o.status === 'declined' ? 'text-danger' : 'text-accent-strong')}>{label[o.status]}</span>
                <span className="font-bold text-accent-strong">{eth(o.totalEth)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
