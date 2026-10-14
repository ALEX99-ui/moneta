import { type MonthKey, monthRange, inRange } from './dates'
import type { Budget, Category, FinanceData, Transaction } from './types'
import type { Money } from './money'

export type BudgetStatus = 'normal' | 'near' | 'exceeded'

/** Umbral de "cerca del límite" (80 %). */
export const NEAR_LIMIT = 0.8

export function budgetStatus(spent: Money, budget: Money): BudgetStatus {
  if (budget <= 0) return spent > 0 ? 'exceeded' : 'normal'
  const ratio = spent / budget
  if (ratio > 1) return 'exceeded'
  if (ratio >= NEAR_LIMIT) return 'near'
  return 'normal'
}

/** Presupuesto efectivo de una categoría en un mes: el específico del mes, o si no existe, el predeterminado. */
export function effectiveBudget(budgets: readonly Budget[], categoryId: string, month: MonthKey): { amount: Money; source: 'month' | 'default' } | null {
  const specific = budgets.find((b) => b.categoryId === categoryId && b.month === month)
  if (specific) return { amount: specific.amount, source: 'month' }
  const def = budgets.find((b) => b.categoryId === categoryId && b.month === 'default')
  return def ? { amount: def.amount, source: 'default' } : null
}

export interface BudgetRow {
  category: Category
  budget: Money
  source: 'month' | 'default'
  spent: Money
  remaining: Money
  /** Fracción usada (0-∞). */
  used: number
  status: BudgetStatus
}

export interface BudgetOverview {
  month: MonthKey
  rows: BudgetRow[]
  totalBudget: Money
  /** Gasto SOLO de las categorías con presupuesto. */
  totalSpentBudgeted: Money
  remaining: Money
  /** Gasto del mes en categorías sin presupuesto. */
  unbudgetedSpent: Money
  used: number
  status: BudgetStatus
}

function spentByCategory(transactions: readonly Transaction[], month: MonthKey, startDay: number): Map<string, Money> {
  const range = monthRange(month, startDay)
  const m = new Map<string, Money>()
  for (const t of transactions) {
    if (t.type !== 'expense' || !inRange(t.date, range)) continue
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)
  }
  return m
}

/** Presupuestos del mes calculados según su período financiero y categoría. */
export function budgetOverview(data: Pick<FinanceData, 'categories' | 'budgets' | 'transactions'>, month: MonthKey, startDay = 1): BudgetOverview {
  const spent = spentByCategory(data.transactions, month, startDay)
  const rows: BudgetRow[] = []
  for (const category of data.categories) {
    if (category.kind !== 'expense') continue
    const eff = effectiveBudget(data.budgets, category.id, month)
    if (!eff) continue
    if (category.archivedAt && !spent.get(category.id)) continue
    const s = spent.get(category.id) ?? 0
    rows.push({
      category, budget: eff.amount, source: eff.source, spent: s, remaining: eff.amount - s,
      used: eff.amount ? s / eff.amount : 0, status: budgetStatus(s, eff.amount),
    })
  }
  rows.sort((a, b) => b.used - a.used)
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalSpentBudgeted = rows.reduce((s, r) => s + r.spent, 0)
  let totalSpent = 0
  for (const v of spent.values()) totalSpent += v
  return {
    month, rows, totalBudget, totalSpentBudgeted, remaining: totalBudget - totalSpentBudgeted,
    unbudgetedSpent: totalSpent - totalSpentBudgeted,
    used: totalBudget ? totalSpentBudgeted / totalBudget : 0,
    status: rows.length ? budgetStatus(totalSpentBudgeted, totalBudget) : 'normal',
  }
}
