import { describe, expect, it } from 'vitest'
import { annualReport, cashFlowReport, categoryReport, comparisonReport, monthlyReport, trendReport } from './reports'
import { reportToCsv, reportToPdf } from './reportExport'
import { parseCsv } from './csv'
import { summarize, totalBalance } from './ledger'
import { monthRange } from './dates'
import { CASH, ENTERTAINMENT, FOOD, setup } from '@/test/helpers'

async function fixture() {
  const t = setup('2025-06-20')
  const bank = await t.bank(1_000_000, 'Banco')
  await t.s.transactions.create({ type: 'income', amount: 3_000_000, date: '2025-05-02', accountId: bank, categoryId: 'cat_ing_salario', description: 'Nómina mayo' })
  await t.s.transactions.create({ type: 'expense', amount: 400_000, date: '2025-05-10', accountId: bank, categoryId: FOOD, description: 'Mercado' })
  await t.s.transactions.create({ type: 'income', amount: 3_100_000, date: '2025-06-02', accountId: bank, categoryId: 'cat_ing_salario', description: 'Nómina junio' })
  await t.s.transactions.create({ type: 'expense', amount: 500_000, date: '2025-06-10', accountId: bank, categoryId: FOOD, description: 'Mercado' })
  await t.s.transactions.create({ type: 'expense', amount: 120_000, date: '2025-06-12', accountId: CASH, categoryId: ENTERTAINMENT, description: 'Cine y cena' })
  await t.s.transfers.create({ fromAccountId: bank, toAccountId: CASH, amount: 200_000, date: '2025-06-05' })
  await t.s.budgets.set({ categoryId: FOOD, month: 'default', amount: 450_000 })
  const goal = await t.s.goals.create({ name: 'Meta', targetAmount: 1_000_000 })
  await t.s.goals.contribute({ goalId: goal, kind: 'deposit', amount: 300_000, date: '2025-06-15' })
  return { t, bank, d: await t.load() }
}

describe('regla 11: reportes concilian con los movimientos y el panel', () => {
  it('informe mensual: KPIs = resumen del libro mayor; categorías y detalle suman lo mismo', async () => {
    const { d } = await fixture()
    const r = monthlyReport(d, '2025-06', '2025-06-20')
    const s = summarize(d.transactions, monthRange('2025-06'))
    expect(r.kpis.find((k) => k.label === 'Ingresos')!.value).toBe(s.income)
    expect(r.kpis.find((k) => k.label === 'Gastos')!.value).toBe(s.expense)
    expect(r.kpis.find((k) => k.label === 'Ahorro neto')!.value).toBe(s.net)
    expect(r.kpis.find((k) => k.label === 'Dinero total al cierre')!.value).toBe(totalBalance(d))
    expect(r.kpis.find((k) => k.label === 'Asignado a metas en el mes')!.value).toBe(300_000)
    const cat = r.sections[0]!
    expect(cat.totals![1]).toBe(s.expense)
    expect(cat.rows.reduce((a, row) => a + (row[1] as number), 0)).toBe(s.expense)
    const detail = r.sections.find((x) => x.title === 'Detalle de movimientos')!
    expect(detail.rows).toHaveLength(3) // 2 gastos + 1 ingreso (la transferencia no aparece)
    expect(detail.rows.reduce((a, row) => a + (row[5] as number), 0)).toBe(s.net)
    const bud = r.sections.find((x) => x.title === 'Presupuestos')!
    expect(bud.rows[0]).toEqual(['Alimentación', 450_000, 500_000, -50_000, 500_000 / 450_000, 'Excedido'])
  })
  it('informe anual: suma de meses = total anual', async () => {
    const { d } = await fixture()
    const r = annualReport(d, 2025, '2025-06-20')
    const m = r.sections[0]!
    expect(m.rows).toHaveLength(12)
    expect(m.rows.reduce((a, row) => a + (row[1] as number), 0)).toBe(m.totals![1])
    expect(m.totals![3]).toBe(6_100_000 - 1_020_000)
    expect(m.rows[0]![4]).toBeNull() // enero sin ingresos: sin %
  })
  it('flujo de efectivo: saldo inicial + movimientos = saldo final y las transferencias se anulan', async () => {
    const { d } = await fixture()
    const r = cashFlowReport(d, monthRange('2025-06'))
    const sec = r.sections[0]!
    const tot = sec.totals!
    expect(tot[1]! as number + (tot[2] as number) - (tot[3] as number) + (tot[4] as number) - (tot[5] as number)).toBe(tot[6])
    expect(tot[4]).toBe(tot[5])
    expect(tot[6]).toBe(totalBalance(d))
    expect(r.notes.join(' ')).toMatch(/Conciliado/)
    const banco = sec.rows.find((x) => x[0] === 'Banco')!
    expect(banco.slice(1, 6)).toEqual([1_000_000 + 3_000_000 - 400_000, 3_100_000, 500_000, 0, 200_000])
    expect(banco[6]).toBe(1_000_000 + 3_000_000 - 400_000 + 3_100_000 - 500_000 - 200_000)
  })
  it('comparación, categorías y tendencias', async () => {
    const { d } = await fixture()
    const c = comparisonReport(d, monthRange('2025-06'), monthRange('2025-05'))
    expect(c.sections[0]!.rows[1]).toEqual(['Gastos', 620_000, 400_000, 220_000, 220_000 / 400_000])
    const food = c.sections[1]!.rows.find((r) => r[0] === 'Alimentación')!
    expect(food).toEqual(['Alimentación', 500_000, 400_000, 100_000, 0.25])
    const k = categoryReport(d, monthRange('2025-06'))
    expect(k.sections[0]!.rows[0]![0]).toBe('Alimentación')
    expect(k.sections[0]!.totals![1]).toBe(620_000)
    const tr = trendReport(d, '2025-06', 3)
    expect(tr.sections[0]!.rows.map((r) => r[0])).toEqual(['2025-04', '2025-05', '2025-06'])
  })
  it('sin movimientos los reportes no fallan', async () => {
    const d = await setup().load()
    expect(monthlyReport(d, '2025-06', '2025-06-15').sections[0]!.rows).toEqual([])
    expect(annualReport(d, 2025, '2025-06-15').kpis.find((k) => k.label === 'Ingresos')!.value).toBe(0)
    expect(cashFlowReport(d, monthRange('2025-06')).notes.join(' ')).toMatch(/Conciliado/)
  })
})

describe('exportación: contiene los datos reales', () => {
  it('CSV con cifras sin formato y legibles al volver a leerlas', async () => {
    const { d } = await fixture()
    const csv = reportToCsv(monthlyReport(d, '2025-06', '2025-06-20'))
    const rows = parseCsv(csv, ';')
    const flat = rows.map((r) => r.join('|')).join('\n')
    expect(flat).toContain('Ingresos|3100000')
    expect(flat).toContain('Gastos|620000')
    expect(flat).toContain('Nómina junio')
    expect(flat).toContain('Alimentación|500000|0.806')
    expect(flat).not.toMatch(/\$/)
  })
  it('PDF válido generado localmente', async () => {
    const { d } = await fixture()
    const bytes = await reportToPdf(monthlyReport(d, '2025-06', '2025-06-20'), 'dd/MM/yyyy', 'Alex')
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(2000)
    expect(String.fromCharCode(...bytes.slice(-6))).toContain('%%EOF')
  })
})
