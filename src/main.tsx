import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import '@/styles.css'
import { createQueryClient } from '@/api/queries'
import { createAppRouter } from '@/router'
import { RealtimeProvider } from '@/realtime/provider'
import { SessionSync } from '@/auth/session-sync'

/** Mocks are enabled by configuration (VITE_ENABLE_MOCKS), including in the demo build. */
async function enableMocks() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  const { startMocks } = await import('@/mocks/browser')
  await startMocks()
}

enableMocks().then(async () => {
  // engine.io-client captures globalThis.WebSocket when its module is evaluated, so the
  // Socket.IO client must be loaded only after MSW has patched WebSocket.
  const { RealtimeClient } = await import('@/realtime/socket')
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient)
  const realtime = new RealtimeClient(queryClient)
  realtime.start()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider client={realtime}>
          <SessionSync router={router} />
          <RouterProvider router={router} />
        </RealtimeProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
})
