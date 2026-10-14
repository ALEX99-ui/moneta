import type { Db, Row } from './types'
import type {
  Account, AppSettings, Budget, Category, Contribution, FinanceData, Goal, RecurringRule, SavedFilter,
  Subcategory, Transaction, Transfer,
} from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { DateFormat } from '@/domain/dates'

type R = Record<string, any> // filas crudas de SQLite (se tipan al mapear)

const mapAccount = (r: R): Account => ({
  id: r.id, name: r.name, type: r.type, initialBalance: r.initial_balance, color: r.color, icon: r.icon,
  sortOrder: r.sort_order, archivedAt: r.archived_at, createdAt: r.created_at,
})
const mapCategory = (r: R): Category => ({
  id: r.id, name: r.name, kind: r.kind, icon: r.icon, color: r.color, essential: r.essential === 1,
  sortOrder: r.sort_order, archivedAt: r.archived_at,
})
const mapSub = (r: R): Subcategory => ({ id: r.id, categoryId: r.category_id, name: r.name, archivedAt: r.archived_at })
const mapTx = (r: R, tags: string[]): Transaction => ({
  id: r.id, type: r.type, amount: r.amount, date: r.date, accountId: r.account_id, categoryId: r.category_id,
  subcategoryId: r.subcategory_id, description: r.description, paymentMethod: r.payment_method, merchant: r.merchant,
  notes: r.notes, isRecurring: r.is_recurring === 1, recurringRuleId: r.recurring_rule_id,
  occurrenceDate: r.occurrence_date, tags, createdAt: r.created_at, updatedAt: r.updated_at,
})
const mapTransfer = (r: R): Transfer => ({
  id: r.id, fromAccountId: r.from_account_id, toAccountId: r.to_account_id, amount: r.amount, date: r.date,
  description: r.description, createdAt: r.created_at, updatedAt: r.updated_at,
})
const mapGoal = (r: R): Goal => ({
  id: r.id, name: r.name, description: r.description, targetAmount: r.target_amount, targetDate: r.target_date,
  accountId: r.account_id, color: r.color, icon: r.icon, archivedAt: r.archived_at, createdAt: r.created_at,
})
const mapContribution = (r: R): Contribution => ({
  id: r.id, goalId: r.goal_id, kind: r.kind, amount: r.amount, date: r.date, note: r.note, createdAt: r.created_at,
})
const mapBudget = (r: R): Budget => ({ id: r.id, categoryId: r.category_id, month: r.month, amount: r.amount })
const mapRule = (r: R): RecurringRule => ({
  id: r.id, name: r.name, kind: r.kind, isSubscription: r.is_subscription === 1, amount: r.amount,
  frequency: r.frequency, anchorDate: r.anchor_date, nextDueDate: r.next_due_date, categoryId: r.category_id,
  accountId: r.account_id, status: r.status, notes: r.notes, archivedAt: r.archived_at,
  createdAt: r.created_at, updatedAt: r.updated_at,
})
const mapFilter = (r: R): SavedFilter => ({ id: r.id, name: r.name, scope: r.scope, filter: r.filter, createdAt: r.created_at })

export function parseSettings(rows: Row[]): AppSettings {
  const m = new Map(rows.map((r) => [String(r.key), String(r.value)]))
  const num = (k: string, d: number) => {
    const n = Number(m.get(k))
    return Number.isFinite(n) && m.has(k) ? n : d
  }
  const startDay = Math.min(Math.max(Math.trunc(num('month_start_day', 1)), 1), 28)
  const fmt = m.get('date_format') as DateFormat | undefined
  return {
    profileName: m.get('profile_name') ?? DEFAULT_SETTINGS.profileName,
    currency: 'COP',
    dateFormat: fmt && ['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'].includes(fmt) ? fmt : DEFAULT_SETTINGS.dateFormat,
    monthStartDay: startDay,
    theme: m.get('theme') === 'light' ? 'light' : 'dark',
    autoBackup: (m.get('auto_backup') ?? '1') === '1',
    autoBackupKeep: Math.min(Math.max(Math.trunc(num('auto_backup_keep', 7)), 1), 60),
    backupDir: m.get('backup_dir') ?? '',
  }
}

/** Carga el estado financiero completo (movimientos confirmados, sin los eliminados). */
export async function loadAll(db: Db): Promise<FinanceData> {
  const [accounts, categories, subs, txs, tagRows, transfers, goals, contribs, budgets, rules, filters, settings] = await Promise.all([
    db.select('SELECT * FROM accounts ORDER BY sort_order, created_at, name'),
    db.select('SELECT * FROM categories ORDER BY kind, sort_order, name'),
    db.select('SELECT * FROM subcategories ORDER BY name'),
    db.select('SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC'),
    db.select('SELECT tt.transaction_id AS tx, t.name AS name FROM transaction_tags tt JOIN tags t ON t.id = tt.tag_id'),
    db.select('SELECT * FROM transfers WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC'),
    db.select('SELECT * FROM savings_goals ORDER BY created_at'),
    db.select('SELECT * FROM goal_contributions ORDER BY date, created_at'),
    db.select('SELECT * FROM budgets'),
    db.select('SELECT * FROM recurring_rules ORDER BY name'),
    db.select('SELECT * FROM saved_filters ORDER BY name'),
    db.select('SELECT key, value FROM settings'),
  ])
  const tagsByTx = new Map<string, string[]>()
  for (const r of tagRows) {
    const k = String(r.tx)
    const arr = tagsByTx.get(k) ?? []
    arr.push(String(r.name))
    tagsByTx.set(k, arr)
  }
  const allTags = await db.select('SELECT name FROM tags ORDER BY lower(name)')
  return {
    accounts: accounts.map(mapAccount),
    categories: categories.map(mapCategory),
    subcategories: subs.map(mapSub),
    transactions: txs.map((r) => mapTx(r, (tagsByTx.get(String(r.id)) ?? []).sort())),
    transfers: transfers.map(mapTransfer),
    goals: goals.map(mapGoal),
    contributions: contribs.map(mapContribution),
    budgets: budgets.map(mapBudget),
    rules: rules.map(mapRule),
    savedFilters: filters.map(mapFilter),
    settings: parseSettings(settings),
    tags: allTags.map((t) => String(t.name)),
  }
}
