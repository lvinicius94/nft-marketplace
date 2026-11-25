import type { NftRarity } from '@/api/contracts'

/**
 * Visual identity per rarity tier (beyond the layout): each tier tints the art frame and
 * gets a colored badge. The badge text keeps the tier readable without relying on color.
 */
export const TIER: Record<NftRarity, { label: string; frame: string; badge: string | null }> = {
  comum: { label: 'Comum', frame: 'bg-surface', badge: null },
  raro: {
    label: 'Raro',
    frame: 'bg-gradient-to-b from-[#24605a] via-[#1a3b38] to-surface',
    badge: 'bg-[#6cc5b8] text-ink',
  },
  epico: {
    label: 'Épico',
    frame: 'bg-gradient-to-b from-[#5a3477] via-[#35223f] to-surface',
    badge: 'bg-[#c39be8] text-ink',
  },
  lendario: {
    label: 'Lendário',
    frame: 'bg-gradient-to-b from-[#6b4a14] via-[#3a2510] to-surface shadow-[0_0_18px_-4px_rgba(232,184,74,0.55)]',
    badge: 'bg-gradient-to-r from-[#f3cf6e] to-[#e39a3b] text-ink',
  },
}
