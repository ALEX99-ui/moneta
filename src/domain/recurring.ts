/**
 * Pagos/ingresos periódicos. Las ocurrencias futuras son PREVISTAS: no existen como transacciones
 * y por lo tanto no afectan saldos, presupuestos ni reportes hasta que se registran (`registerPayment`).
 */
import { addDaysISO, addMonthsISO, type DateRange, type ISODate } from './dates'
import type { Frequency, RecurringRule, Transaction } from './types'
import { roundDiv, type Money } from './money'

export const PER_YEAR: Record<Frequency, number> = {
  weekly: 52, biweekly: 26, monthly: 12, bimonthly: 6, quarterly: 4, semiannual: 2, yearly: 1,
}

const MONTH_STEP: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 }

/** Costo mensual equivalente (redondeado al peso). */
export function monthlyEquivalent(amount: Money, f: Frequency): Money {
  return roundDiv(amount * PER_YEAR[f], 12)
}

/** Costo anual proyectado (exacto: monto × pagos por año). */
export function annualCost(amount: Money, f: Frequency): Money {
  return amount * PER_YEAR[f]
}

/** Fecha de la ocurrencia k-ésima contada desde el ancla (sin deriva por meses cortos). */
export function occurrenceAt(anchor: ISODate, f: Frequency, k: number): ISODate {
  if (f === 'weekly') return addDaysISO(anchor, 7 * k)
  if (f === 'biweekly') return addDaysISO(anchor, 14 * k)
  return addMonthsISO(anchor, (MONTH_STEP[f] ?? 1) * k)
}

/** Índice de la primera ocurrencia con fecha >= `date`. */
export function indexOnOrAfter(anchor: ISODate, f: Frequency, date: ISODate): number {
  if (date <= anchor) return 0
  let k = 0
  while (occurrenceAt(anchor, f, k) < date && k < 20000) k++
  return k
}

/** Siguiente ocurrencia estrictamente posterior a la fecha de `occurrence`. */
export function nextAfter(anchor: ISODate, f: Frequency, occurrence: ISODate): ISODate {
  const k = indexOnOrAfter(anchor, f, occurrence)
  return occurrenceAt(anchor, f, k + 1)
}

export interface PlannedEvent {
  rule: RecurringRule
  date: ISODate
  /** true si la fecha ya pasó y aún no se registró ni omitió. */
  overdue: boolean
}

/**
 * Eventos previstos dentro de un rango: ocurrencias de reglas activas desde su próxima fecha de pago.
 * Excluye las que ya fueron registradas como transacción.
 */
export function plannedEvents(rules: readonly RecurringRule[], transactions: readonly Transaction[], range: DateRange, today: ISODate): PlannedEvent[] {
  const registered = new Set(transactions.filter((t) => t.recurringRuleId && t.occurrenceDate).map((t) => `${t.recurringRuleId}|${t.occurrenceDate}`))
  const out: PlannedEvent[] = []
  for (const rule of rules) {
    if (rule.status !== 'active' || rule.archivedAt) continue
    let k = indexOnOrAfter(rule.anchorDate, rule.frequency, rule.nextDueDate)
    for (let guard = 0; guard < 2000; guard++, k++) {
      const date = occurrenceAt(rule.anchorDate, rule.frequency, k)
      if (date > range.to) break
      if (date < range.from) continue
      if (registered.has(`${rule.id}|${date}`)) continue
      out.push({ rule, date, overdue: date < today })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rule.name.localeCompare(b.rule.name)))
}

/** Suma de pagos previstos aún no registrados en un rango (gastos). */
export function plannedTotal(events: readonly PlannedEvent[], kind: 'expense' | 'income'): Money {
  return events.filter((e) => e.rule.kind === kind).reduce((s, e) => s + e.rule.amount, 0)
}

/** Reglas vencidas (próximo pago anterior a hoy) y activas. */
export function overdueRules(rules: readonly RecurringRule[], today: ISODate): RecurringRule[] {
  return rules.filter((r) => r.status === 'active' && !r.archivedAt && r.nextDueDate < today)
}
