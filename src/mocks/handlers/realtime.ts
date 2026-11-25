import { ws } from 'msw'
import { toSocketIo } from '@mswjs/socket.io-binding'
import * as db from '../db'
import { scenario } from '../scenarios'

/**
 * Socket.IO server simulated by MSW (WebSocket transport only).
 * The app uses the real `socket.io-client`; MSW intercepts the WebSocket and
 * @mswjs/socket.io-binding encodes/decodes the Engine.IO + Socket.IO packets.
 *
 * Limitations of the binding (documented in ARCHITECTURE.md):
 * - only the default namespace and the WebSocket transport (no long-polling);
 * - handshake auth payload is not exposed, so the client authenticates with a `session.join` event;
 * - the binding does not send Engine.IO heartbeats, so we send "2" (ping) ourselves.
 */
export const REALTIME_URL = 'wss://realtime.greenmint.test'

const realtime = ws.link(`${REALTIME_URL}/*`)

interface Peer {
  close: () => void
  userId: string | null
}
const peers = new Set<Peer>()
let blocked = false

export const realtimeControl = {
  /** Drops every open socket (the client will try to reconnect). */
  dropAll() {
    peers.forEach((p) => p.close())
  },
  /** While blocked, new connections are closed immediately (simulated outage). */
  setBlocked(value: boolean) {
    blocked = value
    if (value) this.dropAll()
  },
  isBlocked: () => blocked,
  connectedCount: () => peers.size,
}

export const realtimeHandlers = [
  realtime.addEventListener('connection', (connection) => {
    if (blocked || scenario.get().offline) {
      connection.client.close()
      return
    }
    const io = toSocketIo(connection)
    const peer: Peer = { userId: null, close: () => connection.client.close() }
    peers.add(peer)

    // Engine.IO heartbeat: the client closes the socket if no ping arrives within ~30s.
    const heartbeat = setInterval(() => connection.client.send('2'), 20_000)

    io.client.on('session.join', (_event, payload: { token?: string | null }) => {
      const result = db.sessionFromToken(payload?.token ?? null)
      peer.userId = result.status === 'ok' ? result.user.id : null
      io.client.emit('session.joined', { authenticated: peer.userId !== null })
    })
    io.client.on('session.leave', () => {
      peer.userId = null
    })

    const unsubscribe = db.onRealtime((event) => {
      // Private events only reach the socket authenticated as the owner.
      if (event.userId && event.userId !== peer.userId) return
      io.client.emit(event.type, event)
    })

    connection.client.addEventListener('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      peers.delete(peer)
    })
  }),
]
