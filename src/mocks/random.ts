/** Small seeded PRNG so every mock scenario is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let counter = 0
/** Deterministic-enough ids for mock resources (prefix + time + counter). */
export function mockId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}

export function fakeHex(length: number, seed: string): string {
  // FNV-1a over the whole seed, once per 8-hex block (block index mixed in).
  let out = ''
  for (let block = 0; out.length < length; block++) {
    let h = (2166136261 ^ block) >>> 0
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, length)
}
