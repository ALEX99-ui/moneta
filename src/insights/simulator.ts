import { monthRange, type ISODate } from '@/domain/dates'
import { summarize, totalsByCategory } from '@/domain/ledger'
import { percentOf, roundDiv } from '@/domain/money'
import type { FinanceData } from '@/domain/types'
import { INSIGHT_CONFIG as CFG } from './config'
import { analysisMonths } from './helpers'

export interface Simulation {
  categoryId: string
  percent: number
  monthsUsed: string[]
  avgMonthly: number
  monthlySaving: number
  annualSaving: number
  /** Efecto sobre la tasa de ahorro promedio, si hay ingresos. */
  newSavingsRate: number | null
  currentSavingsRate: number | null
}

/**
 * «¿Cuánto ahorraría si reduzco este gasto?» Usa el promedio mensual real de los últimos meses completos.
 * Devuelve null si no hay historial para esa categoría.
 */
export function simulateReduction(data: FinanceData, categoryId: string, percent: number, today: ISODate): Simulation | null {
  const months = analysisMonths(data, today, CFG.averageMonths)
  if (!months.length) return null
  const sd = data.settings.monthStartDay
  let total = 0
  let income = 0
  let net = 0
  for (const m of months) {
    const r = monthRange(m, sd)
    total += totalsByCategory(data.transactions, r, 'expense').find((c) => c.categoryId === categoryId)?.amount ?? 0
    const s = summarize(data.transactions, r)
    income += s.income
    net += s.net
  }
  if (total === 0) return null
  const avg = roundDiv(total, months.length)
  const monthly = percentOf(avg, percent)
  const avgIncome = income / months.length
  return {
    categoryId, percent, monthsUsed: months, avgMonthly: avg, monthlySaving: monthly, annualSaving: monthly * 12,
    currentSavingsRate: income > 0 ? net / income : null,
    newSavingsRate: income > 0 ? (net / months.length + monthly) / avgIncome : null,
  }
}
