import { DomainError } from '@/db/types'
import type { Stmt } from '@/db/types'
import { nextAfter } from '@/domain/recurring'
import { transactionSchema, transferSchema, type TransactionInput, type TransferInput } from '@/validation/schemas'
import { one, parse, tagStatements, type ServiceContext } from './context'

interface TxRow { id: string; account_id: string; category_id: string; subcategory_id: string | null; type: string; recurring_rule_id: string | null; occurrence_date: string | null; deleted_at: string | null; is_recurring: number }

async function assertUsable(ctx: ServiceContext, table: 'accounts' | 'categories', id: string, label: string, allowArchivedIfSame: string | null) {
  const row = await one<{ archived_at: string | null }>(ctx, `SELECT archived_at FROM ${table} WHERE id = ?`, [id])
  if (!row) throw new DomainError(`${label} no existe`)
  if (row.archived_at && id !== allowArchivedIfSame) throw new DomainError(`${label} está archivada. Elige otra o desarchívala.`)
}

export function transactionService(ctx: ServiceContext) {
  async function validate(input: TransactionInput, existing: TxRow | null) {
    const data = parse(transactionSchema(ctx.today()), input)
    await assertUsable(ctx, 'accounts', data.accountId, 'La cuenta', existing?.account_id ?? null)
    await assertUsable(ctx, 'categories', data.categoryId, 'La categoría', existing?.category_id ?? null)
    const cat = await one<{ kind: string }>(ctx, 'SELECT kind FROM categories WHERE id = ?', [data.categoryId])
    if (cat?.kind !== data.type) throw new DomainError('La categoría no corresponde al tipo de movimiento')
    if (data.subcategoryId) {
      const sub = await one<{ category_id: string }>(ctx, 'SELECT category_id FROM subcategories WHERE id = ?', [data.subcategoryId])
      if (!sub || sub.category_id !== data.categoryId) throw new DomainError('La subcategoría no pertenece a la categoría')
    }
    return data
  }

  return {
    /** Crea un movimiento. Si `input.id` viene del formulario, un doble envío no duplica (la clave primaria lo impide). */
    async create(input: TransactionInput): Promise<string> {
      const d = await validate(input, null)
      const id = d.id ?? ctx.newId()
      const now = ctx.now()
      await ctx.db.batch([
        {
          sql: `INSERT INTO transactions (id,type,amount,date,account_id,category_id,subcategory_id,description,payment_method,merchant,notes,is_recurring,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          params: [id, d.type, d.amount, d.date, d.accountId, d.categoryId, d.subcategoryId, d.description, d.paymentMethod, d.merchant, d.notes, d.isRecurring ? 1 : 0, now, now],
        },
        ...tagStatements(ctx, id, d.tags),
      ])
      return id
    },

    async update(id: string, input: TransactionInput): Promise<void> {
      const existing = await one<TxRow>(ctx, 'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new DomainError('El movimiento no existe o ya fue eliminado')
      const d = await validate({ ...input, id }, existing)
      await ctx.db.batch([
        {
          sql: `UPDATE transactions SET type=?, amount=?, date=?, account_id=?, category_id=?, subcategory_id=?, description=?, payment_method=?, merchant=?, notes=?, is_recurring=?, updated_at=? WHERE id=?`,
          params: [d.type, d.amount, d.date, d.accountId, d.categoryId, d.subcategoryId, d.description, d.paymentMethod, d.merchant, d.notes, d.isRecurring ? 1 : 0, ctx.now(), id],
        },
        ...tagStatements(ctx, id, d.tags),
      ])
    },

    /** Eliminación lógica (reversible con `restore`). Si era un pago recurrente, la regla vuelve a marcarlo pendiente. */
    async remove(id: string): Promise<void> {
      const existing = await one<TxRow>(ctx, 'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new DomainError('El movimiento no existe o ya fue eliminado')
      const stmts: Stmt[] = [{ sql: 'UPDATE transactions SET deleted_at = ? WHERE id = ?', params: [ctx.now(), id] }]
      if (existing.recurring_rule_id && existing.occurrence_date) {
        stmts.push({
          sql: 'UPDATE recurring_rules SET next_due_date = ? WHERE id = ? AND next_due_date > ?',
          params: [existing.occurrence_date, existing.recurring_rule_id, existing.occurrence_date],
        })
      }
      await ctx.db.batch(stmts)
    },

    async restore(id: string): Promise<void> {
      const existing = await one<TxRow>(ctx, 'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NOT NULL', [id])
      if (!existing) throw new DomainError('El movimiento no está en la papelera')
      const stmts: Stmt[] = [{ sql: 'UPDATE transactions SET deleted_at = NULL WHERE id = ?', params: [id] }]
      if (existing.recurring_rule_id && existing.occurrence_date) {
        const rule = await one<{ anchor_date: string; frequency: string }>(ctx, 'SELECT anchor_date, frequency FROM recurring_rules WHERE id = ?', [existing.recurring_rule_id])
        if (rule) {
          stmts.push({
            sql: 'UPDATE recurring_rules SET next_due_date = ? WHERE id = ? AND next_due_date = ?',
            params: [nextAfter(rule.anchor_date, rule.frequency as never, existing.occurrence_date), existing.recurring_rule_id, existing.occurrence_date],
          })
        }
      }
      await ctx.db.batch(stmts)
    },

    /** Copia un movimiento con fecha de hoy (sin vínculo a pagos recurrentes). */
    async duplicate(id: string): Promise<string> {
      const r = await one<Record<string, any>>(ctx, 'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [id])
      if (!r) throw new DomainError('El movimiento no existe')
      const tags = (await ctx.db.select<{ name: string }>('SELECT t.name FROM transaction_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.transaction_id = ?', [id])).map((x) => x.name)
      return this.create({
        type: r.type, amount: r.amount, date: ctx.today(), accountId: r.account_id, categoryId: r.category_id,
        subcategoryId: r.subcategory_id, description: r.description, paymentMethod: r.payment_method, merchant: r.merchant,
        notes: r.notes, isRecurring: r.is_recurring === 1, tags,
      })
    },

    /** Importación masiva en una sola transacción: si una fila falla, no se guarda ninguna. */
    async createMany(inputs: TransactionInput[]): Promise<number> {
      if (!inputs.length) return 0
      const stmts: Stmt[] = []
      const now = ctx.now()
      const accounts = new Map((await ctx.db.select<{ id: string; archived_at: string | null }>('SELECT id, archived_at FROM accounts')).map((a) => [a.id, a]))
      const cats = new Map((await ctx.db.select<{ id: string; kind: string; archived_at: string | null }>('SELECT id, kind, archived_at FROM categories')).map((c) => [c.id, c]))
      for (const [i, input] of inputs.entries()) {
        const d = parse(transactionSchema(ctx.today()), input)
        const acc = accounts.get(d.accountId)
        const cat = cats.get(d.categoryId)
        if (!acc || acc.archived_at) throw new DomainError(`Fila ${i + 1}: cuenta no disponible`)
        if (!cat || cat.archived_at || cat.kind !== d.type) throw new DomainError(`Fila ${i + 1}: categoría no disponible para el tipo de movimiento`)
        const id = d.id ?? ctx.newId()
        stmts.push({
          sql: `INSERT INTO transactions (id,type,amount,date,account_id,category_id,subcategory_id,description,payment_method,merchant,notes,is_recurring,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          params: [id, d.type, d.amount, d.date, d.accountId, d.categoryId, d.subcategoryId, d.description, d.paymentMethod, d.merchant, d.notes, d.isRecurring ? 1 : 0, now, now],
        })
        if (d.tags.length) stmts.push(...tagStatements(ctx, id, d.tags))
      }
      await ctx.db.batch(stmts)
      return inputs.length
    },

    /** Elimina definitivamente lo que lleva más de `days` días en la papelera. */
    async purgeDeleted(days = 30): Promise<void> {
      const limit = new Date(new Date(ctx.now()).getTime() - days * 86_400_000).toISOString()
      await ctx.db.batch([
        { sql: 'DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ?', params: [limit] },
        { sql: 'DELETE FROM transfers WHERE deleted_at IS NOT NULL AND deleted_at < ?', params: [limit] },
      ])
    },
  }
}

export function transferService(ctx: ServiceContext) {
  async function validate(input: TransferInput, existing: { from_account_id: string; to_account_id: string } | null) {
    const d = parse(transferSchema(ctx.today()), input)
    await assertUsable(ctx, 'accounts', d.fromAccountId, 'La cuenta de origen', existing?.from_account_id ?? null)
    await assertUsable(ctx, 'accounts', d.toAccountId, 'La cuenta de destino', existing?.to_account_id ?? null)
    return d
  }
  return {
    async create(input: TransferInput): Promise<string> {
      const d = await validate(input, null)
      const id = d.id ?? ctx.newId()
      const now = ctx.now()
      await ctx.db.execute(
        'INSERT INTO transfers (id,from_account_id,to_account_id,amount,date,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, d.fromAccountId, d.toAccountId, d.amount, d.date, d.description, now, now],
      )
      return id
    },
    async update(id: string, input: TransferInput): Promise<void> {
      const existing = await one<{ from_account_id: string; to_account_id: string }>(ctx, 'SELECT * FROM transfers WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new DomainError('La transferencia no existe o ya fue eliminada')
      const d = await validate(input, existing)
      await ctx.db.execute(
        'UPDATE transfers SET from_account_id=?, to_account_id=?, amount=?, date=?, description=?, updated_at=? WHERE id=?',
        [d.fromAccountId, d.toAccountId, d.amount, d.date, d.description, ctx.now(), id],
      )
    },
    async remove(id: string): Promise<void> {
      const r = await ctx.db.execute('UPDATE transfers SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [ctx.now(), id])
      if (!r.changes) throw new DomainError('La transferencia no existe o ya fue eliminada')
    },
    async restore(id: string): Promise<void> {
      const r = await ctx.db.execute('UPDATE transfers SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id])
      if (!r.changes) throw new DomainError('La transferencia no está en la papelera')
    },
  }
}
