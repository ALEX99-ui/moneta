import { daysBetween, monthKeyOf, monthRange, type ISODate } from '@/domain/dates'
import { summarize } from '@/domain/ledger'
import { plannedEvents, plannedTotal } from '@/domain/recurring'
import type { FinanceData } from '@/domain/types'
import { formatMoney } from '@/domain/money'
import { INSIGHT_CONFIG } from './config'

export interface MonthProjection {
  /** null cuando aún no hay datos suficientes para proyectar. */
  enough: boolean
  elapsedDays: number
  totalDays: number
  spentSoFar: number
  variableDaily: number
  pendingPlanned: number
  projectedExpense: number
  incomeSoFar: number
  projectedNet: number
  explanation: string[]
}

/**
 * Proyección sencilla de cierre del mes:
 *   gasto proyectado = gastado a hoy + (gasto variable diario × días restantes) + pagos previstos aún no registrados.
 * El gasto variable excluye pagos ligados a suscripciones/recurrentes ya registrados, para no contarlos dos veces.
 */
export function projectMonthEnd(data: FinanceData, today: ISODate): MonthProjection {
  const sd = data.settings.monthStartDay
  const month = monthKeyOf(today, sd)
  const range = monthRange(month, sd)
  const totalDays = daysBetween(range.from, range.to) + 1
  const elapsed = Math.min(totalDays, daysBetween(range.from, today) + 1)
  const sofar = summarize(data.transactions, { from: range.from, to: today })
  const recurringSpent = data.transactions.filter((t) => t.type === 'expense' && t.recurringRuleId && t.date >= range.from && t.date <= today).reduce((s, t) => s + t.amount, 0)
  const variable = sofar.expense - recurringSpent
  const remaining = totalDays - elapsed
  const variableDaily = elapsed > 0 ? Math.round(variable / elapsed) : 0
  // Previstos del mes (vencidos o futuros) que todavía no se han registrado como transacción.
  const pendingPlanned = plannedTotal(plannedEvents(data.rules, data.transactions, range, today), 'expense')
  const projectedExpense = sofar.expense + variableDaily * remaining + pendingPlanned
  const enough = elapsed >= INSIGHT_CONFIG.minElapsedDays && sofar.expense > 0
  return {
    enough, elapsedDays: elapsed, totalDays, spentSoFar: sofar.expense, variableDaily, pendingPlanned, projectedExpense,
    incomeSoFar: sofar.income, projectedNet: sofar.income - projectedExpense,
    explanation: [
      `Gastado en ${elapsed} de ${totalDays} días: ${formatMoney(sofar.expense)} (de los cuales ${formatMoney(recurringSpent)} son pagos recurrentes ya registrados).`,
      `Gasto variable diario: ${formatMoney(variable)} ÷ ${elapsed} días = ${formatMoney(variableDaily)} por día.`,
      `Días restantes: ${remaining} × ${formatMoney(variableDaily)} = ${formatMoney(variableDaily * remaining)}.`,
      `Pagos previstos aún sin registrar este mes: ${formatMoney(pendingPlanned)}.`,
      `Total proyectado: ${formatMoney(sofar.expense)} + ${formatMoney(variableDaily * remaining)} + ${formatMoney(pendingPlanned)} = ${formatMoney(projectedExpense)}.`,
    ],
  }
}
