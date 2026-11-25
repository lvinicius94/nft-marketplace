import type { NftRarity } from '@/api/contracts'

/**
 * Rarity tiers (beyond the layout): a rounded gradient badge per tier. The badge text keeps
 * the tier readable without relying on color. "Comum" has no badge, as in the layout.
 */
export const TIER: Record<NftRarity, { label: string; badge: string | null }> = {
  comum: { label: 'Comum', badge: null },
  raro: { label: 'Raro', badge: 'bg-gradient-to-r from-[#8fe0d3] to-[#3e9e92] text-ink' },
  epico: { label: 'Épico', badge: 'bg-gradient-to-r from-[#dcbcf7] to-[#9d6bd1] text-ink' },
  lendario: { label: 'Lendário', badge: 'bg-gradient-to-r from-[#f3cf6e] to-[#e39a3b] text-ink' },
}
