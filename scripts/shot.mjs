// Utilidad de desarrollo: captura pantallas de la app en Chromium. Uso: node scripts/shot.mjs ruta [ancho] [alto] [salida]
import { chromium } from '@playwright/test'
const [route = '/', w = '1440', h = '900', out = `/tmp/shot.png`] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
await page.goto(`http://127.0.0.1:1420/#${route}`)
await page.waitForTimeout(1500)
await page.screenshot({ path: out, fullPage: false })
const full = process.env.FULL
if (full) await page.screenshot({ path: out.replace('.png', '-full.png'), fullPage: true })
console.log(errors.join('\n') || 'sin errores de consola')
await browser.close()
