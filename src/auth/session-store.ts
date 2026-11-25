import { useSyncExternalStore } from 'react'
import type { Session, User } from '@/api/contracts'

/**
 * Client-side session: token + user, persisted so a refresh keeps the user signed in.
 * Passwords are never stored. The guest cart id identifies the visitor's cart before login.
 */
export interface SessionState {
  token: string | null
  user: User | null
  expiresAt: string | null
  /** Set when the API reports an expired/invalid session, so the UI can ask for login again. */
  expired: boolean
}

const SESSION_KEY = 'nft-session'
const GUEST_CART_KEY = 'nft-guest-cart-id'

function read(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return { ...(JSON.parse(raw) as SessionState), expired: false }
  } catch {
    /* ignore */
  }
  return { token: null, user: null, expiresAt: null, expired: false }
}

let state = read()
const listeners = new Set<() => void>()

function set(next: SessionState) {
  state = next
  try {
    if (next.token) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...next, expired: false }))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export const sessionStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  signIn(session: Session) {
    set({ token: session.token, user: session.user, expiresAt: session.expiresAt, expired: false })
  },
  updateUser(user: User) {
    if (state.token) set({ ...state, user })
  },
  /** Clears the session. `expired` keeps a flag so the login screen can explain why. */
  signOut(reason: 'logout' | 'expired' = 'logout') {
    set({ token: null, user: null, expiresAt: null, expired: reason === 'expired' })
  },
  guestCartId(): string {
    try {
      let id = localStorage.getItem(GUEST_CART_KEY)
      if (!id) {
        id = `guest-${crypto.randomUUID()}`
        localStorage.setItem(GUEST_CART_KEY, id)
      }
      return id
    } catch {
      return 'guest-ephemeral'
    }
  },
  /** After the guest cart is merged into the user's cart, the visitor starts a new empty cart. */
  rotateGuestCart() {
    try {
      localStorage.setItem(GUEST_CART_KEY, `guest-${crypto.randomUUID()}`)
    } catch {
      /* ignore */
    }
  },
}

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get)
}
