import { monthKeyOf, monthRange, type DateRange, type ISODate } from '@/domain/dates'
import { budgetOverview } from '@/domain/budgets'
import { summarize, totalsByCategory } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import type { FinanceData } from '@/domain/types'
import { INSIGHT_CONFIG as CFG } from './config'
import { analysisMonths, pctText } from './helpers'
import { emergencyCoverage } from './rules'

export interface EssentialSplit {
  essential: number
  nonEssential: number
  total: number
  /** Fracción de los gastos que es esencial (null si no hay gastos). */
  essentialShare: number | null
  /** Gastos esenciales / ingresos (null si no hubo ingresos). */
  essentialOfIncome: number | null
  income: number
}

/** Comparación de gastos esenciales y no esenciales (según la marca «esencial» de cada categoría). */
export function essentialSplit(data: Pick<FinanceData, 'transactions' | 'categories'>, range: DateRange): EssentialSplit {
  const cats = new Map(data.categories.map((c) => [c.id, c]))
  let essential = 0
  let nonEssential = 0
  for (const t of totalsByCategory(data.transactions, range, 'expense')) (cats.get(t.categoryId)?.essential ? (essential += t.amount) : (nonEssential += t.amount))
  const total = essential + nonEssential
  const income = summarize(data.transactions, range).income
  return { essential, nonEssential, total, essentialShare: total ? essential / total : null, essentialOfIncome: income ? essential / income : null, income }
}

export interface HealthComponent {
  id: string
  label: string
  /** Valor medido, en texto. */
  value: string
  /** 0-100, o null si no hay datos suficientes. */
  score: number | null
  weight: number
  rule: string
}
export interface Health {
  score: number | null
  level: 'healthy' | 'ontrack' | 'improve' | null
  components: HealthComponent[]
  note: string
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Indicador de salud financiera: promedio ponderado de componentes con reglas visibles. */
export function financialHealth(data: FinanceData, today: ISODate): Health {
  const sd = data.settings.monthStartDay
  const months = analysisMonths(data, today, CFG.averageMonths)
  const rows = months.map((m) => ({ m, range: monthRange(m, sd), s: summarize(data.transactions, monthRange(m, sd)) })).filter((r) => r.s.income > 0)
  const comps: HealthComponent[] = []

  // 1. Tasa de ahorro
  if (rows.length >= 2) {
    const inc = rows.reduce((s, r) => s + r.s.income, 0)
    const net = rows.reduce((s, r) => s + r.s.net, 0)
    const rate = net / inc
    comps.push({ id: 'savings', label: 'Tasa de ahorro', value: pctText(rate, 1), score: clamp((rate / CFG.savingsTarget) * 100), weight: 35, rule: `Ahorro ÷ ingresos de los últimos ${rows.length} meses. ${pctText(CFG.savingsTarget)} o más = 100 puntos; 0% o menos = 0.` })
  } else comps.push({ id: 'savings', label: 'Tasa de ahorro', value: 'Sin datos suficientes', score: null, weight: 35, rule: 'Requiere al menos 2 meses completos con ingresos.' })

  // 2. Peso de los gastos esenciales sobre los ingresos
  if (rows.length >= 2) {
    const inc = rows.reduce((s, r) => s + r.s.income, 0)
    const ess = rows.reduce((s, r) => s + essentialSplit(data, r.range).essential, 0)
    const r = ess / inc
    comps.push({ id: 'essentials', label: 'Gastos esenciales / ingresos', value: pctText(r, 1), score: clamp(((0.8 - r) / 0.3) * 100), weight: 25, rule: 'Gasto en categorías esenciales ÷ ingresos. 50% o menos = 100 puntos; 80% o más = 0.' })
  } else comps.push({ id: 'essentials', label: 'Gastos esenciales / ingresos', value: 'Sin datos suficientes', score: null, weight: 25, rule: 'Requiere al menos 2 meses completos con ingresos.' })

  // 3. Cumplimiento de presupuestos del mes en curso
  const ov = budgetOverview(data, monthKeyOf(today, sd), sd)
  if (ov.rows.length > 0) {
    const ok = ov.rows.filter((r) => r.status !== 'exceeded').length
    comps.push({ id: 'budgets', label: 'Cumplimiento de presupuestos', value: `${ok} de ${ov.rows.length} dentro del límite`, score: clamp((ok / ov.rows.length) * 100), weight: 20, rule: 'Categorías con presupuesto que no lo han superado este mes.' })
  } else comps.push({ id: 'budgets', label: 'Cumplimiento de presupuestos', value: 'Sin presupuestos', score: null, weight: 20, rule: 'Crea presupuestos por categoría para medir este punto.' })

  // 4. Fondo de emergencia
  const em = emergencyCoverage(data, today)
  if (em) comps.push({ id: 'emergency', label: 'Fondo de emergencia', value: `${em.months.toFixed(1).replace('.', ',')} meses`, score: clamp((em.months / CFG.emergencyIdeal) * 100), weight: 20, rule: `Saldo de cuentas de ahorro ÷ gasto mensual promedio (${formatMoney(em.avgExpense)}). ${CFG.emergencyIdeal} meses o más = 100 puntos.` })
  else comps.push({ id: 'emergency', label: 'Fondo de emergencia', value: 'Sin datos suficientes', score: null, weight: 20, rule: 'Requiere una cuenta de tipo «Cuenta de ahorros» y 2 meses de gastos.' })

  const avail = comps.filter((c) => c.score !== null)
  if (avail.length < 2) return { score: null, level: null, components: comps, note: 'Aún no hay datos suficientes para calcular un indicador confiable. Registra al menos 2 meses de ingresos y gastos.' }
  const wsum = avail.reduce((s, c) => s + c.weight, 0)
  const score = Math.round(avail.reduce((s, c) => s + (c.score as number) * c.weight, 0) / wsum)
  const level = score >= 75 ? 'healthy' : score >= 50 ? 'ontrack' : 'improve'
  return { score, level, components: comps, note: `Promedio ponderado de ${avail.length} indicador${avail.length === 1 ? '' : 'es'} disponibles (${avail.map((c) => `${c.label} ${c.weight}%`).join(', ')}).` }
}
