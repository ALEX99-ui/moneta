import { DomainError } from '@/db/types'
import type { Stmt } from '@/db/types'
import { loadAll } from '@/db/repositories'
import { addMonthKey, type MonthKey } from '@/domain/dates'
import { effectiveBudget } from '@/domain/budgets'
import { nextAfter } from '@/domain/recurring'
import { budgetSchema, contributionSchema, goalSchema, ruleSchema, settingsSchema, type BudgetInput, type ContributionInput, type GoalInput, type RuleInput, type SettingsInput } from '@/validation/schemas'
import { one, parse, type ServiceContext } from './context'

export function budgetService(ctx: ServiceContext) {
  return {
    /** amount = null elimina el presupuesto. month = 'default' aplica a todos los meses. */
    async set(input: BudgetInput): Promise<void> {
      const d = parse(budgetSchema, input)
      const cat = await one<{ kind: string }>(ctx, 'SELECT kind FROM categories WHERE id = ?', [d.categoryId])
      if (!cat) throw new DomainError('La categoría no existe')
      if (cat.kind !== 'expense') throw new DomainError('Solo las categorías de gasto tienen presupuesto')
      if (d.amount === null) {
        await ctx.db.execute('DELETE FROM budgets WHERE category_id = ? AND month = ?', [d.categoryId, d.month])
        return
      }
      await ctx.db.execute(
        'INSERT INTO budgets (id,category_id,month,amount) VALUES (?,?,?,?) ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount',
        [ctx.newId(), d.categoryId, d.month, d.amount],
      )
    },
    /** Fija en `to` los presupuestos efectivos de `from` (útil para planear un mes nuevo). */
    async copyMonth(from: MonthKey, to: MonthKey): Promise<number> {
      const data = await loadAll(ctx.db)
      const stmts: Stmt[] = []
      for (const c of data.categories) {
        if (c.kind !== 'expense' || c.archivedAt) continue
        const eff = effectiveBudget(data.budgets, c.id, from)
        if (!eff) continue
        stmts.push({
          sql: 'INSERT INTO budgets (id,category_id,month,amount) VALUES (?,?,?,?) ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount',
          params: [ctx.newId(), c.id, to, eff.amount],
        })
      }
      if (stmts.length) await ctx.db.batch(stmts)
      return stmts.length
    },
    previousMonth: (m: MonthKey) => addMonthKey(m, -1),
  }
}

export function goalService(ctx: ServiceContext) {
  return {
    async create(input: GoalInput): Promise<string> {
      const d = parse(goalSchema, input)
      const id = d.id ?? ctx.newId()
      await ctx.db.execute(
        'INSERT INTO savings_goals (id,name,description,target_amount,target_date,account_id,color,icon,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, d.name, d.description, d.targetAmount, d.targetDate, d.accountId, d.color, d.icon, ctx.now()],
      )
      return id
    },
    async update(id: string, input: GoalInput): Promise<void> {
      const d = parse(goalSchema, input)
      const r = await ctx.db.execute(
        'UPDATE savings_goals SET name=?, description=?, target_amount=?, target_date=?, account_id=?, color=?, icon=? WHERE id=?',
        [d.name, d.description, d.targetAmount, d.targetDate, d.accountId, d.color, d.icon, id],
      )
      if (!r.changes) throw new DomainError('La meta no existe')
    },
    async archive(id: string): Promise<void> {
      await ctx.db.execute('UPDATE savings_goals SET archived_at = ? WHERE id = ?', [ctx.now(), id])
    },
    async unarchive(id: string): Promise<void> {
      await ctx.db.execute('UPDATE savings_goals SET archived_at = NULL WHERE id = ?', [id])
    },
    /**
     * Aporte o retiro de una meta. Es una ASIGNACIÓN virtual del dinero ya existente:
     * no crea ingresos ni gastos y no modifica el saldo de ninguna cuenta.
     */
    async contribute(input: ContributionInput): Promise<string> {
      const d = parse(contributionSchema(ctx.today()), input)
      const goal = await one<{ id: string; archived_at: string | null }>(ctx, 'SELECT id, archived_at FROM savings_goals WHERE id = ?', [d.goalId])
      if (!goal) throw new DomainError('La meta no existe')
      if (goal.archived_at) throw new DomainError('La meta está archivada')
      if (d.kind === 'withdrawal') {
        const rows = await ctx.db.select<{ kind: string; amount: number }>('SELECT kind, amount FROM goal_contributions WHERE goal_id = ?', [d.goalId])
        const saved = rows.reduce((s, r) => s + (r.kind === 'deposit' ? r.amount : -r.amount), 0)
        if (d.amount > saved) throw new DomainError('El retiro supera lo ahorrado en la meta')
      }
      const id = ctx.newId()
      await ctx.db.execute('INSERT INTO goal_contributions (id,goal_id,kind,amount,date,note,created_at) VALUES (?,?,?,?,?,?,?)', [id, d.goalId, d.kind, d.amount, d.date, d.note, ctx.now()])
      return id
    },
    async removeContribution(id: string): Promise<void> {
      const r = await ctx.db.execute('DELETE FROM goal_contributions WHERE id = ?', [id])
      if (!r.changes) throw new DomainError('El aporte no existe')
    },
  }
}

export function recurringService(ctx: ServiceContext) {
  async function validate(input: RuleInput) {
    const d = parse(ruleSchema, input)
    const cat = await one<{ kind: string; archived_at: string | null }>(ctx, 'SELECT kind, archived_at FROM categories WHERE id = ?', [d.categoryId])
    if (!cat) throw new DomainError('La categoría no existe')
    if (cat.kind !== d.kind) throw new DomainError('La categoría no corresponde al tipo')
    const acc = await one<{ archived_at: string | null }>(ctx, 'SELECT archived_at FROM accounts WHERE id = ?', [d.accountId])
    if (!acc) throw new DomainError('La cuenta no existe')
    return d
  }
  return {
    async create(input: RuleInput): Promise<string> {
      const d = await validate(input)
      const id = d.id ?? ctx.newId()
      const now = ctx.now()
      await ctx.db.execute(
        `INSERT INTO recurring_rules (id,name,kind,is_subscription,amount,frequency,anchor_date,next_due_date,category_id,account_id,status,notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`,
        [id, d.name, d.kind, d.isSubscription ? 1 : 0, d.amount, d.frequency, d.nextDueDate, d.nextDueDate, d.categoryId, d.accountId, d.notes, now, now],
      )
      return id
    },
    /** Cambiar frecuencia o próxima fecha reancla la serie en la nueva fecha. */
    async update(id: string, input: RuleInput): Promise<void> {
      const d = await validate(input)
      const cur = await one<{ frequency: string; next_due_date: string; anchor_date: string }>(ctx, 'SELECT * FROM recurring_rules WHERE id = ?', [id])
      if (!cur) throw new DomainError('El pago periódico no existe')
      const reanchor = cur.frequency !== d.frequency || cur.next_due_date !== d.nextDueDate
      await ctx.db.execute(
        `UPDATE recurring_rules SET name=?, kind=?, is_subscription=?, amount=?, frequency=?, anchor_date=?, next_due_date=?, category_id=?, account_id=?, notes=?, updated_at=? WHERE id=?`,
        [d.name, d.kind, d.isSubscription ? 1 : 0, d.amount, d.frequency, reanchor ? d.nextDueDate : cur.anchor_date, d.nextDueDate, d.categoryId, d.accountId, d.notes, ctx.now(), id],
      )
    },
    async setStatus(id: string, status: 'active' | 'paused'): Promise<void> {
      await ctx.db.execute('UPDATE recurring_rules SET status = ?, updated_at = ? WHERE id = ?', [status, ctx.now(), id])
    },
    async archive(id: string): Promise<void> {
      await ctx.db.execute('UPDATE recurring_rules SET archived_at = ?, status = ?, updated_at = ? WHERE id = ?', [ctx.now(), 'paused', ctx.now(), id])
    },
    /**
     * Convierte la próxima ocurrencia PREVISTA en una transacción CONFIRMADA y avanza la regla,
     * todo en una sola transacción de base de datos. El índice único (regla, ocurrencia) impide duplicados.
     */
    async registerPayment(id: string, opts: { date?: string; amount?: number } = {}): Promise<string> {
      const rule = await one<Record<string, any>>(ctx, 'SELECT * FROM recurring_rules WHERE id = ? AND archived_at IS NULL', [id])
      if (!rule) throw new DomainError('El pago periódico no existe')
      const date = opts.date ?? ctx.today()
      if (date > ctx.today()) throw new DomainError('La fecha de pago no puede ser futura')
      const amount = opts.amount ?? rule.amount
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('Monto inválido')
      const txId = ctx.newId()
      const now = ctx.now()
      await ctx.db.batch([
        {
          sql: `INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,is_recurring,recurring_rule_id,occurrence_date,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`,
          params: [txId, rule.kind, amount, date, rule.account_id, rule.category_id, rule.name, id, rule.next_due_date, now, now],
        },
        {
          sql: 'UPDATE recurring_rules SET next_due_date = ?, updated_at = ? WHERE id = ?',
          params: [nextAfter(rule.anchor_date, rule.frequency, rule.next_due_date), now, id],
        },
      ])
      return txId
    },
    /** Omite la próxima ocurrencia sin registrar nada (p. ej. no se cobró este mes). */
    async skipNext(id: string): Promise<void> {
      const rule = await one<Record<string, any>>(ctx, 'SELECT * FROM recurring_rules WHERE id = ?', [id])
      if (!rule) throw new DomainError('El pago periódico no existe')
      await ctx.db.execute('UPDATE recurring_rules SET next_due_date = ?, updated_at = ? WHERE id = ?', [nextAfter(rule.anchor_date, rule.frequency, rule.next_due_date), ctx.now(), id])
    },
  }
}

const SETTING_KEYS: Record<keyof SettingsInput, string> = {
  profileName: 'profile_name', dateFormat: 'date_format', monthStartDay: 'month_start_day', theme: 'theme',
  autoBackup: 'auto_backup', autoBackupKeep: 'auto_backup_keep', backupDir: 'backup_dir',
}

export function settingsService(ctx: ServiceContext) {
  return {
    async update(patch: Partial<SettingsInput>): Promise<void> {
      const current = (await loadAll(ctx.db)).settings
      const merged = parse(settingsSchema, { ...current, ...patch })
      const stmts: Stmt[] = (Object.keys(patch) as (keyof SettingsInput)[]).map((k) => ({
        sql: 'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        params: [SETTING_KEYS[k], typeof merged[k] === 'boolean' ? (merged[k] ? '1' : '0') : String(merged[k])],
      }))
      if (stmts.length) await ctx.db.batch(stmts)
    },
    async saveFilter(scope: 'expense' | 'income', name: string, filter: unknown): Promise<string> {
      const n = name.trim()
      if (!n) throw new DomainError('Ingresa un nombre para el filtro')
      const id = ctx.newId()
      await ctx.db.execute('INSERT INTO saved_filters (id,name,scope,filter,created_at) VALUES (?,?,?,?,?)', [id, n.slice(0, 60), scope, JSON.stringify(filter), ctx.now()])
      return id
    },
    async deleteFilter(id: string): Promise<void> {
      await ctx.db.execute('DELETE FROM saved_filters WHERE id = ?', [id])
    },
  }
}
