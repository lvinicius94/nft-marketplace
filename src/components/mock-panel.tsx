import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useCart } from '@/api/queries'
import type { ScenarioName } from '@/mocks/scenarios'
import { addEth } from '@/lib/eth'
import { Button } from './ui/button'
import { NativeSelect } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/primitives'

/**
 * Demo/test control panel for the *mock server* (MSW). Every action changes server-side
 * mock state; the app only learns about it through REST responses and Socket.IO events.
 * Rendered only when mocks are enabled.
 */
export function MockPanel() {
  const [open, setOpen] = useState(false)
  const mocks = typeof window !== 'undefined' ? window.__mocks : undefined
  const [scenario, setScenario] = useState<string>(() => mocks?.getScenario() ?? 'default')
  const cart = useCart()
  const qc = useQueryClient()
  if (!mocks) return null
  const first = cart.data?.items[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-3 z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs text-muted shadow-lg hover:text-cream md:bottom-4"
        aria-label="Abrir painel de cenários simulados"
      >
        <FlaskConical className="size-4" aria-hidden="true" /> Mocks
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid max-w-md gap-4 p-6">
          <DialogTitle>Cenários simulados (MSW)</DialogTitle>
          <DialogDescription>Altera o servidor simulado. A interface recebe as mudanças pela API REST e pelo Socket.IO.</DialogDescription>
          <div className="grid gap-2">
            <label htmlFor="mock-scenario" className="text-sm">
              Cenário de rede e negócio
            </label>
            <NativeSelect
              id="mock-scenario"
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value)
                mocks.setScenario(e.target.value as ScenarioName)
                qc.invalidateQueries()
              }}
            >
              {Object.entries(mocks.scenarios).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-wrap gap-2 sm:grid sm:grid-cols-2 [&>button]:grow [&>button]:basis-auto sm:[&>button]:basis-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                mocks.reset()
                localStorage.removeItem('nft-session')
                localStorage.removeItem('nft-guest-cart-id')
                sessionStorage.clear()
                location.assign('/')
              }}
            >
              Resetar dados
            </Button>
            <Button variant="outline" size="sm" onClick={() => mocks.expireSessions()}>
              Expirar sessões
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!first}
              onClick={() => first && mocks.updateEdition(first.nftId, first.editionId, { priceEth: addEth(first.unitPriceEth, '0.1') })}
            >
              Subir preço (carrinho)
            </Button>
            <Button variant="outline" size="sm" disabled={!first} onClick={() => first && mocks.updateEdition(first.nftId, first.editionId, { available: 0 })}>
              Esgotar edição (carrinho)
            </Button>
            <Button variant="outline" size="sm" onClick={() => mocks.replayLastEvent()}>
              Reenviar último evento
            </Button>
            <Button variant="outline" size="sm" disabled={!first} onClick={() => first && mocks.emitStaleNftEvent(first.nftId)}>
              Enviar evento antigo
            </Button>
            <Button variant="outline" size="sm" onClick={() => mocks.dropSockets()}>
              Derrubar socket
            </Button>
            <Button variant="outline" size="sm" onClick={() => mocks.setRealtimeBlocked(!mocks.realtimeConnections() ? false : true)}>
              Alternar queda do realtime
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
