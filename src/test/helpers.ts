import { createNodeDb, type NodeDb } from '@/db/nodeSqliteDb'
import { loadAll } from '@/db/repositories'
import { createServices } from '@/services'
import { defaultContext } from '@/services/context'
import type { FinanceData } from '@/domain/types'

export const CASH = 'acc_cash'
export const FOOD = 'cat_alimentacion'
export const TRANSPORT = 'cat_transporte'
export const ENTERTAINMENT = 'cat_entretenimiento'
export const SUBS = 'cat_suscripciones'
export const SALARY = 'cat_ing_salario'
export const FREELANCE = 'cat_ing_independiente'

/** Entorno de pruebas: SQLite real en memoria con las migraciones reales y un reloj fijo. */
export function setup(today = '2025-06-15') {
  const db: NodeDb = createNodeDb()
  let current = new Date(`${today}T12:00:00`)
  const s = createServices(db, defaultContext(db, () => current))
  return {
    db,
    s,
    load: (): Promise<FinanceData> => loadAll(db),
    setToday(d: string) {
      current = new Date(`${d}T12:00:00`)
    },
    async bank(initial = 0, name = 'Banco') {
      return s.accounts.create({ name, type: 'bank', initialBalance: initial })
    },
    async expense(amount: number, date: string, extra: Record<string, unknown> = {}) {
      return s.transactions.create({ type: 'expense', amount, date, accountId: CASH, categoryId: FOOD, description: 'gasto', ...extra })
    },
    async income(amount: number, date: string, extra: Record<string, unknown> = {}) {
      return s.transactions.create({ type: 'income', amount, date, accountId: CASH, categoryId: SALARY, description: 'ingreso', ...extra })
    },
  }
}
