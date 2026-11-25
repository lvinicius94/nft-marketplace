import { io, type Socket } from 'socket.io-client'
import type { QueryClient } from '@tanstack/react-query'
import type { Cart, NftDetail, NftListResponse, NftUpdatedEvent, Order, OrderUpdatedEvent } from '@/api/contracts'
import { qk } from '@/api/queries'
import { sessionStore } from '@/auth/session-store'
import { announce } from '@/lib/announcer'

export const REALTIME_URL = import.meta.env.VITE_REALTIME_URL ?? 'wss://realtime.greenmint.test'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Socket.IO client: one connection per app, re-authenticated on every session change.
 * Events are applied to the Query cache only if their version is newer than what we have,
 * and each eventId is applied once (duplicates and stale events are dropped).
 */
export class RealtimeClient {
  private socket: Socket | null = null
  private seenEvents = new Set<string>()
  private versions = new Map<string, number>()
  private statusListeners = new Set<(s: RealtimeStatus) => void>()
  private eventListeners = new Set<(e: NftUpdatedEvent | OrderUpdatedEvent) => void>()
  private unsubscribeSession: (() => void) | null = null
  private currentUserId: string | null = null
  status: RealtimeStatus = 'disconnected'
  private qc: QueryClient

  constructor(qc: QueryClient) {
    this.qc = qc
  }

  start() {
    if (this.socket) return
    const socket = io(REALTIME_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    })
    this.socket = socket
    this.setStatus('connecting')

    socket.on('connect', () => {
      this.setStatus('connected')
      this.join()
      this.reconcile()
    })
    socket.on('disconnect', () => this.setStatus('disconnected'))
    socket.io.on('reconnect_attempt', () => this.setStatus('connecting'))
    socket.on('nft.updated', (event: NftUpdatedEvent) => this.handleNft(event))
    socket.on('order.updated', (event: OrderUpdatedEvent) => this.handleOrder(event))

    this.currentUserId = sessionStore.get().user?.id ?? null
    this.unsubscribeSession = sessionStore.subscribe(() => {
      const userId = sessionStore.get().user?.id ?? null
      if (userId === this.currentUserId) return
      this.currentUserId = userId
      // New identity: forget private versions and re-join so the server scopes private events.
      this.seenEvents.clear()
      this.socket?.emit('session.leave')
      this.join()
    })
  }

  stop() {
    this.unsubscribeSession?.()
    this.socket?.removeAllListeners()
    this.socket?.io.removeAllListeners()
    this.socket?.disconnect()
    this.socket = null
    this.setStatus('disconnected')
  }

  onStatus(listener: (s: RealtimeStatus) => void) {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onEvent(listener: (e: NftUpdatedEvent | OrderUpdatedEvent) => void) {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  private setStatus(status: RealtimeStatus) {
    this.status = status
    this.statusListeners.forEach((l) => l(status))
  }

  private join() {
    if (this.socket?.connected) this.socket.emit('session.join', { token: sessionStore.get().token })
  }

  /** After (re)connecting, events may have been missed: refetch every active resource via REST. */
  private reconcile() {
    this.qc.invalidateQueries({ queryKey: qk.nfts, refetchType: 'active' })
    this.qc.invalidateQueries({ queryKey: ['cart'], refetchType: 'active' })
    this.qc.invalidateQueries({ queryKey: ['user'], refetchType: 'active' })
  }

  /** Returns true if the event is new and newer than the last applied version of its resource. */
  private accept(event: NftUpdatedEvent | OrderUpdatedEvent) {
    if (this.seenEvents.has(event.eventId)) return false
    this.seenEvents.add(event.eventId)
    const key = `${event.type}:${event.resourceId}`
    const known = this.versions.get(key) ?? 0
    if (event.version <= known) return false
    this.versions.set(key, event.version)
    return true
  }

  private handleNft(event: NftUpdatedEvent) {
    if (!this.accept(event)) return
    const { nftId, priceEth, available, editions } = event.payload
    const version = event.version

    // Detail: replace editions only if our cached copy is older.
    this.qc.setQueryData<NftDetail>(qk.nftDetail(nftId), (old) =>
      old && old.version < version ? { ...old, priceEth, available, editions, version } : old,
    )
    // Every cached catalog page that contains the NFT.
    this.qc.setQueriesData<NftListResponse>({ queryKey: ['nfts', 'list'] }, (old) =>
      old
        ? { ...old, items: old.items.map((n) => (n.id === nftId && n.version < version ? { ...n, priceEth, available, version } : n)) }
        : old,
    )
    // Cart lines: price/stock come from the server; refetch so totals stay coherent with the API.
    const carts = this.qc.getQueriesData<Cart>({ queryKey: ['cart'] })
    const inCart = carts.some(([, cart]) => cart?.items.some((i) => i.nftId === nftId))
    if (inCart) {
      this.qc.invalidateQueries({ queryKey: ['cart'] })
      announce('Preço ou disponibilidade de um item do seu carrinho mudou.')
    }
    this.eventListeners.forEach((l) => l(event))
  }

  private handleOrder(event: OrderUpdatedEvent) {
    const userId = sessionStore.get().user?.id
    // Never apply private events that don't belong to the current user.
    if (!userId || event.userId !== userId) return
    if (!this.accept(event)) return
    const order: Order = event.payload.order
    this.qc.setQueryData<Order>(qk.order(userId, order.id), (old) => (!old || old.version < order.version ? order : old))
    this.qc.invalidateQueries({ queryKey: qk.orders(userId) })
    if (order.status === 'confirmed') this.qc.invalidateQueries({ queryKey: ['cart'] })
    this.eventListeners.forEach((l) => l(event))
  }
}
