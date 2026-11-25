import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CreateOrderRequest, Order } from '@/api/contracts'
import { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import { setOrderInCache } from '@/api/queries'

/**
 * A checkout attempt = one idempotency key bound to one request body.
 * It is persisted per user in sessionStorage so a refresh or a timeout never creates a second order:
 * resending the same body reuses the same key, and the API returns the order it already created.
 */
export interface CheckoutAttempt {
  key: string
  body: CreateOrderRequest
  orderId: string | null
  createdAt: string
}

const storageKey = (userId: string) => `checkout-attempt:${userId}`

export const attemptStore = {
  read(userId: string): CheckoutAttempt | null {
    try {
      const raw = sessionStorage.getItem(storageKey(userId))
      return raw ? (JSON.parse(raw) as CheckoutAttempt) : null
    } catch {
      return null
    }
  },
  write(userId: string, attempt: CheckoutAttempt) {
    try {
      sessionStorage.setItem(storageKey(userId), JSON.stringify(attempt))
    } catch {
      /* ignore */
    }
  },
  clear(userId: string) {
    try {
      sessionStorage.removeItem(storageKey(userId))
    } catch {
      /* ignore */
    }
  },
}

const sameBody = (a: CreateOrderRequest, b: CreateOrderRequest) => JSON.stringify(a) === JSON.stringify(b)
const MAX_ATTEMPTS = 3

export type SubmitResult = { ok: true; order: Order } | { ok: false; error: ApiError }

export function useSubmitOrder(userId: string) {
  const qc = useQueryClient()
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [retrying, setRetrying] = useState(0)

  const submit = useCallback(
    async (body: CreateOrderRequest): Promise<SubmitResult | null> => {
      // Repeated clicks while a request is running are ignored.
      if (inFlight.current) return null
      inFlight.current = true
      setPending(true)
      const previous = attemptStore.read(userId)
      const attempt: CheckoutAttempt =
        previous && !previous.orderId && sameBody(previous.body, body)
          ? previous
          : { key: crypto.randomUUID(), body, orderId: null, createdAt: new Date().toISOString() }
      attemptStore.write(userId, attempt)
      try {
        for (let i = 1; ; i++) {
          try {
            const order = await api.orders.create(attempt.body, attempt.key)
            attemptStore.write(userId, { ...attempt, orderId: order.id })
            setOrderInCache(qc, userId, order)
            return { ok: true, order }
          } catch (e) {
            const error = e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Erro inesperado.')
            // Transient failure: the order may or may not exist — retry with the SAME key.
            if (error.transient && i < MAX_ATTEMPTS) {
              setRetrying(i)
              await new Promise((r) => setTimeout(r, 400 * i))
              continue
            }
            // Business rejections end this attempt; a new body will get a new key.
            if (!error.transient) attemptStore.clear(userId)
            return { ok: false, error }
          }
        }
      } finally {
        inFlight.current = false
        setPending(false)
        setRetrying(0)
      }
    },
    [qc, userId],
  )

  return { submit, pending, retrying }
}
