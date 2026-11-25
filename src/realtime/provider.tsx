import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/api/contracts'
import type { RealtimeClient, RealtimeStatus } from './socket'

const RealtimeContext = createContext<RealtimeClient | null>(null)

export function RealtimeProvider({ client, children }: { client: RealtimeClient; children: ReactNode }) {
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>
}

function useClient() {
  const client = useContext(RealtimeContext)
  if (!client) throw new Error('RealtimeProvider missing')
  return client
}

export function useRealtimeStatus(): RealtimeStatus {
  const client = useClient()
  const [status, setStatus] = useState(client.status)
  useEffect(() => client.onStatus(setStatus), [client])
  return status
}

/** Subscribes to applied (deduplicated, versioned) events; unsubscribes on unmount. */
export function useRealtimeEvent(handler: (event: NftUpdatedEvent | OrderUpdatedEvent) => void) {
  const client = useClient()
  useEffect(() => client.onEvent(handler), [client, handler])
}
