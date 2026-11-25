import { setupWorker } from 'msw/browser'
import * as db from './db'
import { restHandlers } from './handlers/rest'
import { realtimeControl, realtimeHandlers } from './handlers/realtime'
import { SCENARIOS, scenario, type ScenarioName } from './scenarios'

export const worker = setupWorker(...restHandlers, ...realtimeHandlers)

/**
 * Control surface of the mock server. It changes the *server* state (which then flows to the
 * app through REST and Socket.IO); it never touches React state or the Query cache directly.
 * Exposed on window for Playwright and for the in-app mock panel.
 */
export const mockControl = {
  scenarios: SCENARIOS,
  getScenario: () => scenario.get().name,
  setScenario: (name: ScenarioName) => scenario.set(name),
  reset() {
    db.removeAllMockTimers()
    db.db.reset()
  },
  expireSessions: () => db.expireAllSessions(),
  updateEdition: db.updateEdition,
  replayLastEvent: db.replayLastEvent,
  emitStaleNftEvent: db.emitStaleNftEvent,
  dropSockets: () => realtimeControl.dropAll(),
  setRealtimeBlocked: (v: boolean) => realtimeControl.setBlocked(v),
  realtimeConnections: () => realtimeControl.connectedCount(),
  snapshot: () => db.db.snapshot(),
}

export type MockControl = typeof mockControl

declare global {
  interface Window {
    __mocks?: MockControl
  }
}

export async function startMocks() {
  window.__mocks = mockControl
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  db.resumePendingOrders()
}
