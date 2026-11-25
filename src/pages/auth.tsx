import { useEffect, useRef, useState } from 'react'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import { sessionStore, useSession } from '@/auth/session-store'
import { Field, PasswordInput } from '@/components/form-field'
import { comingSoon } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/primitives'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'
import { HomePage } from './home'

const loginRoute = getRouteApi('/entrar')
const registerRoute = getRouteApi('/cadastro')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function SocialButtons() {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 text-xs text-cream before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">Ou continue com</div>
      <Button type="button" variant="ghost" className="border border-line text-xs" onClick={comingSoon('O login com Google')}>
        <span aria-hidden="true" className="font-bold text-[#4285f4]">G</span> Continuar com Google
      </Button>
      <Button type="button" variant="ghost" className="border border-line text-xs" onClick={comingSoon('O login com Facebook')}>
        <span aria-hidden="true" className="font-bold text-[#1877f2]">f</span> Continuar com Facebook
      </Button>
    </div>
  )
}

/** Desktop: dialog over the home page (as in the layout). Mobile: full screen. */
function AuthShell({ mode, children, description }: { mode: 'login' | 'register'; description: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  const search = (mode === 'login' ? loginRoute : registerRoute).useSearch()
  return (
    <>
      <div aria-hidden="true" className="hidden md:block">
        <HomePage />
      </div>
      <Dialog open onOpenChange={(open) => !open && navigate({ to: '/' })}>
        <DialogContent
          className="p-0 max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:border-b-0 max-md:bg-ink"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            document.getElementById(mode === 'login' ? 'login-email' : 'register-username')?.focus()
          }}
        >
          <div className="grid gap-6 px-6 pb-8 pt-10 md:px-16">
            <p className="text-center text-3xl font-bold tracking-widest md:hidden">KURIO</p>
            <nav aria-label="Acesso" className="flex items-center justify-center gap-2 text-lg">
              <Link to="/entrar" search={search} className={cn(mode === 'login' ? 'text-accent-strong' : 'text-cream')} aria-current={mode === 'login' ? 'page' : undefined}>
                Entrar
              </Link>
              <span aria-hidden="true" className="h-5 w-px bg-accent" />
              <Link to="/cadastro" search={search} className={cn(mode === 'register' ? 'text-accent-strong' : 'text-cream')} aria-current={mode === 'register' ? 'page' : undefined}>
                Criar conta
              </Link>
            </nav>
            <DialogTitle className="sr-only">{mode === 'login' ? 'Entrar na Kurio' : 'Criar perfil de colecionador'}</DialogTitle>
            <DialogDescription className="text-center text-xs text-cream">{description}</DialogDescription>
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function useAfterAuth(redirect: string | undefined) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  return () => {
    // The server merged the visitor cart into the account; start a fresh guest cart.
    sessionStore.rotateGuestCart()
    qc.removeQueries({ queryKey: ['cart'] })
    if (redirect) navigate({ href: redirect, replace: true })
    else navigate({ to: '/', replace: true })
  }
}

export function LoginPage() {
  const { redirect } = loginRoute.useSearch()
  const { expired } = useSession()
  const done = useAfterAuth(redirect)
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()
  const passwordRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    document.title = 'Entrar · Kurio'
  }, [])

  const login = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (session) => {
      sessionStore.signIn(session)
      announce(`Bem-vindo, ${session.user.name}.`)
      toast.success(`Bem-vindo, ${session.user.name}!`)
      done()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setFormError(err.code === 'INVALID_CREDENTIALS' ? err.message : Object.keys(err.fields).length ? undefined : err.message)
      } else setFormError('Não foi possível entrar. Tente novamente.')
      passwordRef.current?.focus()
    },
  })

  return (
    <AuthShell mode="login" description="Entre para gerenciar sua carteira, coleção e perfil de criador.">
      {expired && (
        <p role="status" className="rounded border border-accent px-3 py-2 text-center text-xs">
          Sua sessão expirou. Entre novamente para continuar de onde parou.
        </p>
      )}
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const next: Record<string, string> = {}
          if (!EMAIL_RE.test(form.email)) next.email = 'Informe um e-mail válido.'
          if (!form.password) next.password = 'Informe a senha.'
          setErrors(next)
          setFormError(undefined)
          if (Object.keys(next).length) {
            document.getElementById(next.email ? 'login-email' : 'login-password')?.focus()
            return
          }
          login.mutate(form)
        }}
      >
        <Field id="login-email" label="E-mail" srLabel error={errors.email}>
          {(a11y) => <Input {...a11y} type="email" autoComplete="email" placeholder="contato@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field id="login-password" label="Senha" srLabel error={errors.password}>
          {(a11y) => <PasswordInput {...a11y} ref={passwordRef} autoComplete="current-password" placeholder="Senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <button type="button" className="justify-self-end text-sm text-accent-strong hover:underline" onClick={comingSoon('A recuperação de senha')}>
          Esqueceu a senha?
        </button>
        {formError && (
          <p role="alert" className="text-center text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <SocialButtons />
      <p className="text-center text-sm md:hidden">
        Novo na Kurio?{' '}
        <Link to="/cadastro" search={{ redirect }} className="text-accent-strong">
          Crie uma conta
        </Link>
      </p>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { redirect } = registerRoute.useSearch()
  const done = useAfterAuth(redirect)
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()
  useEffect(() => {
    document.title = 'Criar conta · Kurio'
  }, [])

  const register = useMutation({
    mutationFn: api.auth.register,
    onSuccess: (session) => {
      sessionStore.signIn(session)
      toast.success('Perfil criado! Bem-vindo à Kurio.')
      announce('Perfil criado com sucesso.')
      done()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setFormError(Object.keys(err.fields).length ? undefined : err.message)
        const first = Object.keys(err.fields)[0]
        if (first) document.getElementById(`register-${first}`)?.focus()
      } else setFormError('Não foi possível criar a conta.')
    },
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <AuthShell mode="register" description="Crie seu perfil de colecionador e conecte uma carteira quando quiser.">
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const next: Record<string, string> = {}
          if (!/^[a-z0-9_.]{3,20}$/i.test(form.username)) next.username = 'Use de 3 a 20 letras, números, ponto ou _.'
          if (!EMAIL_RE.test(form.email)) next.email = 'Informe um e-mail válido.'
          if (form.password.length < 8) next.password = 'A senha precisa ter pelo menos 8 caracteres.'
          else if (!/[A-Z]/.test(form.password) || !/\d/.test(form.password)) next.password = 'Use ao menos uma letra maiúscula e um número.'
          if (form.confirm !== form.password) next.confirm = 'As senhas não conferem.'
          setErrors(next)
          setFormError(undefined)
          const first = Object.keys(next)[0]
          if (first) return document.getElementById(`register-${first}`)?.focus()
          register.mutate({ username: form.username, email: form.email, password: form.password })
        }}
      >
        <Field id="register-username" label="Nome de usuário" srLabel error={errors.username}>
          {(a11y) => <Input {...a11y} autoComplete="username" placeholder="Nome de usuário" value={form.username} onChange={set('username')} />}
        </Field>
        <Field id="register-email" label="E-mail" srLabel error={errors.email}>
          {(a11y) => <Input {...a11y} type="email" autoComplete="email" placeholder="Digite seu e-mail" value={form.email} onChange={set('email')} />}
        </Field>
        <Field id="register-password" label="Senha" srLabel error={errors.password} hint="Mínimo de 8 caracteres, com uma maiúscula e um número.">
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" placeholder="Senha" value={form.password} onChange={set('password')} />}
        </Field>
        <Field id="register-confirm" label="Confirmar senha" srLabel error={errors.confirm}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" placeholder="Confirmar senha" value={form.confirm} onChange={set('confirm')} />}
        </Field>
        {formError && (
          <p role="alert" className="text-center text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={register.isPending}>
          {register.isPending ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <SocialButtons />
      <p className="text-center text-sm md:hidden">
        Já tem uma conta?{' '}
        <Link to="/entrar" search={{ redirect }} className="text-accent-strong">
          Entre
        </Link>
      </p>
    </AuthShell>
  )
}
