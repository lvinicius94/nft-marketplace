/**
 * Accessible live-region announcer for mutations and realtime changes.
 * The <LiveAnnouncer /> component renders the region; this module pushes messages into it.
 */
type Politeness = 'polite' | 'assertive'
const listeners = new Set<(message: string, politeness: Politeness) => void>()

export function announce(message: string, politeness: Politeness = 'polite') {
  listeners.forEach((l) => l(message, politeness))
}

export function onAnnounce(listener: (message: string, politeness: Politeness) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
