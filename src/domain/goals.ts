import { addDaysISO, addMonthsISO, daysBetween, type ISODate } from './dates'
import type { Contribution, Goal } from './types'
import { formatMoney, type Money } from './money'

export interface GoalProgress {
  saved: Money
  remaining: Money
  /** 0-100 (tope 100). */
  percent: number
  completed: boolean
  /** Ritmo mensual medio de los últimos 90 días, o null si no hay datos suficientes. */
  monthlyPace: Money | null
  /** Fecha estimada de cumplimiento al ritmo actual. */
  eta: ISODate | null
  /** Aporte mensual necesario para llegar a la fecha objetivo. */
  requiredMonthly: Money | null
  /** ¿El ritmo actual alcanza para la fecha objetivo? null si no se puede evaluar. */
  onTrack: boolean | null
  /** Mensaje explicativo de la proyección. */
  note: string
}

export function goalSaved(contributions: readonly Contribution[], goalId: string): Money {
  let s = 0
  for (const c of contributions) if (c.goalId === goalId) s += c.kind === 'deposit' ? c.amount : -c.amount
  return s
}

const PACE_WINDOW_DAYS = 90

export function goalProgress(goal: Goal, contributions: readonly Contribution[], today: ISODate): GoalProgress {
  const mine = contributions.filter((c) => c.goalId === goal.id)
  const saved = goalSaved(mine, goal.id)
  const remaining = Math.max(0, goal.targetAmount - saved)
  const percent = Math.min(100, (Math.max(saved, 0) / goal.targetAmount) * 100)
  const completed = saved >= goal.targetAmount

  // Ritmo: aportes netos de los últimos 90 días ÷ 3. Requiere al menos 2 movimientos o 30 días de historia.
  const windowStart = addDaysISO(today, -PACE_WINDOW_DAYS)
  const recent = mine.filter((c) => c.date > windowStart && c.date <= today)
  const firstDate = mine.length ? mine.reduce((m, c) => (c.date < m ? c.date : m), mine[0]!.date) : null
  const history = firstDate ? daysBetween(firstDate, today) : 0
  const enough = recent.some((c) => c.kind === 'deposit') && (recent.length >= 2 || history >= 30)
  let monthlyPace: Money | null = null
  if (enough) {
    const net = recent.reduce((s, c) => s + (c.kind === 'deposit' ? c.amount : -c.amount), 0)
    // Si hay menos de 90 días de historia, se promedia sobre el tiempo transcurrido (mín. 1 mes).
    const months = Math.max(1, Math.min(PACE_WINDOW_DAYS, history) / 30)
    monthlyPace = Math.max(0, Math.round(net / months))
  }

  let eta: ISODate | null = null
  if (!completed && monthlyPace && monthlyPace > 0) {
    eta = addMonthsISO(today, Math.ceil(remaining / monthlyPace))
  }

  let requiredMonthly: Money | null = null
  let onTrack: boolean | null = null
  if (!completed && goal.targetDate) {
    if (goal.targetDate <= today) {
      requiredMonthly = remaining
    } else {
      const months = Math.max(1, (daysBetween(today, goal.targetDate)) / 30)
      requiredMonthly = Math.ceil(remaining / months)
    }
    if (monthlyPace !== null && monthlyPace >= 0) onTrack = monthlyPace >= requiredMonthly
  }

  let note: string
  if (completed) note = '¡Meta cumplida!'
  else if (monthlyPace === null) note = 'Aún no hay suficientes aportes para proyectar (se necesitan al menos 2 aportes o 30 días de historial).'
  else if (monthlyPace === 0) note = 'Sin aportes recientes: al ritmo actual la meta no avanza.'
  else note = `Al ritmo de los últimos 90 días (${formatMoney(monthlyPace)} al mes) la meta se cumpliría`

  return { saved, remaining, percent, completed, monthlyPace, eta, requiredMonthly, onTrack, note }
}
