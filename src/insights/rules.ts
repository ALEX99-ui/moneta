import { daysBetween, monthKeyOf, monthRange, type ISODate } from '@/domain/dates'
import { budgetOverview } from '@/domain/budgets'
import { summarize, totalsByCategory } from '@/domain/ledger'
import { formatMoney, percentOf, roundDiv } from '@/domain/money'
import { annualCost, monthlyEquivalent } from '@/domain/recurring'
import { findPossibleDuplicates, norm } from '@/domain/filters'
import type { FinanceData, Transaction } from '@/domain/types'
import { INSIGHT_CONFIG as CFG, DISCRETIONARY_SUBCATEGORIES } from './config'
import { analysisMonths, comparisonPair, pctText, spendByCategory } from './helpers'
import { projectMonthEnd } from './projection'

export type Severity = 'alert' | 'warning' | 'info' | 'positive'
export interface Insight {
  id: string
  kind: string
  severity: Severity
  title: string
  detail: string
  /** Pasos del cálculo, para que el usuario pueda verificar cada cifra. */
  explanation: string[]
  /** Cifra principal asociada (por ejemplo, ahorro potencial mensual). */
  amount?: number
  link?: string
}

type Rule = (data: FinanceData, today: ISODate) => Insight[]

const catName = (data: FinanceData, id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Categoría'

/** R1 · Aumentos (y reducciones) relevantes de gasto por categoría frente al período anterior. */
const categoryChanges: Rule = (data, today) => {
  const pair = comparisonPair(data, today, CFG.minElapsedDays)
  if (!pair) return []
  const cur = spendByCategory(data, pair.cur)
  const prev = spendByCategory(data, pair.prev)
  const out: Insight[] = []
  for (const [id, c] of cur) {
    const p = prev.get(id) ?? 0
    const diff = c - p
    if (p < CFG.baseMinSpend) continue
    const ratio = diff / p
    if (ratio >= CFG.increaseRatio && diff >= CFG.increaseMinDiff) {
      out.push({
        id: `increase-${id}`, kind: 'increase', severity: ratio >= CFG.increaseStrongRatio ? 'alert' : 'warning',
        title: `${pair.curLabel} gastaste ${pctText(ratio)} más en ${catName(data, id).toLowerCase()} que ${pair.prevLabel}`,
        detail: `${formatMoney(c)} frente a ${formatMoney(p)}: ${formatMoney(diff)} de diferencia${pair.partial ? ` (mismos ${pair.days} primeros días de cada mes)` : ''}.`,
        explanation: [
          `${pair.curLabel}: ${formatMoney(c)} en ${catName(data, id)} (${pair.cur.from} a ${pair.cur.to}).`,
          `Referencia: ${formatMoney(p)} (${pair.prev.from} a ${pair.prev.to}).`,
          `Variación: (${formatMoney(c)} − ${formatMoney(p)}) ÷ ${formatMoney(p)} = ${pctText(ratio, 1)}.`,
          `Se avisa si el aumento es ≥ ${pctText(CFG.increaseRatio)} y ≥ ${formatMoney(CFG.increaseMinDiff)}, y la base ≥ ${formatMoney(CFG.baseMinSpend)}.`,
        ],
        amount: diff, link: '/gastos',
      })
    } else if (ratio <= -CFG.increaseRatio && -diff >= CFG.increaseMinDiff) {
      out.push({
        id: `decrease-${id}`, kind: 'decrease', severity: 'positive',
        title: `${pair.curLabel} gastaste ${pctText(-ratio)} menos en ${catName(data, id).toLowerCase()} que ${pair.prevLabel}`,
        detail: `${formatMoney(c)} frente a ${formatMoney(p)}: ${formatMoney(-diff)} menos.`,
        explanation: [`${pair.curLabel}: ${formatMoney(c)}.`, `Referencia: ${formatMoney(p)}.`, `Variación: ${pctText(ratio, 1)}.`],
        amount: -diff,
      })
    }
  }
  return out.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5)
}

/** R2 · Categorías no esenciales que pesan mucho sobre los ingresos. */
const shareOfIncome: Rule = (data, today) => {
  const sd = data.settings.monthStartDay
  // Se usa el último mes completo (más estable); si aún no existe, el mes en curso con ≥ 15 días.
  const lastComplete = analysisMonths(data, today, 1)[0]
  const curKey = monthKeyOf(today, sd)
  const curRange = monthRange(curKey, sd)
  const elapsed = daysBetween(curRange.from, today) + 1
  const useCurrent = !lastComplete && elapsed >= 15
  const key = lastComplete ?? curKey
  if (!lastComplete && !useCurrent) return []
  const range = !useCurrent ? monthRange(key, sd) : { from: curRange.from, to: today }
  const sum = summarize(data.transactions, range)
  if (sum.income <= 0) return []
  const label = useCurrent ? 'Este mes' : 'El mes pasado'
  const cats = totalsByCategory(data.transactions, range, 'expense').filter((c) => !data.categories.find((x) => x.id === c.categoryId)?.essential)
  return cats
    .filter((c) => c.amount / sum.income >= CFG.shareOfIncomeWarn)
    .slice(0, 2)
    .map((c) => {
      const r = c.amount / sum.income
      return {
        id: `share-${c.categoryId}`, kind: 'share', severity: r >= CFG.shareOfIncomeAlert ? 'warning' : 'info',
        title: `Tu gasto en ${catName(data, c.categoryId).toLowerCase()} representa el ${pctText(r)} de tus ingresos`,
        detail: `${label}: ${formatMoney(c.amount)} de ${formatMoney(sum.income)} ingresados. Es una categoría no esencial.`,
        explanation: [
          `Gasto en ${catName(data, c.categoryId)} (${range.from} a ${range.to}): ${formatMoney(c.amount)}.`,
          `Ingresos del mismo período: ${formatMoney(sum.income)}.`,
          `${formatMoney(c.amount)} ÷ ${formatMoney(sum.income)} = ${pctText(r, 1)}.`,
          `Se muestra cuando una categoría no esencial supera el ${pctText(CFG.shareOfIncomeWarn)} de los ingresos.`,
        ],
        amount: c.amount, link: '/gastos',
      } satisfies Insight
    })
}

/** R3 · Costo total de las suscripciones activas. */
const subscriptions: Rule = (data) => {
  const subs = data.rules.filter((r) => r.kind === 'expense' && r.isSubscription && r.status === 'active' && !r.archivedAt)
  if (subs.length < 2) return []
  const monthly = subs.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0)
  const annual = subs.reduce((s, r) => s + annualCost(r.amount, r.frequency), 0)
  const words = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']
  return [
    {
      id: 'subscriptions', kind: 'subscriptions', severity: 'info',
      title: `Tienes ${words[subs.length] ?? subs.length} suscripciones que representan ${formatMoney(monthly)} mensuales`,
      detail: `Proyectado a un año son ${formatMoney(annual)}. Revisa si usas todas.`,
      explanation: [...subs.map((r) => `${r.name}: ${formatMoney(r.amount)} (${r.frequency}) ≈ ${formatMoney(monthlyEquivalent(r.amount, r.frequency))} al mes`), `Total mensual equivalente: ${formatMoney(monthly)}; anual: ${formatMoney(annual)}.`],
      amount: monthly, link: '/suscripciones',
    },
  ]
}

/** R4 · Dónde hay más potencial de reducción (no esencial o subcategorías discrecionales). */
const reductionPotential: Rule = (data, today) => {
  const months = analysisMonths(data, today, CFG.averageMonths)
  if (months.length < 2) return []
  type Cand = { id: string; name: string; avg: number; total: number }
  const cands: Cand[] = []
  const monthRanges = months.map((m) => monthRange(m, data.settings.monthStartDay))
  const inAny = (t: Transaction) => monthRanges.some((r) => t.date >= r.from && t.date <= r.to)
  const tx = data.transactions.filter((t) => t.type === 'expense' && inAny(t))
  for (const cat of data.categories) {
    if (cat.kind !== 'expense') continue
    const list = tx.filter((t) => t.categoryId === cat.id)
    if (!cat.essential) {
      const total = list.reduce((s, t) => s + t.amount, 0)
      cands.push({ id: cat.id, name: cat.name, total, avg: roundDiv(total, months.length) })
    } else {
      for (const sub of data.subcategories.filter((s) => s.categoryId === cat.id && DISCRETIONARY_SUBCATEGORIES.includes(norm(s.name)))) {
        const total = list.filter((t) => t.subcategoryId === sub.id).reduce((s, t) => s + t.amount, 0)
        cands.push({ id: `${cat.id}/${sub.id}`, name: sub.name, total, avg: roundDiv(total, months.length) })
      }
    }
  }
  return cands
    .filter((c) => c.avg >= CFG.reductionMinAvg)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 2)
    .map((c) => {
      const monthly = percentOf(c.avg, CFG.reductionPercent)
      return {
        id: `reduce-${c.id}`, kind: 'reduction', severity: 'info',
        title: `Si reduces un ${CFG.reductionPercent}% tu gasto en ${c.name.toLowerCase()}, podrías ahorrar aproximadamente ${formatMoney(monthly)} al mes`,
        detail: `Gastas en promedio ${formatMoney(c.avg)} al mes en ${c.name.toLowerCase()} (últimos ${months.length} meses completos). Ahorro anual aproximado: ${formatMoney(monthly * 12)}.`,
        explanation: [
          `Meses considerados: ${months.join(', ')}.`,
          `Gasto total en ${c.name}: ${formatMoney(c.total)} ÷ ${months.length} meses = ${formatMoney(c.avg)} por mes.`,
          `${CFG.reductionPercent}% de ${formatMoney(c.avg)} = ${formatMoney(monthly)} al mes (×12 = ${formatMoney(monthly * 12)}).`,
          'Es una simulación a partir de tu historial, no una predicción. Se eligen categorías no esenciales (o subcategorías como restaurantes) con mayor gasto promedio.',
        ],
        amount: monthly, link: '/insights',
      } satisfies Insight
    })
}

/** R5 · Promedio de ahorro de los últimos meses completos. */
const savingsAverage: Rule = (data, today) => {
  const months = analysisMonths(data, today, CFG.averageMonths)
  const sd = data.settings.monthStartDay
  const rows = months.map((m) => ({ m, s: summarize(data.transactions, monthRange(m, sd)) })).filter((r) => r.s.income > 0)
  if (rows.length < 2) return []
  const income = rows.reduce((s, r) => s + r.s.income, 0)
  const net = rows.reduce((s, r) => s + r.s.net, 0)
  const rate = net / income
  const severity: Severity = rate < 0 ? 'alert' : rate < 0.1 ? 'warning' : rate >= CFG.savingsTarget ? 'positive' : 'info'
  return [
    {
      id: 'savings-average', kind: 'savings', severity,
      title: `Tu promedio de ahorro durante los últimos ${rows.length} meses es del ${pctText(rate, rate < 0.1 && rate > -0.1 ? 1 : 0)}`,
      detail: rate < 0
        ? `Gastaste más de lo que ingresaste: ${formatMoney(-net)} por encima en ${rows.length} meses.`
        : rate >= CFG.savingsTarget ? `Superas la referencia del ${pctText(CFG.savingsTarget)}. Ahorraste ${formatMoney(net)} en total.`
        : `La referencia habitual es ahorrar al menos el ${pctText(CFG.savingsTarget)} de los ingresos. Te faltarían ${formatMoney(Math.max(0, percentOf(income, CFG.savingsTarget * 100) - net))} en estos meses para alcanzarla.`,
      explanation: [
        ...rows.map((r) => `${r.m}: ingresos ${formatMoney(r.s.income)} − gastos ${formatMoney(r.s.expense)} = ${formatMoney(r.s.net)}`),
        `Ahorro total ${formatMoney(net)} ÷ ingresos totales ${formatMoney(income)} = ${pctText(rate, 1)}.`,
        'No incluye transferencias entre cuentas ni aportes a metas (no son ingresos ni gastos).',
      ],
      amount: net, link: '/reportes',
    },
  ]
}

/** R6 · Gastos por encima de los ingresos en el mes en curso. */
const monthDeficit: Rule = (data, today) => {
  const sd = data.settings.monthStartDay
  const r = monthRange(monthKeyOf(today, sd), sd)
  const s = summarize(data.transactions, { from: r.from, to: today })
  if (s.expense <= 0 || s.expense <= s.income || daysBetween(r.from, today) + 1 < CFG.minElapsedDays) return []
  return [
    {
      id: 'deficit', kind: 'deficit', severity: 'alert',
      title: `Este mes llevas ${formatMoney(s.expense - s.income)} más en gastos que en ingresos`,
      detail: `Gastos ${formatMoney(s.expense)} vs. ingresos ${formatMoney(s.income)} en lo que va del mes.`,
      explanation: [`Ingresos (${r.from} a ${today}): ${formatMoney(s.income)}.`, `Gastos del mismo período: ${formatMoney(s.expense)}.`, `Diferencia: ${formatMoney(s.net)}.`],
      amount: s.expense - s.income, link: '/gastos',
    },
  ]
}

/** R7 · Presupuestos cerca del límite o excedidos. */
const budgetAlerts: Rule = (data, today) => {
  const sd = data.settings.monthStartDay
  const month = monthKeyOf(today, sd)
  const ov = budgetOverview(data, month, sd)
  const range = monthRange(month, sd)
  const daysLeft = Math.max(0, daysBetween(today, range.to))
  return ov.rows
    .filter((r) => r.status !== 'normal')
    .slice(0, 4)
    .map((r) => ({
      id: `budget-${r.category.id}`, kind: 'budget', severity: r.status === 'exceeded' ? 'alert' : 'warning',
      title: r.status === 'exceeded' ? `${r.category.name} superó su presupuesto por ${formatMoney(-r.remaining)}` : `${r.category.name} va en el ${pctText(r.used)} de su presupuesto`,
      detail: r.status === 'exceeded' ? `Gastaste ${formatMoney(r.spent)} de ${formatMoney(r.budget)}.` : `Te quedan ${formatMoney(r.remaining)} para ${daysLeft} día${daysLeft === 1 ? '' : 's'}${daysLeft > 0 ? ` (≈ ${formatMoney(roundDiv(r.remaining, daysLeft))} por día)` : ''}.`,
      explanation: [`Presupuesto ${r.source === 'month' ? 'de este mes' : 'predeterminado'}: ${formatMoney(r.budget)}.`, `Gastado entre ${range.from} y ${range.to}: ${formatMoney(r.spent)}.`, `Usado: ${pctText(r.used, 1)}. «Cerca del límite» desde el 80%.`],
      amount: r.remaining, link: '/presupuestos',
    }))
}

/** R8 · Gastos que parecen recurrentes y no están registrados como suscripción/pago periódico. */
const undetectedRecurring: Rule = (data) => {
  const key = (t: Transaction) => norm(t.merchant || t.description)
  const known = new Set(data.rules.map((r) => norm(r.name)))
  const groups = new Map<string, Transaction[]>()
  for (const t of data.transactions) {
    if (t.type !== 'expense' || t.recurringRuleId) continue
    const k = key(t)
    if (k.length < 3) continue
    ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(t)
  }
  const out: Insight[] = []
  for (const [k, list] of groups) {
    if (known.has(k)) continue
    const months = new Set(list.map((t) => t.date.slice(0, 7)))
    if (months.size < CFG.recurringMinMonths) continue
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1))
    const amounts = sorted.map((t) => t.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]!
    if (!amounts.every((a) => Math.abs(a - median) / median <= CFG.recurringAmountTolerance)) continue
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i]!.date, t.date)).sort((a, b) => a - b)
    const medGap = gaps[Math.floor(gaps.length / 2)] ?? 0
    if (medGap < 25 || medGap > 35) continue
    const name = sorted[sorted.length - 1]!.merchant || sorted[sorted.length - 1]!.description
    out.push({
      id: `recurring-${k}`, kind: 'recurring', severity: 'info',
      title: `«${name}» parece un pago mensual de ≈ ${formatMoney(median)}`,
      detail: `Aparece en ${months.size} meses distintos con montos muy parecidos. Si lo es, regístralo en Suscripciones para prever su próxima fecha.`,
      explanation: [`Movimientos: ${sorted.map((t) => `${t.date} (${formatMoney(t.amount)})`).join(', ')}.`, `Monto mediano ${formatMoney(median)}; todos dentro de ±${pctText(CFG.recurringAmountTolerance)}.`, `Separación mediana entre pagos: ${medGap} días (entre 25 y 35 = mensual).`],
      amount: median, link: '/suscripciones',
    })
  }
  return out.slice(0, 3)
}

/** R9 · Proyección de cierre de mes. */
const monthEnd: Rule = (data, today) => {
  const p = projectMonthEnd(data, today)
  if (!p.enough) return []
  const sd = data.settings.monthStartDay
  const ov = budgetOverview(data, monthKeyOf(today, sd), sd)
  const overBudget = ov.totalBudget > 0 && p.projectedExpense > ov.totalBudget
  const overIncome = p.incomeSoFar > 0 && p.projectedExpense > p.incomeSoFar
  return [
    {
      id: 'projection', kind: 'projection', severity: overIncome ? 'warning' : overBudget ? 'warning' : 'info',
      title: `Al ritmo actual cerrarías el mes con gastos de ≈ ${formatMoney(p.projectedExpense)}`,
      detail: overIncome ? `Eso supera los ingresos registrados hasta hoy (${formatMoney(p.incomeSoFar)}).` : `Llevas ${formatMoney(p.spentSoFar)} en ${p.elapsedDays} de ${p.totalDays} días.${ov.totalBudget ? ` Presupuesto total: ${formatMoney(ov.totalBudget)}.` : ''}`,
      explanation: p.explanation,
      amount: p.projectedExpense, link: '/insights',
    },
  ]
}

/** R10 · Posibles movimientos duplicados recientes. */
export function detectDuplicates(data: FinanceData, today: ISODate, days = 45): Transaction[][] {
  const recent = data.transactions.filter((t) => daysBetween(t.date, today) <= days && daysBetween(t.date, today) >= 0)
  const seen = new Set<string>()
  const groups: Transaction[][] = []
  for (const t of recent) {
    if (seen.has(t.id)) continue
    const dups = findPossibleDuplicates(recent, t)
    if (dups.length) {
      const g = [t, ...dups]
      g.forEach((x) => seen.add(x.id))
      groups.push(g)
    }
  }
  return groups
}
const duplicates: Rule = (data, today) => {
  const groups = detectDuplicates(data, today)
  if (!groups.length) return []
  return [
    {
      id: 'duplicates', kind: 'duplicates', severity: 'warning',
      title: `Hay ${groups.length} posible${groups.length === 1 ? '' : 's'} grupo${groups.length === 1 ? '' : 's'} de movimientos duplicados`,
      detail: 'Mismo tipo, fecha, cuenta, valor y descripción parecida en los últimos 45 días. Si son reales, ignóralo.',
      explanation: groups.slice(0, 5).map((g) => `${g[0]!.date} · ${formatMoney(g[0]!.amount)} · «${g[0]!.description || 'sin descripción'}» × ${g.length}`),
      amount: groups.length, link: '/insights',
    },
  ]
}

/** R11 · Gasto inusualmente alto respecto al historial de su categoría. */
const anomalies: Rule = (data, today) => {
  const out: Insight[] = []
  const recent = data.transactions.filter((t) => t.type === 'expense' && daysBetween(t.date, today) >= 0 && daysBetween(t.date, today) <= 14)
  for (const t of recent) {
    const hist = data.transactions.filter((x) => x.type === 'expense' && x.categoryId === t.categoryId && x.id !== t.id && x.date < t.date && daysBetween(x.date, t.date) <= 180).map((x) => x.amount)
    if (hist.length < CFG.anomalyMinSamples) continue
    const mean = hist.reduce((s, v) => s + v, 0) / hist.length
    const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length)
    const median = [...hist].sort((a, b) => a - b)[Math.floor(hist.length / 2)]!
    if (t.amount > mean + CFG.anomalySigma * sd && t.amount > CFG.anomalyMedianMultiple * median) {
      out.push({
        id: `anomaly-${t.id}`, kind: 'anomaly', severity: 'warning',
        title: `Gasto inusual en ${catName(data, t.categoryId).toLowerCase()}: ${formatMoney(t.amount)}`,
        detail: `Es ${(t.amount / median).toFixed(1).replace('.', ',')} veces el gasto típico de esa categoría (${formatMoney(median)}).`,
        explanation: [`Movimiento: ${t.date} · ${t.description || catName(data, t.categoryId)} · ${formatMoney(t.amount)}.`, `Historial de la categoría (${hist.length} movimientos, 180 días): media ${formatMoney(Math.round(mean))}, mediana ${formatMoney(median)}.`, `Supera la media + ${CFG.anomalySigma} desviaciones (${formatMoney(Math.round(mean + CFG.anomalySigma * sd))}) y ${CFG.anomalyMedianMultiple}× la mediana.`],
        amount: t.amount, link: `/gastos?focus=${t.id}`,
      })
    }
  }
  return out.slice(0, 2)
}

/** R12 · Fondo de emergencia (cuentas de ahorro vs. gasto mensual promedio). */
export function emergencyCoverage(data: FinanceData, today: ISODate): { months: number; savings: number; avgExpense: number } | null {
  const months = analysisMonths(data, today, CFG.averageMonths)
  if (months.length < 2) return null
  const sd = data.settings.monthStartDay
  const avgExpense = roundDiv(months.reduce((s, m) => s + summarize(data.transactions, monthRange(m, sd)).expense, 0), months.length)
  if (avgExpense <= 0) return null
  const savingsAccounts = data.accounts.filter((a) => a.type === 'savings' && !a.archivedAt)
  if (!savingsAccounts.length) return null
  const ids = new Set(savingsAccounts.map((a) => a.id))
  let savings = savingsAccounts.reduce((s, a) => s + a.initialBalance, 0)
  for (const t of data.transactions) if (ids.has(t.accountId)) savings += t.type === 'income' ? t.amount : -t.amount
  for (const tr of data.transfers) {
    if (ids.has(tr.toAccountId)) savings += tr.amount
    if (ids.has(tr.fromAccountId)) savings -= tr.amount
  }
  return { months: savings / avgExpense, savings, avgExpense }
}
const emergency: Rule = (data, today) => {
  const e = emergencyCoverage(data, today)
  if (!e) return []
  const m = e.months.toFixed(1).replace('.', ',')
  return [
    {
      id: 'emergency', kind: 'emergency', severity: e.months >= CFG.emergencyMin ? 'positive' : 'info',
      title: `Tus cuentas de ahorro cubren ${m} meses de gastos`,
      detail: e.months >= CFG.emergencyMin ? `Estás dentro del rango recomendado de ${CFG.emergencyMin} a ${CFG.emergencyIdeal} meses.` : `Un fondo de emergencia suele cubrir entre ${CFG.emergencyMin} y ${CFG.emergencyIdeal} meses. Te faltarían ${formatMoney(Math.max(0, e.avgExpense * CFG.emergencyMin - e.savings))} para llegar a ${CFG.emergencyMin}.`,
      explanation: [`Saldo en cuentas de ahorro: ${formatMoney(e.savings)}.`, `Gasto mensual promedio (meses completos): ${formatMoney(e.avgExpense)}.`, `${formatMoney(e.savings)} ÷ ${formatMoney(e.avgExpense)} = ${m} meses.`],
      amount: e.savings, link: '/metas',
    },
  ]
}

const RULES: Rule[] = [budgetAlerts, monthDeficit, categoryChanges, shareOfIncome, reductionPotential, savingsAverage, monthEnd, undetectedRecurring, anomalies, duplicates, subscriptions, emergency]
export { RULES }
