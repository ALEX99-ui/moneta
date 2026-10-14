import { expect, test, type Page } from '@playwright/test'

/** Recorre todas las pantallas y filtros buscando errores de ejecución y desbordes horizontales. */
const ROUTES = ['/', '/gastos', '/ingresos', '/cuentas', '/presupuestos', '/metas', '/suscripciones', '/calendario', '/reportes', '/insights', '/buscar?q=a', '/configuracion']

function watch(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  return errors
}

for (const width of [1440, 960]) {
  test(`todas las pantallas cargan sin errores ni desborde horizontal (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const errors = watch(page)
    for (const r of ROUTES) {
      await page.goto(`/#${r}`)
      await page.waitForSelector('aside h1, main h1')
      await page.waitForTimeout(250)
      const overflow = await page.evaluate(() => {
        const main = document.getElementById('main-scroll')!
        return main.scrollWidth - main.clientWidth
      })
      expect(overflow, `desborde horizontal en ${r}`).toBeLessThanOrEqual(1)
    }
    expect(errors).toEqual([])
  })
}

test('filtros del panel: mes, año, rango y todo', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/#/')
  await page.waitForSelector('aside')
  for (const m of ['Año', 'Rango', 'Todo', 'Mes']) {
    await page.getByRole('button', { name: m, exact: true }).first().click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Balance total disponible')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  expect(errors).toEqual([])
})

test('reportes y configuración: todas las pestañas', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/#/reportes')
  await page.waitForSelector('aside')
  for (const t of ['Informe anual', 'Gastos por categoría', 'Comparación de períodos', 'Tendencias y ahorro', 'Flujo de efectivo', 'Informe mensual']) {
    await page.getByRole('tab', { name: t }).click()
    await page.waitForTimeout(300)
  }
  await page.goto('/#/configuracion')
  for (const t of ['Categorías', 'Cuentas', 'Datos y respaldos', 'Atajos', 'Acerca de', 'General']) {
    await page.getByRole('tab', { name: t }).click()
    await page.waitForTimeout(200)
  }
  await page.getByRole('tab', { name: 'Acerca de' }).click()
  await expect(page.getByText('Conciliación de saldos')).toBeVisible()
  expect(errors).toEqual([])
})

test('tema claro y oscuro', async ({ page }) => {
  await page.goto('/#/')
  await page.waitForSelector('aside')
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: /Modo (claro|oscuro)/ }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!dark)
  await page.getByRole('button', { name: /Modo (claro|oscuro)/ }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(dark)
})
