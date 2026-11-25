/**
 * Generates public/og-image.jpg (1200x630), the link preview used by WhatsApp, LinkedIn, X etc.
 * Rendered with Playwright from an HTML template that uses the site's font, colors and art.
 * Usage: node scripts/og-image.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const root = path.resolve('.')
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`
const font = dataUrl('node_modules/@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2', 'font/woff2')
const art = dataUrl('public/nfts/golden-snub-800.webp', 'image/webp')

const html = `<!doctype html><html><head><style>
@font-face { font-family: 'Roboto Mono'; src: url(${font}) format('woff2'); font-weight: 100 700; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #140d0a; font-family: 'Roboto Mono', monospace; color: #f5f1eb; overflow: hidden; }
.wrap { position: relative; display: grid; grid-template-columns: 1fr 470px; gap: 56px; align-items: center; height: 100%; padding: 64px 72px; }
.wrap::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 78% 50%, rgba(210,138,76,.28), transparent 55%); }
.brand { font-weight: 700; letter-spacing: .18em; font-size: 26px; }
.tag { display: inline-block; margin-top: 40px; padding: 6px 14px; border-radius: 8px; font-size: 20px; font-weight: 700; color: #140d0a; background: linear-gradient(90deg, #f3cf6e, #e39a3b); }
h1 { margin-top: 22px; font-size: 54px; line-height: 1.25; font-weight: 700; }
p { margin-top: 22px; font-size: 22px; line-height: 1.5; color: #cfb28c; }
p b { color: #e89b55; }
.cta { margin-top: 34px; display: inline-block; padding: 12px 26px; border-radius: 6px; background: #d28a4c; color: #140d0a; font-weight: 700; font-size: 22px; }
.art { position: relative; width: 470px; height: 470px; border-radius: 28px; overflow: hidden; box-shadow: 0 0 60px -10px rgba(232,184,74,.55); }
.art img { width: 100%; height: 100%; object-fit: cover; }
.badge { position: absolute; left: 18px; top: 18px; padding: 4px 12px; border-radius: 8px; font-size: 18px; font-weight: 700; color: #140d0a; background: linear-gradient(90deg, #f3cf6e, #e39a3b); }
</style></head><body><div class="wrap">
  <div style="position:relative">
    <div class="brand">KURIO</div>
    <div class="tag">BLACK FRIDAY · 15% OFF</div>
    <h1>Marketplace<br/>de NFTs</h1>
    <p>Arte digital selecionada. Cupom <b>LucasCamargo</b> na sua primeira NFT.</p>
    <div class="cta">Golden Snub #001 · 0.99 ETH</div>
  </div>
  <div class="art"><img src="${art}" alt=""/><span class="badge">LENDÁRIO</span></div>
</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
const out = path.join(root, 'public', 'og-image.jpg')
await page.screenshot({ path: out, type: 'jpeg', quality: 85 })
await browser.close()
console.log(out, Math.round(fs.statSync(out).size / 1024), 'KB')
