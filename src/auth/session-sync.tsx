import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { announce } from '@/lib/announcer'
import type { createAppRouter } from '@/router'
import { sessionStore, useSession } from './session-store'

const PRIVATE_PREFIXES = ['/pagamento', '/pedido', '/perfil']

/**
 * Keeps the cache and navigation consistent with the session:
 * - validates a persisted session on startup;
 * - on logout / user switch, drops every private query of the previous user;
 * - on expiry inside a private screen, sends the user to login and back afterwards.
 */
export function SessionSync({ router }: { router: ReturnType<typeof createAppRouter> }) {
  const qc = useQueryClient()
  const session = useSession()
  const previousUser = useRef<string | null>(session.user?.id ?? null)

  // Validate the stored token once (an expired token triggers signOut('expired') in the Axios interceptor).
  useEffect(() => {
    if (sessionStore.get().token) api.auth.session().catch(() => undefined)
  }, [])

  useEffect(() => {
    const current = session.user?.id ?? null
    if (previousUser.current !== current) {
      if (previousUser.current) {
        qc.removeQueries({ queryKey: ['user', previousUser.current] })
        qc.removeQueries({ queryKey: ['cart', `user:${previousUser.current}`] })
      }
      // Guest cart key changes too; refetch the visible cart for the new identity.
      qc.invalidateQueries({ queryKey: ['cart'] })
      previousUser.current = current
    }
  }, [session.user?.id, qc])

  useEffect(() => {
    if (!session.expired) return
    const { pathname, href } = router.state.location
    toast.warning('Sua sessão expirou. Entre novamente para continuar.')
    announce('Sua sessão expirou. Entre novamente para continuar.', 'assertive')
    if (PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) {
      router.navigate({ to: '/entrar', search: { redirect: href } })
    }
  }, [session.expired, router])

  return null
}
