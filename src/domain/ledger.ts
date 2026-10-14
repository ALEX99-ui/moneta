/**
 * Lógica financiera central: saldos y agregados.
 * Dashboard, reportes, presupuestos e insights usan EXCLUSIVAMENTE estas funciones, de modo que
 * siempre concilian con los movimientos registrados.
 *
 * Reglas:
 *  - Ingreso suma a su cuenta; gasto resta.
 *  - Transferencia resta de origen y suma a destino: patrimonio total sin cambio, y NO es ingreso ni gasto.
 *  - Aportes/retiros de metas no alteran saldos ni ingresos/gastos (son asignaciones virtuales).
 *  - Solo existen movimientos confirmados; los pagos previstos viven en `RecurringRule`.
 */
import { inRange, type DateRange, type ISODate, type MonthKey, monthRange, monthKeyOf, addMonthKey } from './dates'
import type { Account, Category, FinanceData, Transaction } from './types'
import type { Money } from './money'

/** Saldo de cada cuenta (id → saldo), opcionalmente a una fecha (inclusive). El saldo inicial siempre cuenta. */
export function accountBalances(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>, asOf?: ISODate): Map<string, Money> {
  const bal = new Map<string, Money>()
  for (const a of data.accounts) bal.set(a.id, a.initialBalance)
  for (const t of data.transactions) {
    if (asOf && t.date > asOf) continue
    bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + (t.type === 'income' ? t.amount : -t.amount))
  }
  for (const tr of data.transfers) {
    if (asOf && tr.date > asOf) continue
    bal.set(tr.fromAccountId, (bal.get(tr.fromAccountId) ?? 0) - tr.amount)
    bal.set(tr.toAccountId, (bal.get(tr.toAccountId) ?? 0) + tr.amount)
  }
  return bal
}

export function accountBalance(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>, accountId: string, asOf?: ISODate): Money {
  return accountBalances(data, asOf).get(accountId) ?? 0
}

/** Dinero total en cuentas activas. */
export function totalBalance(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>, asOf?: ISODate): Money {
  const bal = accountBalances(data, asOf)
  let s = 0
  for (const a of data.accounts) if (!a.archivedAt) s += bal.get(a.id) ?? 0
  return s
}

/** Patrimonio en cuentas incluyendo las archivadas (para series históricas). */
export function netWorth(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>, asOf?: ISODate): Money {
  let s = 0
  for (const v of accountBalances(data, asOf).values()) s += v
  return s
}

/** Dinero asignado actualmente a metas (aportes − retiros). Es una asignación virtual, no un gasto. */
export function allocatedToGoals(data: Pick<FinanceData, 'contributions'>, range?: DateRange): Money {
  let s = 0
  for (const c of data.contributions) {
    if (range && !inRange(c.date, range)) continue
    s += c.kind === 'deposit' ? c.amount : -c.amount
  }
  return s
}

export interface PeriodSummary {
  income: Money
  expense: Money
  /** Ahorro neto = ingresos − gastos del período (sin transferencias ni aportes a metas). */
  net: Money
  /** net / income, o null si no hubo ingresos (evita porcentajes engañosos). */
  savingsRate: number | null
  txCount: number
}

export function txInRange(transactions: readonly Transaction[], range: DateRange): Transaction[] {
  return transactions.filter((t) => inRange(t.date, range))
}

export function summarize(transactions: readonly Transaction[], range: DateRange): PeriodSummary {
  let income = 0
  let expense = 0
  let txCount = 0
  for (const t of transactions) {
    if (!inRange(t.date, range)) continue
    txCount++
    if (t.type === 'income') income += t.amount
    else expense += t.amount
  }
  const net = income - expense
  return { income, expense, net, savingsRate: income > 0 ? net / income : null, txCount }
}

export interface CategoryTotal {
  categoryId: string
  amount: Money
  count: number
  /** Fracción (0-1) sobre el total del tipo en el rango. */
  share: number
}

export function totalsByCategory(transactions: readonly Transaction[], range: DateRange, type: 'income' | 'expense'): CategoryTotal[] {
  const map = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of transactions) {
    if (t.type !== type || !inRange(t.date, range)) continue
    const e = map.get(t.categoryId) ?? { amount: 0, count: 0 }
    e.amount += t.amount
    e.count++
    map.set(t.categoryId, e)
    total += t.amount
  }
  return [...map.entries()]
    .map(([categoryId, e]) => ({ categoryId, amount: e.amount, count: e.count, share: total ? e.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export interface MonthPoint extends PeriodSummary {
  month: MonthKey
}

export function monthlySeries(transactions: readonly Transaction[], months: readonly MonthKey[], startDay = 1): MonthPoint[] {
  return months.map((month) => ({ month, ...summarize(transactions, monthRange(month, startDay)) }))
}

/** Últimos `n` meses terminando en `endMonth` (inclusive). */
export function lastMonths(endMonth: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, i) => addMonthKey(endMonth, i - (n - 1)))
}

export interface BalancePoint {
  date: ISODate
  /** Patrimonio en cuentas al cierre de `date`. */
  balance: Money
}

/** Evolución del balance total al cierre de cada fecha pedida. */
export function balanceSeries(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>, dates: readonly ISODate[]): BalancePoint[] {
  const sorted = [...dates].sort()
  const initial = data.accounts.reduce((s, a) => s + a.initialBalance, 0)
  // Solo los ingresos/gastos cambian el patrimonio; las transferencias se anulan entre sí.
  const events = data.transactions.map((t) => ({ date: t.date, delta: t.type === 'income' ? t.amount : -t.amount })).sort((a, b) => (a.date < b.date ? -1 : 1))
  const out: BalancePoint[] = []
  let i = 0
  let running = initial
  for (const d of sorted) {
    while (i < events.length && events[i]!.date <= d) running += events[i++]!.delta
    out.push({ date: d, balance: running })
  }
  return out
}

/** Control de conciliación: la suma de saldos debe igualar saldos iniciales + ingresos − gastos. */
export function reconcile(data: Pick<FinanceData, 'accounts' | 'transactions' | 'transfers'>): { ok: boolean; expected: Money; actual: Money } {
  const expected = data.accounts.reduce((s, a) => s + a.initialBalance, 0) + data.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)
  return { ok: expected === netWorth(data), expected, actual: netWorth(data) }
}

export function categoryMap(categories: readonly Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}

export function accountMap(accounts: readonly Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]))
}

/** Mes financiero actual según la fecha dada. */
export function currentMonth(today: ISODate, startDay = 1): MonthKey {
  return monthKeyOf(today, startDay)
}
