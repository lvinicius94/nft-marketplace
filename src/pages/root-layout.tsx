import { Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Footer, Header, MobileNav } from '@/components/layout'
import { LiveAnnouncer } from '@/components/live-announcer'
import { MockPanel } from '@/components/mock-panel'
import { useRealtimeStatus } from '@/realtime/provider'

function ConnectionBanner() {
  const status = useRealtimeStatus()
  if (status === 'connected') return null
  return (
    <div role="status" className="bg-surface-2 px-4 py-1.5 text-center text-xs text-muted">
      {status === 'connecting' ? 'Reconectando às atualizações em tempo real…' : 'Atualizações em tempo real indisponíveis. Os dados serão sincronizados ao reconectar.'}
    </div>
  )
}

export function RootLayout() {
  return (
    <>
      <a href="#conteudo" className="sr-only z-50 bg-accent px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Pular para o conteúdo
      </a>
      <ConnectionBanner />
      <Header />
      <main id="conteudo" tabIndex={-1} className="min-h-[100dvh] focus:outline-none">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <LiveAnnouncer />
      <Toaster theme="dark" position="top-center" toastOptions={{ className: 'font-mono' }} />
      <MockPanel />
    </>
  )
}
