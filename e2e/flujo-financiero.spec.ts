import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'

/** Recorre los flujos principales con una base nueva: cada paso verifica saldos y totales reales. */
test.describe.configure({ mode: 'serial' })

let page: Page
const dlg = () => page.getByRole('dialog')
const money = (n: number) => `$ ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const fill = async (label: string | RegExp, v: string) => dlg().getByLabel(label, { exact: typeof label === 'string' }).fill(v)

async function goto(path: string) {
  await page.goto(`/#${path}`)
  await page.waitForSelector('aside')
}
async function totalInAccounts() {
  await goto('/cuentas')
  return page.locator('.surface', { hasText: 'Dinero total en cuentas' }).first().locator('p.num').first().innerText()
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
})
test.afterAll(async () => page.close())

test('1. base nueva: bienvenida y sin datos inventados', async () => {
  await goto('/')
  await expect(page.getByText('Bienvenido a MONETA')).toBeVisible()
  await expect(page.getByText('Balance total disponible')).toBeVisible()
  await goto('/gastos')
  await expect(page.getByText('Aún no registras gastos')).toBeVisible()
  await goto('/insights')
  await expect(page.getByText('Por ahora no hay recomendaciones')).toBeVisible()
})

test('2. cuentas: editar saldo inicial y crear una cuenta', async () => {
  await goto('/cuentas')
  await page.getByRole('button', { name: 'Acciones de Efectivo' }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await fill('Saldo inicial', '100000')
  await dlg().getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(money(100000)).first()).toBeVisible()

  await page.getByRole('button', { name: 'Nueva cuenta' }).first().click()
  await fill('Nombre de la cuenta', 'Banco')
  await fill('Saldo inicial', '1000000')
  await dlg().getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText(money(1100000)).first()).toBeVisible() // total
  expect(await totalInAccounts()).toBe(money(1100000))
})

test('3. ingreso aumenta la cuenta; gasto rápido la disminuye', async () => {
  await goto('/')
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click()
  await page.getByRole('menuitem', { name: 'Ingreso' }).click()
  await fill('Valor', '3000000')
  await dlg().getByLabel('Categoría', { exact: true }).selectOption({ label: 'Salario' })
  await dlg().getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Banco' })
  await fill('Descripción', 'Nómina')
  await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dlg()).toBeHidden()

  await page.keyboard.press('Control+n')
  await expect(dlg().getByText('Registro rápido de gasto')).toBeVisible()
  await fill('Valor', '45000')
  await dlg().getByRole('button', { name: 'Alimentación' }).first().click()
  await dlg().getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Efectivo' })
  await fill('Descripción', 'Almuerzo')
  await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dlg()).toBeHidden()

  await goto('/cuentas')
  await expect(page.locator('.surface', { hasText: 'Banco' }).getByText(money(4000000)).first()).toBeVisible()
  await expect(page.locator('.surface', { hasText: 'Efectivo' }).getByText(money(55000)).first()).toBeVisible()
  expect(await totalInAccounts()).toBe(money(4055000))
})

test('4. transferencia mueve dinero sin cambiar el total ni ingresos/gastos', async () => {
  await goto('/cuentas')
  await page.getByRole('button', { name: 'Transferir', exact: true }).click()
  await dlg().getByLabel('Cuenta de origen').selectOption({ label: 'Banco' })
  await dlg().getByLabel('Cuenta de destino').selectOption({ label: 'Efectivo' })
  await fill('Valor', '500000')
  await dlg().getByRole('button', { name: 'Transferir' }).click()
  await expect(dlg()).toBeHidden()
  await expect(page.locator('.surface', { hasText: 'Banco' }).getByText(money(3500000)).first()).toBeVisible()
  await expect(page.locator('.surface', { hasText: 'Efectivo' }).getByText(money(555000)).first()).toBeVisible()
  expect(await totalInAccounts()).toBe(money(4055000))
  await goto('/')
  await expect(page.getByText('Ahorro neto del período').locator('..').locator('..').getByText('+$ 2.955.000')).toBeVisible()
})

test('4b. editar y eliminar una transferencia recalcula ambos saldos y se puede deshacer', async () => {
  await goto('/cuentas')
  await page.getByRole('button', { name: 'Acciones de Banco' }).click()
  await page.getByRole('menuitem', { name: 'Ver movimientos' }).click()
  await page.getByRole('button', { name: 'Acciones de la transferencia' }).first().click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  const top = page.getByRole('dialog').last()
  await top.getByLabel('Valor', { exact: true }).fill('400000')
  await top.getByRole('button', { name: 'Guardar cambios' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.surface', { hasText: 'Banco' }).getByText(money(3600000)).first()).toBeVisible()
  await expect(page.locator('.surface', { hasText: 'Efectivo' }).getByText(money(455000)).first()).toBeVisible()
  expect(await totalInAccounts()).toBe(money(4055000))

  await page.getByRole('button', { name: 'Acciones de Banco' }).click()
  await page.getByRole('menuitem', { name: 'Ver movimientos' }).click()
  await page.getByRole('button', { name: 'Acciones de la transferencia' }).first().click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.surface', { hasText: 'Banco' }).getByText(money(4000000)).first()).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(page.locator('.surface', { hasText: 'Banco' }).getByText(money(3600000)).first()).toBeVisible()
  expect(await totalInAccounts()).toBe(money(4055000))
})

test('5. editar un gasto recalcula; eliminar pide confirmación y se puede deshacer', async () => {
  await goto('/gastos')
  const row = page.getByRole('row', { name: /Almuerzo/ })
  await row.getByRole('button', { name: 'Acciones' }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await fill('Valor', '50000')
  await dlg().getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('row', { name: /Almuerzo/ }).getByText(money(50000))).toBeVisible()
  expect(await totalInAccounts()).toBe(money(4050000))

  await goto('/gastos')
  await page.getByRole('row', { name: /Almuerzo/ }).getByRole('button', { name: 'Acciones' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('¿Eliminar este gasto?')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByRole('row', { name: /Almuerzo/ })).toHaveCount(0)
  expect(await totalInAccounts()).toBe(money(4100000))
  await goto('/gastos') // la papelera no se muestra, pero el deshacer es posible mientras dure el aviso
})

test('6. deshacer la eliminación restaura el movimiento y el saldo', async () => {
  await goto('/gastos')
  await page.getByRole('button', { name: 'Nuevo gasto' }).click()
  await fill('Valor', '20000')
  await dlg().getByLabel('Categoría', { exact: true }).selectOption({ label: 'Transporte' })
  await fill('Descripción', 'Taxi')
  await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('row', { name: /Taxi/ }).getByRole('button', { name: 'Acciones' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByRole('row', { name: /Taxi/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(page.getByRole('row', { name: /Taxi/ })).toBeVisible()
})

test('7. presupuesto: gastado, restante y estado', async () => {
  await goto('/gastos')
  await page.getByRole('button', { name: 'Nuevo gasto' }).click()
  await fill('Valor', '50000')
  await dlg().getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await fill('Descripción', 'Mercado')
  await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dlg()).toBeHidden()
  await goto('/presupuestos')
  await page.getByRole('button', { name: 'Nuevo presupuesto' }).first().click()
  await dlg().getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await fill('Presupuesto mensual', '60000')
  await dlg().getByRole('button', { name: 'Guardar' }).click()
  const row = page.locator('li', { hasText: 'Alimentación' }).first()
  await expect(row.getByText('Cerca del límite')).toBeVisible()
  await expect(row.getByText(money(50000))).toBeVisible()
  await expect(row.getByText(`Restan ${money(10000)}`)).toBeVisible()
  await expect(row.getByText('83% utilizado')).toBeVisible()
})

test('8. meta de ahorro: el aporte no es un gasto ni cambia saldos', async () => {
  const before = await totalInAccounts()
  await goto('/metas')
  await page.getByRole('button', { name: 'Nueva meta' }).first().click()
  await fill('Nombre de la meta', 'Viaje')
  await fill('Valor objetivo', '1000000')
  await dlg().getByRole('button', { name: 'Crear meta' }).click()
  await page.getByRole('button', { name: 'Aportar' }).first().click()
  await fill('Valor', '200000')
  await dlg().getByRole('button', { name: 'Aportar', exact: true }).click()
  await expect(page.locator('.surface', { hasText: 'Viaje' }).getByText(money(200000)).first()).toBeVisible()
  expect(await totalInAccounts()).toBe(before)
  await goto('/gastos')
  await expect(page.getByRole('row', { name: /Viaje|aporte/i })).toHaveCount(0)
})

test('9. suscripción: lo previsto no afecta el saldo hasta registrar el pago', async () => {
  const before = await totalInAccounts()
  await goto('/suscripciones')
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click()
  await fill('Nombre', 'Netflix')
  await fill('Valor', '38900')
  await dlg().getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByRole('row', { name: /Netflix/ })).toBeVisible()
  expect(await totalInAccounts()).toBe(before)
  await goto('/suscripciones')
  await page.getByRole('button', { name: 'Acciones de Netflix' }).click()
  await page.getByRole('menuitem', { name: /Registrar pago/ }).click()
  await dlg().getByRole('button', { name: 'Registrar' }).click()
  await expect(dlg()).toBeHidden()
  const after = Number((await totalInAccounts()).replace(/\D/g, ''))
  expect(after).toBe(Number(before.replace(/\D/g, '')) - 38900)
})

test('10. búsqueda global lleva al movimiento', async () => {
  await goto('/')
  await page.keyboard.press('Control+k')
  await page.getByLabel('Buscar', { exact: true }).fill('nómina')
  await expect(page.getByRole('dialog').getByText('Nómina').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/ingresos/)
  await expect(page.getByRole('row', { name: /Nómina/ })).toBeVisible()
})

test('11. exportar CSV con los datos reales', async () => {
  await goto('/gastos')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
  const path = await download.path()
  const text = fs.readFileSync(path!, 'utf8')
  expect(text).toContain('Fecha;Tipo;Valor')
  expect(text).toContain('Taxi')
  expect(text).toContain(';20000;')
  expect(text).not.toContain('Almuerzo') // eliminado
})

test('12. reportes: PDF y CSV se generan', async () => {
  await goto('/reportes')
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()])
  const bytes = fs.readFileSync((await pdf.path())!)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  expect(fs.readFileSync((await csv.path())!, 'utf8')).toContain('Informe mensual')
})

test('13. los datos persisten al recargar', async () => {
  const total = await totalInAccounts()
  await page.reload()
  await page.waitForSelector('aside')
  expect(await totalInAccounts()).toBe(total)
  await goto('/ingresos')
  await expect(page.getByRole('row', { name: /Nómina/ })).toBeVisible()
})
