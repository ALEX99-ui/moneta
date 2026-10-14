import type { ISODate } from '@/domain/dates'
import type { FinanceData } from '@/domain/types'
import { analysisMonths } from './helpers'
import { RULES, type Insight, type Severity } from './rules'

export type { Insight, Severity } from './rules'
export { detectDuplicates, emergencyCoverage } from './rules'
export { projectMonthEnd } from './projection'
export { financialHealth } from './health'
export { simulateReduction } from './simulator'
export { essentialSplit } from './health'

const ORDER: Record<Severity, number> = { alert: 0, warning: 1, info: 2, positive: 3 }

export interface InsightsResult {
  insights: Insight[]
  /** true si todavía no hay historial suficiente para comparar meses. */
  limitedData: boolean
  completeMonths: number
}

/**
 * Motor de recomendaciones 100 % local: reglas y estadística simple sobre las transacciones reales.
 * Cada recomendación incluye los pasos de cálculo; si faltan datos, la regla simplemente no se emite.
 */
export function generateInsights(data: FinanceData, today: ISODate): InsightsResult {
  const completeMonths = analysisMonths(data, today, 3).length
  const insights = RULES.flatMap((r) => r(data, today)).sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return { insights, limitedData: completeMonths < 2, completeMonths }
}
