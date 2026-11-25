import { useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Heart, Home, LogIn, Search, ShoppingCart, User, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '@/api/queries'
import { useSession } from '@/auth/session-store'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './ui/primitives'

export const comingSoon = (what: string) => () =>
  toast.info(`${what} não faz parte desta demonstração.`, { description: 'Esta área está fora do escopo do desafio.' })

function CartBadge() {
  const cart = useCart()
  const count = cart.data?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
  return (
    <Link to="/carrinho" className="relative rounded p-1.5 hover:bg-surface" aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}>
      <ShoppingCart className="size-6" aria-hidden="true" />
      {count > 0 && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-ink">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className="rounded p-1.5 hover:bg-surface" aria-label="Buscar">
          <Search className="size-6" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="p-6">
        <DialogTitle className="mb-4">Buscar NFTs</DialogTitle>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            onOpenChange(false)
            navigate({ to: '/', search: (prev) => ({ ...prev, q: value.trim() || undefined, page: undefined }), hash: 'catalogo' })
          }}
          className="flex gap-2"
        >
          <label htmlFor="global-search" className="sr-only">
            Nome, coleção ou criador
          </label>
          <Input id="global-search" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nome, coleção ou criador" />
          <Button type="submit">Buscar</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Header() {
  const { user } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [searchOpen, setSearchOpen] = useState(false)
  const marketActive = pathname.startsWith('/nft') || pathname.startsWith('/carrinho') || pathname.startsWith('/pagamento') || pathname.startsWith('/pedido')
  const homeActive = !marketActive && !pathname.startsWith('/perfil')

  const navItem = (active: boolean) =>
    cn('relative py-5 text-sm md:text-base', active ? 'font-semibold text-accent-strong after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent-strong' : 'text-cream hover:text-accent-strong')

  return (
    <header className="hidden md:block">
      <div className="container-page flex items-center justify-between border-b border-line">
        <Link to="/" className="py-5 text-sm font-bold tracking-wider" aria-label="Kurio, página inicial">
          KURIO
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-8 lg:gap-10">
          <Link to="/" className={navItem(homeActive)} aria-current={homeActive ? 'page' : undefined}>
            Início
          </Link>
          <Link to="/" search={{ tab: 'all' }} hash="catalogo" className={navItem(marketActive)} aria-current={marketActive ? 'page' : undefined}>
            Mercado
          </Link>
          <button type="button" className={navItem(false)} onClick={comingSoon('Criadores')}>
            Criadores
          </button>
          <button type="button" className={navItem(false)} onClick={comingSoon('Aprenda')}>
            Aprenda
          </button>
        </nav>
        <div className="flex items-center gap-4">
          <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
          <CartBadge />
          {user ? (
            <Link to="/perfil" className="flex items-center gap-2 rounded-[4px] bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-accent-strong">
              <User className="size-4" aria-hidden="true" />
              <span className="max-w-28 truncate">{user.username}</span>
            </Link>
          ) : (
            <Link to="/entrar" search={{ redirect: undefined }} className="flex items-center gap-1.5 rounded-[4px] bg-accent px-3 py-1.5 text-base font-semibold text-ink hover:bg-accent-strong">
              <LogIn className="size-5" aria-hidden="true" />
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

/** Bottom navigation from the mobile frames. */
export function MobileNav() {
  const { user } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const cart = useCart()
  const count = cart.data?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
  const item = (active: boolean) => cn('grid size-12 place-items-center rounded-full', active ? 'text-accent-strong' : 'text-cream')
  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="relative mx-auto flex max-w-md items-center justify-between px-6 py-1.5">
        <Link to="/" className={item(pathname === '/')} aria-label="Início" aria-current={pathname === '/' ? 'page' : undefined}>
          <Home className="size-6" aria-hidden="true" />
        </Link>
        <Link to={user ? '/perfil/favoritos' : '/entrar'} className={item(pathname === '/perfil/favoritos')} aria-label="Favoritos">
          <Heart className="size-6" aria-hidden="true" />
        </Link>
        <Link
          to="/"
          search={{ tab: 'all' }}
          hash="catalogo"
          aria-label="Explorar mercado"
          className="-mt-8 grid size-14 place-items-center rounded-full border-4 border-ink bg-accent text-ink shadow-lg"
        >
          <ScanLine className="size-6" aria-hidden="true" />
        </Link>
        <Link to="/carrinho" className={cn(item(pathname === '/carrinho'), 'relative')} aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}>
          <ShoppingCart className="size-6" aria-hidden="true" />
          {count > 0 && <span aria-hidden="true" className="absolute right-1 top-1 rounded-full bg-accent px-1 text-[10px] font-bold text-ink">{count}</span>}
        </Link>
        <Link to={user ? '/perfil' : '/entrar'} className={item(pathname.startsWith('/perfil'))} aria-label={user ? 'Meu perfil' : 'Entrar'}>
          <User className="size-6" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  )
}

export function Footer() {
  const social = ['Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube']
  const features = [
    { letter: 'W', title: 'Segurança da carteira', text: 'Proteja sua carteira e colecione arte digital verificada com confiança.' },
    { letter: 'C', title: 'Criadores em destaque', text: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.' },
    { letter: 'D', title: 'Alertas de lançamentos', text: 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.' },
  ]
  const columns: [string, string[]][] = [
    ['Meu perfil', ['Meu perfil', 'Minha coleção', 'Atividade', 'Estúdio do criador', 'Lista de interesse']],
    ['Central de ajuda', ['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item']],
    ['Coleções', ['Arte digital', 'Fotografia', 'Música', 'Arte 3D', 'Utilidade']],
  ]
  return (
    <footer className="container-page mb-24 mt-24 md:mb-6">
      <section aria-label="Destaques" className="grid gap-8 bg-surface px-6 py-8 md:grid-cols-[1fr_1fr_1fr_1.3fr] md:px-12">
        {features.map((f) => (
          <div key={f.letter} className="md:border-r md:border-accent md:pr-6">
            <div aria-hidden="true" className="mb-4 grid size-[74px] place-items-center rounded-full bg-accent text-2xl font-bold text-ink">
              {f.letter}
            </div>
            <h2 className="mb-2 text-base font-bold md:text-lg">{f.title}</h2>
            <p className="text-sm leading-6 text-muted">{f.text}</p>
          </div>
        ))}
        <form
          className="grid content-start gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            comingSoon('A newsletter')()
          }}
        >
          <h2 className="text-base font-bold leading-4 md:text-lg md:leading-4">Antecipe-se ao próximo lançamento</h2>
          <div className="flex">
            <label htmlFor="newsletter" className="sr-only">
              Endereço para a newsletter
            </label>
            <input id="newsletter" type="email" placeholder="digite seu e-mail..." className="h-10 min-w-0 flex-1 rounded-l-[4px] bg-surface-2 px-3 text-sm placeholder:text-muted focus-visible:outline-accent-strong" />
            <button type="submit" className="rounded-r-[4px] bg-accent px-4 text-base font-bold text-ink hover:bg-accent-strong">
              Enviar
            </button>
          </div>
          <p className="text-xs leading-5 text-muted">Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
        </form>
      </section>
      <div className="grid gap-3 bg-surface-2 px-6 py-6 text-sm md:grid-cols-4 md:items-center md:px-8">
        <span className="font-bold tracking-wider">KURIO</span>
        <span>Feito para colecionadores, criadores e cultura</span>
        <a href="mailto:contato@email.com" className="hover:text-accent-strong">contato@email.com</a>
        <a href="tel:+551140028922" className="hover:text-accent-strong">+55 11 4002 8922</a>
      </div>
      <div className="grid gap-8 bg-surface px-6 py-8 sm:grid-cols-2 md:grid-cols-4 md:px-8">
        {columns.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="mb-3 text-lg font-bold">{title}</h2>
            <ul className="grid gap-2 text-sm">
              {links.map((l) => (
                <li key={l}>
                  <button type="button" className="hover:text-accent-strong" onClick={comingSoon(l)}>
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <h2 className="mb-3 text-lg font-bold">Redes sociais</h2>
          <ul className="mb-6 flex gap-2">
            {social.map((s) => (
              <li key={s}>
                <a href="#" onClick={(e) => (e.preventDefault(), comingSoon(s)())} aria-label={`${s} (indisponível na demonstração)`} className="grid size-8 place-items-center rounded border border-accent text-xs text-accent-strong">
                  {s[0]}
                </a>
              </li>
            ))}
          </ul>
          <h2 className="mb-3 text-lg font-bold">Carteiras compatíveis</h2>
          <p className="inline-block rounded border border-line bg-surface-2 px-2 py-1 text-[10px] font-bold text-accent-strong">METAMASK · WALLETCONNECT · COINBASE</p>
        </div>
      </div>
      <p className="py-4 text-center text-xs text-muted">
        © 2026 Kurio. Projeto de demonstração com dados simulados. Made by{' '}
        <a href="https://github.com/lvinicius94" target="_blank" rel="noreferrer" className="font-semibold text-accent-strong hover:underline">
          Lucas Camargo
          <span className="sr-only"> (GitHub, abre em nova aba)</span>
        </a>
      </p>
    </footer>
  )
}
