import { inRange, type DateRange } from './dates'
import type { Account, Category, Subcategory, Transaction } from './types'
import type { Money } from './money'

export interface TxFilter {
  text: string
  categoryIds: string[]
  accountIds: string[]
  range: DateRange | null
  minAmount: Money | null
  maxAmount: Money | null
  tag: string | null
  recurringOnly: boolean
}

export const EMPTY_FILTER: TxFilter = {
  text: '', categoryIds: [], accountIds: [], range: null, minAmount: null, maxAmount: null, tag: null, recurringOnly: false,
}

export type SortKey = 'date' | 'amount'
export interface TxSort { key: SortKey; dir: 'asc' | 'desc' }

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface Lookups {
  categories: Map<string, Category>
  subcategories: Map<string, Subcategory>
  accounts: Map<string, Account>
}

/** Texto en el que busca el filtro/búsqueda global (descripción, categoría, cuenta, comercio, notas, etiquetas, monto). */
export function searchHaystack(t: Transaction, l: Lookups): string {
  return norm(
    [
      t.description, t.merchant ?? '', t.notes ?? '', t.paymentMethod ?? '', t.tags.join(' '),
      l.categories.get(t.categoryId)?.name ?? '', t.subcategoryId ? l.subcategories.get(t.subcategoryId)?.name ?? '' : '',
      l.accounts.get(t.accountId)?.name ?? '', String(t.amount), t.date,
    ].join(' | '),
  )
}

export function filterTransactions(list: readonly Transaction[], f: TxFilter, l: Lookups): Transaction[] {
  const words = norm(f.text).split(/\s+/).filter(Boolean)
  return list.filter((t) => {
    if (f.range && !inRange(t.date, f.range)) return false
    if (f.categoryIds.length && !f.categoryIds.includes(t.categoryId)) return false
    if (f.accountIds.length && !f.accountIds.includes(t.accountId)) return false
    if (f.minAmount !== null && t.amount < f.minAmount) return false
    if (f.maxAmount !== null && t.amount > f.maxAmount) return false
    if (f.tag && !t.tags.includes(f.tag)) return false
    if (f.recurringOnly && !t.isRecurring && !t.recurringRuleId) return false
    if (words.length) {
      const h = searchHaystack(t, l)
      const digitsOnly = h.replace(/[.\s]/g, '')
      if (!words.every((w) => h.includes(w) || digitsOnly.includes(w.replace(/[.$]/g, '')))) return false
    }
    return true
  })
}

export function sortTransactions(list: readonly Transaction[], s: TxSort): Transaction[] {
  const dir = s.dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const primary = s.key === 'amount' ? a.amount - b.amount : a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    if (primary !== 0) return primary * dir
    return a.createdAt < b.createdAt ? dir * -1 : a.createdAt > b.createdAt ? dir : 0
  })
}

/** Posibles duplicados: mismo tipo, fecha, cuenta y monto (y descripción/comercio similar si existe). */
export function findPossibleDuplicates(
  list: readonly Transaction[],
  candidate: Pick<Transaction, 'type' | 'date' | 'amount' | 'accountId' | 'description' | 'merchant'> & { id?: string },
): Transaction[] {
  const cd = norm(candidate.description)
  return list.filter((t) => {
    if (candidate.id && t.id === candidate.id) return false
    if (t.type !== candidate.type || t.date !== candidate.date || t.amount !== candidate.amount || t.accountId !== candidate.accountId) return false
    const td = norm(t.description)
    if (!cd || !td) return true
    return td === cd || td.includes(cd) || cd.includes(td) || (!!candidate.merchant && norm(candidate.merchant) === norm(t.merchant ?? ''))
  })
}

/** Clave estable para detectar repetidos en importaciones. */
export function dedupeKey(t: Pick<Transaction, 'type' | 'date' | 'amount' | 'accountId' | 'description'>): string {
  return [t.type, t.date, t.amount, t.accountId, norm(t.description)].join('|')
}
