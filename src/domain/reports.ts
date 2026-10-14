/**
 * Modelos de reportes. La pantalla, el CSV y el PDF se generan desde el MISMO modelo, por lo que
 * siempre muestran las mismas cifras, calculadas con `ledger.ts` (misma fuente que el panel).
 */
import { addMonthKey, daysBetween, formatDate, monthRange, type DateFormat, type DateRange, type ISODate, type MonthKey } from './dates'
import { budgetOverview } from './budgets'
import { accountBalances, allocatedToGoals, balanceSeries, lastMonths, monthlySeries, summarize, totalsByCategory } from './ledger'
import type { FinanceData } from './types'
import { inRange } from './dates'
import { formatMoney, roundDiv } from './money'

export type ColKind = 'text' | 'money' | 'percent' | 'int' | 'date'
export interface Column { label: string; kind: ColKind }
export type Cell = string | number | null
export interface Section { title: string; columns: Column[]; rows: Cell[][]; totals?: Cell[]; note?: string }
export interface Kpi { label: string; value: number | string; kind: ColKind }
export interface ReportModel {
  id: string
  title: string
  subtitle: string
  kpis: Kpi[]
  sections: Section[]
  /** Notas de conciliación u otros avisos. */
  notes: string[]
}

const T: Column = { label: '', kind: 'text' }
const col = (label: string, kind: ColKind = 'text'): Column => ({ ...T, label, kind })

function nameMap<T extends { id: string; name: string }>(list: readonly T[]) {
  return new Map(list.map((x) => [x.id, x.name]))
}

function rangeLabel(r: DateRange, f: DateFormat) {
  return `${formatDate(r.from, f)} – ${formatDate(r.to, f)}`
}

function categorySections(data: FinanceData, range: DateRange): Section[] {
  const cats = nameMap(data.categories)
  const exp = totalsByCategory(data.transactions, range, 'expense')
  const inc = totalsByCategory(data.transactions, range, 'income')
  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0)
  const toRows = (a: typeof exp) => a.map((c) => [cats.get(c.categoryId) ?? '', c.amount, c.share, c.count])
  return [
    { title: 'Gastos por categoría', columns: [col('Categoría'), col('Total', 'money'), col('% del total', 'percent'), col('Movimientos', 'int')], rows: toRows(exp), totals: ['Total', sum(exp), exp.length ? 1 : 0, exp.reduce((s, c) => s + c.count, 0)] },
    { title: 'Ingresos por fuente', columns: [col('Fuente'), col('Total', 'money'), col('% del total', 'percent'), col('Movimientos', 'int')], rows: toRows(inc), totals: ['Total', sum(inc), inc.length ? 1 : 0, inc.reduce((s, c) => s + c.count, 0)] },
  ]
}

function kpisFor(data: FinanceData, range: DateRange, endDate: ISODate): Kpi[] {
  const s = summarize(data.transactions, range)
  const bal = [...accountBalances(data, endDate).entries()].filter(([id]) => !data.accounts.find((a) => a.id === id)?.archivedAt).reduce((a, [, v]) => a + v, 0)
  return [
    { label: 'Ingresos', value: s.income, kind: 'money' },
    { label: 'Gastos', value: s.expense, kind: 'money' },
    { label: 'Ahorro neto', value: s.net, kind: 'money' },
    { label: '% de ingresos ahorrado', value: s.savingsRate === null ? 'Sin ingresos' : s.savingsRate, kind: s.savingsRate === null ? 'text' : 'percent' },
    { label: 'Dinero total al cierre', value: bal, kind: 'money' },
  ]
}

export function monthlyReport(data: FinanceData, month: MonthKey, today: ISODate): ReportModel {
  const sd = data.settings.monthStartDay
  const range = monthRange(month, sd)
  const df = data.settings.dateFormat
  const end = range.to > today ? today : range.to
  const cats = nameMap(data.categories)
  const accs = nameMap(data.accounts)
  const ov = budgetOverview(data, month, sd)
  const tx = data.transactions.filter((t) => inRange(t.date, range)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
  const goals = allocatedToGoals(data, range)
  const sections: Section[] = [
    ...categorySections(data, range),
    {
      title: 'Presupuestos', columns: [col('Categoría'), col('Presupuesto', 'money'), col('Gastado', 'money'), col('Restante', 'money'), col('% usado', 'percent'), col('Estado')],
      rows: ov.rows.map((r) => [r.category.name, r.budget, r.spent, r.remaining, r.used, r.status === 'normal' ? 'Normal' : r.status === 'near' ? 'Cerca del límite' : 'Excedido']),
      totals: ov.rows.length ? ['Total', ov.totalBudget, ov.totalSpentBudgeted, ov.remaining, ov.used, ''] : undefined,
      note: ov.unbudgetedSpent ? `Gasto en categorías sin presupuesto: ${formatMoney(ov.unbudgetedSpent)}` : undefined,
    },
    {
      title: 'Detalle de movimientos', columns: [col('Fecha', 'date'), col('Tipo'), col('Categoría'), col('Descripción'), col('Cuenta'), col('Valor', 'money')],
      rows: tx.map((t) => [t.date, t.type === 'income' ? 'Ingreso' : 'Gasto', cats.get(t.categoryId) ?? '', t.description, accs.get(t.accountId) ?? '', t.type === 'income' ? t.amount : -t.amount]),
    },
  ]
  const kpis = kpisFor(data, range, end)
  kpis.push({ label: 'Asignado a metas en el mes', value: goals, kind: 'money' })
  return {
    id: 'mensual', title: `Informe mensual ${month}`, subtitle: rangeLabel(range, df), kpis, sections,
    notes: ['Ahorro neto = ingresos − gastos. Las transferencias entre cuentas y los aportes a metas no se cuentan como ingresos ni gastos.'],
  }
}

export function annualReport(data: FinanceData, year: number, today: ISODate): ReportModel {
  const sd = data.settings.monthStartDay
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const range = { from: monthRange(months[0]!, sd).from, to: monthRange(months[11]!, sd).to }
  const series = monthlySeries(data.transactions, months, sd)
  const end = range.to > today ? today : range.to
  const tot = summarize(data.transactions, range)
  return {
    id: 'anual', title: `Informe anual ${year}`, subtitle: rangeLabel(range, data.settings.dateFormat), kpis: kpisFor(data, range, end),
    sections: [
      {
        title: 'Resumen por mes', columns: [col('Mes'), col('Ingresos', 'money'), col('Gastos', 'money'), col('Ahorro neto', 'money'), col('% ahorrado', 'percent')],
        rows: series.map((p) => [p.month, p.income, p.expense, p.net, p.savingsRate]),
        totals: ['Total', tot.income, tot.expense, tot.net, tot.savingsRate],
      },
      ...categorySections(data, range),
    ],
    notes: ['Los meses sin ingresos no muestran porcentaje de ahorro (no se puede calcular).'],
  }
}

export function categoryReport(data: FinanceData, range: DateRange): ReportModel {
  const cats = nameMap(data.categories)
  const exp = totalsByCategory(data.transactions, range, 'expense')
  const days = Math.max(1, daysBetween(range.from, range.to) + 1)
  const biggest = (id: string) => data.transactions.filter((t) => t.type === 'expense' && t.categoryId === id && inRange(t.date, range)).reduce((m, t) => Math.max(m, t.amount), 0)
  const subs = new Map(data.subcategories.map((s) => [s.id, s.name]))
  const subRows: Cell[][] = []
  for (const c of exp) {
    const bySub = new Map<string, number>()
    for (const t of data.transactions) if (t.type === 'expense' && t.categoryId === c.categoryId && inRange(t.date, range)) bySub.set(t.subcategoryId ?? '', (bySub.get(t.subcategoryId ?? '') ?? 0) + t.amount)
    for (const [sid, amount] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) subRows.push([cats.get(c.categoryId) ?? '', sid ? subs.get(sid) ?? '' : '(sin subcategoría)', amount, c.amount ? amount / c.amount : 0])
  }
  return {
    id: 'categorias', title: 'Gastos por categoría', subtitle: rangeLabel(range, data.settings.dateFormat), kpis: kpisFor(data, range, range.to).slice(0, 3),
    sections: [
      {
        title: 'Categorías', columns: [col('Categoría'), col('Total', 'money'), col('% del gasto', 'percent'), col('Movimientos', 'int'), col('Promedio por movimiento', 'money'), col('Mayor gasto', 'money'), col('Promedio diario', 'money')],
        rows: exp.map((c) => [cats.get(c.categoryId) ?? '', c.amount, c.share, c.count, roundDiv(c.amount, c.count), biggest(c.categoryId), roundDiv(c.amount, days)]),
        totals: ['Total', exp.reduce((s, c) => s + c.amount, 0), exp.length ? 1 : 0, exp.reduce((s, c) => s + c.count, 0), null, null, null],
      },
      { title: 'Detalle por subcategoría', columns: [col('Categoría'), col('Subcategoría'), col('Total', 'money'), col('% de la categoría', 'percent')], rows: subRows },
    ],
    notes: [],
  }
}

export function comparisonReport(data: FinanceData, a: DateRange, b: DateRange): ReportModel {
  const df = data.settings.dateFormat
  const cats = nameMap(data.categories)
  const sa = summarize(data.transactions, a)
  const sb = summarize(data.transactions, b)
  const ea = new Map(totalsByCategory(data.transactions, a, 'expense').map((c) => [c.categoryId, c.amount]))
  const eb = new Map(totalsByCategory(data.transactions, b, 'expense').map((c) => [c.categoryId, c.amount]))
  const ids = new Set([...ea.keys(), ...eb.keys()])
  const rows: Cell[][] = [...ids].map((id) => {
    const x = ea.get(id) ?? 0
    const y = eb.get(id) ?? 0
    return [cats.get(id) ?? '', x, y, x - y, y ? (x - y) / y : null]
  }).sort((p, q) => Math.abs(q[3] as number) - Math.abs(p[3] as number))
  const ch = (x: number, y: number): Cell => (y ? (x - y) / Math.abs(y) : null)
  return {
    id: 'comparacion', title: 'Comparación de períodos', subtitle: `A: ${rangeLabel(a, df)} · B: ${rangeLabel(b, df)}`,
    kpis: [
      { label: 'Ingresos A', value: sa.income, kind: 'money' }, { label: 'Ingresos B', value: sb.income, kind: 'money' },
      { label: 'Gastos A', value: sa.expense, kind: 'money' }, { label: 'Gastos B', value: sb.expense, kind: 'money' },
    ],
    sections: [
      { title: 'Resumen', columns: [col('Concepto'), col('Período A', 'money'), col('Período B', 'money'), col('Diferencia', 'money'), col('Variación', 'percent')], rows: [['Ingresos', sa.income, sb.income, sa.income - sb.income, ch(sa.income, sb.income)], ['Gastos', sa.expense, sb.expense, sa.expense - sb.expense, ch(sa.expense, sb.expense)], ['Ahorro neto', sa.net, sb.net, sa.net - sb.net, ch(sa.net, sb.net)]] },
      { title: 'Gasto por categoría', columns: [col('Categoría'), col('Período A', 'money'), col('Período B', 'money'), col('Diferencia', 'money'), col('Variación', 'percent')], rows },
    ],
    notes: ['Una variación vacía indica que el período B no tuvo gasto en esa categoría.'],
  }
}

export function trendReport(data: FinanceData, endMonth: MonthKey, n = 12): ReportModel {
  const sd = data.settings.monthStartDay
  const months = lastMonths(endMonth, n)
  const s = monthlySeries(data.transactions, months, sd)
  const avg = (f: (p: (typeof s)[number]) => number) => roundDiv(s.reduce((x, p) => x + f(p), 0), s.length)
  return {
    id: 'tendencias', title: 'Tendencias de ingresos, gastos y ahorro', subtitle: `${months[0]} a ${endMonth}`,
    kpis: [{ label: 'Ingreso mensual promedio', value: avg((p) => p.income), kind: 'money' }, { label: 'Gasto mensual promedio', value: avg((p) => p.expense), kind: 'money' }, { label: 'Ahorro mensual promedio', value: avg((p) => p.net), kind: 'money' }],
    sections: [{ title: 'Evolución mensual', columns: [col('Mes'), col('Ingresos', 'money'), col('Gastos', 'money'), col('Ahorro neto', 'money'), col('% ahorrado', 'percent')], rows: s.map((p) => [p.month, p.income, p.expense, p.net, p.savingsRate]) }],
    notes: [],
  }
}

export interface CashFlowRow { account: string; opening: number; income: number; expense: number; transfersIn: number; transfersOut: number; closing: number }

export function cashFlowReport(data: FinanceData, range: DateRange, accountIds: string[] = []): ReportModel {
  const accs = data.accounts.filter((a) => (accountIds.length ? accountIds.includes(a.id) : true))
  const dayBefore = new Date(`${range.from}T00:00:00`)
  dayBefore.setDate(dayBefore.getDate() - 1)
  const before = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`
  const opening = range.from <= '0001-01-01' ? new Map(data.accounts.map((a) => [a.id, a.initialBalance])) : accountBalances(data, before)
  const rows: CashFlowRow[] = accs.map((a) => {
    let income = 0, expense = 0, tin = 0, tout = 0
    for (const t of data.transactions) if (t.accountId === a.id && inRange(t.date, range)) (t.type === 'income' ? (income += t.amount) : (expense += t.amount))
    for (const tr of data.transfers) {
      if (!inRange(tr.date, range)) continue
      if (tr.toAccountId === a.id) tin += tr.amount
      if (tr.fromAccountId === a.id) tout += tr.amount
    }
    const open = opening.get(a.id) ?? 0
    return { account: a.name, opening: open, income, expense, transfersIn: tin, transfersOut: tout, closing: open + income - expense + tin - tout }
  })
  const sum = (f: (r: CashFlowRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  const actualClosing = accountBalances(data, range.to)
  const check = rows.every((r, i) => actualClosing.get(accs[i]!.id) === r.closing)
  const allAccounts = accountIds.length === 0
  const transfersNet = sum((r) => r.transfersIn - r.transfersOut)
  return {
    id: 'flujo', title: 'Flujo de efectivo', subtitle: rangeLabel(range, data.settings.dateFormat),
    kpis: [{ label: 'Saldo inicial', value: sum((r) => r.opening), kind: 'money' }, { label: 'Ingresos', value: sum((r) => r.income), kind: 'money' }, { label: 'Gastos', value: sum((r) => r.expense), kind: 'money' }, { label: 'Saldo final', value: sum((r) => r.closing), kind: 'money' }],
    sections: [{
      title: 'Por cuenta', columns: [col('Cuenta'), col('Saldo inicial', 'money'), col('Ingresos', 'money'), col('Gastos', 'money'), col('Transferencias recibidas', 'money'), col('Transferencias enviadas', 'money'), col('Saldo final', 'money')],
      rows: rows.map((r) => [r.account, r.opening, r.income, r.expense, r.transfersIn, r.transfersOut, r.closing]),
      totals: ['Total', sum((r) => r.opening), sum((r) => r.income), sum((r) => r.expense), sum((r) => r.transfersIn), sum((r) => r.transfersOut), sum((r) => r.closing)],
    }],
    notes: [
      allAccounts ? (transfersNet === 0 ? 'Las transferencias entre cuentas se anulan: no alteran el dinero total.' : 'Atención: las transferencias no se anulan entre sí.') : 'Con filtro de cuentas, las transferencias hacia/desde cuentas no incluidas sí cambian el total mostrado.',
      check ? 'Conciliado: saldo inicial + ingresos − gastos ± transferencias = saldo final de cada cuenta.' : 'No concilia: revisa los movimientos.',
    ],
  }
}

/** Valor numérico exportable de una celda (sin formato). */
export function cellRaw(c: Cell): string | number {
  return c === null ? '' : c
}

/** Serie del balance al cierre de cada mes del rango (para gráficos de reportes). */
export function monthEndBalances(data: FinanceData, months: MonthKey[]) {
  const sd = data.settings.monthStartDay
  return balanceSeries(data, months.map((m) => monthRange(m, sd).to))
}
export { addMonthKey }
