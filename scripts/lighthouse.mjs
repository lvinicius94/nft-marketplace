/**
 * Lighthouse audit: home and NFT detail, mobile + desktop, 3 runs each, median per category.
 * Usage: npm run build && npm run preview  (in another terminal)  &&  npm run lighthouse
 * Env: LH_URL (default http://localhost:4173), CHROME_PATH (optional).
 * Output: lighthouse/reports/*.html|json and lighthouse/summary.json + summary.md
 */
import fs from 'node:fs'
import path from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const BASE = process.env.LH_URL ?? 'http://localhost:4173'
const RUNS = Number(process.env.LH_RUNS ?? 3)
const PAGES = [
  { name: 'inicio', path: '/' },
  { name: 'detalhe', path: '/nft/nft-001' },
]
const PROFILES = {
  mobile: { formFactor: 'mobile', screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } },
  desktop: {
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
  },
}
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const OUT = path.resolve('lighthouse')
fs.mkdirSync(path.join(OUT, 'reports'), { recursive: true })

const median = (values) => {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })
const summary = { url: BASE, runs: RUNS, lighthouse: (await import('lighthouse/package.json', { with: { type: 'json' } })).default.version, node: process.version, date: new Date().toISOString(), results: [] }

for (const page of PAGES) {
  for (const [profile, settings] of Object.entries(PROFILES)) {
    const runs = []
    for (let i = 1; i <= RUNS; i++) {
      const result = await lighthouse(
        BASE + page.path,
        { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: CATEGORIES },
        { extends: 'lighthouse:default', settings },
      )
      const [html, json] = result.report
      const file = `${page.name}-${profile}-run${i}`
      fs.writeFileSync(path.join(OUT, 'reports', `${file}.html`), html)
      fs.writeFileSync(path.join(OUT, 'reports', `${file}.json`), json)
      const lhr = result.lhr
      runs.push({
        scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(lhr.categories[c].score * 100)])),
        LCP: lhr.audits['largest-contentful-paint'].numericValue,
        CLS: lhr.audits['cumulative-layout-shift'].numericValue,
        TBT: lhr.audits['total-blocking-time'].numericValue,
      })
      console.log(page.name, profile, `run ${i}`, runs.at(-1).scores)
    }
    summary.results.push({
      page: page.name,
      profile,
      median: Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => r.scores[c]))])),
      LCP_ms: Math.round(median(runs.map((r) => r.LCP))),
      CLS: Number(median(runs.map((r) => r.CLS)).toFixed(3)),
      TBT_ms: Math.round(median(runs.map((r) => r.TBT))),
      runs,
    })
  }
}
await chrome.kill()

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
const rows = summary.results.map((r) => `| ${r.page} | ${r.profile} | ${r.median.performance} | ${r.median.accessibility} | ${r.median['best-practices']} | ${r.median.seo} | ${r.LCP_ms} ms | ${r.CLS} | ${r.TBT_ms} ms |`)
fs.writeFileSync(
  path.join(OUT, 'summary.md'),
  `# Lighthouse (mediana de ${RUNS} execuções)\n\nLighthouse ${summary.lighthouse} · Node ${summary.node} · ${summary.date} · ${BASE}\n\n| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n`,
)
console.log(fs.readFileSync(path.join(OUT, 'summary.md'), 'utf8'))
