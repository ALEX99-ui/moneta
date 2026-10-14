import { DomainError } from '@/db/types'
import { loadAll } from '@/db/repositories'
import { accountBalance } from '@/domain/ledger'
import { accountSchema, categorySchema, type AccountInput, type CategoryInput } from '@/validation/schemas'
import { one, parse, type ServiceContext } from './context'

export function accountService(ctx: ServiceContext) {
  return {
    async create(input: AccountInput): Promise<string> {
      const d = parse(accountSchema, input)
      const id = d.id ?? ctx.newId()
      const max = await one<{ m: number | null }>(ctx, 'SELECT MAX(sort_order) AS m FROM accounts')
      await ctx.db.execute(
        'INSERT INTO accounts (id,name,type,initial_balance,color,icon,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, d.name, d.type, d.initialBalance, d.color, d.icon, (max?.m ?? -1) + 1, ctx.now()],
      )
      return id
    },
    /** Editar el saldo inicial recalcula el saldo automáticamente: los saldos nunca se almacenan. */
    async update(id: string, input: AccountInput): Promise<void> {
      const d = parse(accountSchema, input)
      const r = await ctx.db.execute('UPDATE accounts SET name=?, type=?, initial_balance=?, color=?, icon=? WHERE id=?', [d.name, d.type, d.initialBalance, d.color, d.icon, id])
      if (!r.changes) throw new DomainError('La cuenta no existe')
    },
    /** Solo se archiva una cuenta sin saldo ni pagos periódicos activos, para no "perder" dinero del total. */
    async archive(id: string): Promise<void> {
      const data = await loadAll(ctx.db)
      const acc = data.accounts.find((a) => a.id === id)
      if (!acc) throw new DomainError('La cuenta no existe')
      if (data.accounts.filter((a) => !a.archivedAt).length <= 1) throw new DomainError('Debe quedar al menos una cuenta activa')
      const bal = accountBalance(data, id)
      if (bal !== 0) throw new DomainError('La cuenta aún tiene saldo. Transfiérelo a otra cuenta antes de archivarla.')
      if (data.rules.some((r) => r.accountId === id && !r.archivedAt)) throw new DomainError('La cuenta tiene suscripciones o pagos periódicos asociados. Cámbialos de cuenta primero.')
      await ctx.db.execute('UPDATE accounts SET archived_at = ? WHERE id = ?', [ctx.now(), id])
    },
    async unarchive(id: string): Promise<void> {
      await ctx.db.execute('UPDATE accounts SET archived_at = NULL WHERE id = ?', [id])
    },
    async reorder(ids: string[]): Promise<void> {
      await ctx.db.batch(ids.map((id, i) => ({ sql: 'UPDATE accounts SET sort_order = ? WHERE id = ?', params: [i, id] })))
    },
  }
}

export function categoryService(ctx: ServiceContext) {
  return {
    async create(input: CategoryInput): Promise<string> {
      const d = parse(categorySchema, input)
      const id = d.id ?? ctx.newId()
      const max = await one<{ m: number | null }>(ctx, 'SELECT MAX(sort_order) AS m FROM categories WHERE kind = ?', [d.kind])
      await ctx.db.execute(
        'INSERT INTO categories (id,name,kind,icon,color,essential,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, d.name, d.kind, d.icon, d.color, d.essential ? 1 : 0, (max?.m ?? -1) + 1, ctx.now()],
      )
      return id
    },
    /** El tipo (gasto/ingreso) no se puede cambiar: el historial dejaría de ser coherente. */
    async update(id: string, input: CategoryInput): Promise<void> {
      const d = parse(categorySchema, input)
      const cur = await one<{ kind: string }>(ctx, 'SELECT kind FROM categories WHERE id = ?', [id])
      if (!cur) throw new DomainError('La categoría no existe')
      if (cur.kind !== d.kind) throw new DomainError('No se puede cambiar el tipo de una categoría existente')
      await ctx.db.execute('UPDATE categories SET name=?, icon=?, color=?, essential=? WHERE id=?', [d.name, d.icon, d.color, d.essential ? 1 : 0, id])
    },
    /** Archivar conserva todo el historial; la categoría solo deja de ofrecerse en nuevos movimientos. */
    async archive(id: string): Promise<void> {
      const cat = await one<{ kind: string }>(ctx, 'SELECT kind FROM categories WHERE id = ?', [id])
      if (!cat) throw new DomainError('La categoría no existe')
      const active = await one<{ n: number }>(ctx, 'SELECT COUNT(*) AS n FROM categories WHERE kind = ? AND archived_at IS NULL', [cat.kind])
      if ((active?.n ?? 0) <= 1) throw new DomainError('Debe quedar al menos una categoría activa de este tipo')
      const rules = await one<{ n: number }>(ctx, 'SELECT COUNT(*) AS n FROM recurring_rules WHERE category_id = ? AND archived_at IS NULL', [id])
      if ((rules?.n ?? 0) > 0) throw new DomainError('Hay suscripciones o pagos periódicos que usan esta categoría. Cámbialos primero.')
      await ctx.db.execute('UPDATE categories SET archived_at = ? WHERE id = ?', [ctx.now(), id])
    },
    async unarchive(id: string): Promise<void> {
      await ctx.db.execute('UPDATE categories SET archived_at = NULL WHERE id = ?', [id])
    },
    async addSubcategory(categoryId: string, name: string): Promise<string> {
      const n = parse(categorySchema.shape.name, name)
      const id = ctx.newId()
      await ctx.db.execute('INSERT INTO subcategories (id,category_id,name,created_at) VALUES (?,?,?,?)', [id, categoryId, n, ctx.now()])
      return id
    },
    async renameSubcategory(id: string, name: string): Promise<void> {
      const n = parse(categorySchema.shape.name, name)
      await ctx.db.execute('UPDATE subcategories SET name = ? WHERE id = ?', [n, id])
    },
    async archiveSubcategory(id: string): Promise<void> {
      await ctx.db.execute('UPDATE subcategories SET archived_at = ? WHERE id = ?', [ctx.now(), id])
    },
    async unarchiveSubcategory(id: string): Promise<void> {
      await ctx.db.execute('UPDATE subcategories SET archived_at = NULL WHERE id = ?', [id])
    },
  }
}
