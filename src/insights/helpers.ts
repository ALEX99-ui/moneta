import { addDaysISO, addMonthKey, daysBetween, monthKeyOf, monthRange, type DateRange, type ISODate, type MonthKey } from '@/domain/dates'
import { summarize, totalsByCategory } from '@/domain/ledger'
import type { FinanceData } from '@/domain/types'
import { norm } from '@/domain/filters'

export function pctText(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits).replace('.', ',')}%`
}

export function earliestDate(data: Pick<FinanceData, 'transactions'>): ISODate | null {
  let e: ISODate | null = null
  for (const t of data.transactions) if (!e || t.date < e) e = t.date
  return e
}

/**
 * Últimos `n` meses financieros COMPLETOS con datos confiables: no incluye el mes actual ni meses anteriores
 * al primer movimiento (un mes en el que el usuario empezó a mitad de camino se descarta).
 */
export function analysisMonths(data: Pick<FinanceData, 'transactions' | 'settings'>, today: ISODate, n: number): MonthKey[] {
  const sd = data.settings.monthStartDay
  const first = earliestDate(data)
  if (!first) return []
  const current = monthKeyOf(today, sd)
  const firstKey = monthKeyOf(first, sd)
  const firstRange = monthRange(firstKey, sd)
  const firstUsable = daysBetween(firstRange.from, first) <= 6 ? firstKey : addMonthKey(firstKey, 1)
  const out: MonthKey[] = []
  for (let i = 1; i <= n; i++) {
    const k = addMonthKey(current, -i)
    if (k >= firstUsable) out.unshift(k)
  }
  return out
}

export interface PeriodPair {
  cur: DateRange
  prev: DateRange
  curLabel: string
  prevLabel: string
  /** Días comparados. */
  days: number
  curMonth: MonthKey
  prevMonth: MonthKey
  /** true si se compara el mes en curso contra el mismo punto del anterior. */
  partial: boolean
}

/**
 * Par de períodos para comparar. Mitad de mes: mes actual hasta hoy vs. el mismo tramo del anterior.
 * Inicio de mes (pocos días): el último mes completo vs. el anterior a ese.
 */
export function comparisonPair(data: Pick<FinanceData, 'transactions' | 'settings'>, today: ISODate, minElapsed: number): PeriodPair | null {
  const sd = data.settings.monthStartDay
  const curMonth = monthKeyOf(today, sd)
  const curFull = monthRange(curMonth, sd)
  const elapsed = daysBetween(curFull.from, today) + 1
  const first = earliestDate(data)
  if (!first) return null
  if (elapsed >= minElapsed) {
    const prevMonth = addMonthKey(curMonth, -1)
    if (monthKeyOf(first, sd) > prevMonth) return null // no existe un mes anterior con datos
    const prevFull = monthRange(prevMonth, sd)
    const prevTo = addDaysISO(prevFull.from, elapsed - 1)
    return {
      cur: { from: curFull.from, to: today }, prev: { from: prevFull.from, to: prevTo > prevFull.to ? prevFull.to : prevTo },
      curLabel: 'Este mes', prevLabel: 'el mes anterior', days: elapsed, curMonth, prevMonth, partial: true,
    }
  }
  const m1 = addMonthKey(curMonth, -1)
  const m2 = addMonthKey(curMonth, -2)
  if (monthKeyOf(first, sd) > m2) return null
  return { cur: monthRange(m1, sd), prev: monthRange(m2, sd), curLabel: 'El mes pasado', prevLabel: 'el anterior', days: 0, curMonth: m1, prevMonth: m2, partial: false }
}

export function spendByCategory(data: Pick<FinanceData, 'transactions'>, range: DateRange): Map<string, number> {
  return new Map(totalsByCategory(data.transactions, range, 'expense').map((c) => [c.categoryId, c.amount]))
}

export { summarize, norm }
