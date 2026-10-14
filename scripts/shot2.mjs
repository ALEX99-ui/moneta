// Capturas con interacción para revisión visual de desarrollo.
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
const go = async (hash) => { await page.goto(`http://127.0.0.1:1420/#${hash}`); await page.waitForSelector('aside'); await page.waitForTimeout(900) }
await go('/ingresos'); await page.getByRole('tab', { name: 'Por fuente' }).click(); await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/x-ingresos.png' })
await go('/cuentas'); await page.screenshot({ path: '/tmp/x-cuentas.png' })
await go('/configuracion'); await page.getByRole('tab', { name: 'Categorías' }).click(); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/x-cat.png' })
await page.getByRole('tab', { name: 'Datos y respaldos' }).click(); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/x-datos.png' })
await go('/'); await page.keyboard.press('Control+n'); await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/x-quick.png' })
await page.keyboard.press('Escape'); await page.keyboard.press('Control+k'); await page.keyboard.type('almuerzo'); await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/x-search.png' })
await page.keyboard.press('Escape')
await page.getByRole('button', { name: /Modo claro/ }).click(); await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/x-light.png' })
await page.setViewportSize({ width: 980, height: 700 }); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/x-narrow.png' })
console.log(errs.join('\n') || 'sin errores')
await browser.close()
