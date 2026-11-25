import type { Network, NftCategory, WalletProvider } from '@/api/contracts'
import { formatEth as fmt } from './eth'

/** Displays ETH with 2–4 decimals, as in the layout ("1.19 ETH", "26.846 ETH"). */
export const eth = (value: string) => fmt(value, 4).replace(/(\.\d\d\d?)0+ ETH$/, '$1 ETH')

export const CATEGORY_LABEL: Record<NftCategory, string> = {
  'arte-digital': 'Arte digital',
  fotografia: 'Fotografia',
  musica: 'Música',
  'arte-3d': 'Arte 3D',
  colecionaveis: 'Colecionáveis',
  generativa: 'Generativa',
  jogos: 'Jogos',
  assinaturas: 'Assinaturas',
  utilidade: 'Utilidade',
}

export const NETWORK_LABEL: Record<Network, string> = { ethereum: 'Ethereum', polygon: 'Polygon', solana: 'Solana' }
export const PROVIDER_LABEL: Record<WalletProvider, string> = { metamask: 'MetaMask', walletconnect: 'WalletConnect', coinbase: 'Coinbase Wallet' }
export const EXPLORER_LABEL: Record<Network, string> = { ethereum: 'Etherscan', polygon: 'Polygonscan', solana: 'Solana Explorer' }

export const shortHash = (value: string) => (value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value)

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
/** "29 Jul, 2026" as in the layout. */
export const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`
}
