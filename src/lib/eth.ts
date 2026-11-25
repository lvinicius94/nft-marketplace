/**
 * Precise ETH arithmetic over decimal strings.
 * Values travel as decimal strings ("1.25") and are converted to wei (bigint, 18 decimals)
 * for every calculation, so no floating point is ever involved.
 */
const DECIMALS = 18
const SCALE = 10n ** BigInt(DECIMALS)
const DECIMAL_RE = /^\d+(\.\d+)?$/

export type EthString = string

export function isEthString(value: string): boolean {
  return DECIMAL_RE.test(value) && (value.split('.')[1]?.length ?? 0) <= DECIMALS
}

export function toWei(value: EthString): bigint {
  if (!isEthString(value)) throw new Error(`Invalid ETH amount: ${value}`)
  const [int, frac = ''] = value.split('.')
  return BigInt(int) * SCALE + BigInt(frac.padEnd(DECIMALS, '0'))
}

export function fromWei(wei: bigint): EthString {
  const negative = wei < 0n
  const abs = negative ? -wei : wei
  const int = abs / SCALE
  const frac = (abs % SCALE).toString().padStart(DECIMALS, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`
}

export const addEth = (...values: EthString[]): EthString =>
  fromWei(values.reduce((sum, v) => sum + toWei(v), 0n))

export const subEth = (a: EthString, b: EthString): EthString => fromWei(toWei(a) - toWei(b))

export const mulEth = (value: EthString, quantity: number): EthString => {
  if (!Number.isInteger(quantity)) throw new Error('Quantity must be an integer')
  return fromWei(toWei(value) * BigInt(quantity))
}

/** Percentage given in basis points (1000 = 10%), rounded down to the wei. */
export const percentEth = (value: EthString, basisPoints: number): EthString =>
  fromWei((toWei(value) * BigInt(basisPoints)) / 10_000n)

export const compareEth = (a: EthString, b: EthString): number => {
  const d = toWei(a) - toWei(b)
  return d === 0n ? 0 : d > 0n ? 1 : -1
}

export const minEth = (a: EthString, b: EthString): EthString => (compareEth(a, b) <= 0 ? a : b)

/** Display helper: rounds half-up to `digits` decimals using bigint, never floats. */
export function formatEth(value: EthString, digits = 4): string {
  const wei = toWei(value)
  const unit = 10n ** BigInt(DECIMALS - digits)
  const rounded = ((wei + unit / 2n) / unit) * unit
  const str = fromWei(rounded)
  const [int, frac = ''] = str.split('.')
  const minFrac = frac.padEnd(2, '0')
  return `${int}.${minFrac} ETH`
}
