import { filterTransactions, EMPTY_FILTER, norm, type Lookups } from './filters'
import type { FinanceData } from './types'
import type { ISODate } from './dates'
import type { Money } from './money'

export interface SearchResult {
  kind: 'transaction' | 'transfer'
  id: string
  type: 'income' | 'expense' | 'transfer'
  date: ISODate
  amount: Money
  title: string
  subtitle: string
  /** Ruta interna de destino. */
  to: string
}

/** Convierte "15/06/2025" o "06/15/2025" en fechas ISO para que se puedan buscar por fecha. */
function normalizeQuery(q: string): string {
  return q
    .split(/\s+/)
    .map((tok) => {
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(tok)
      if (!m) return tok
      const [, a, b, y] = m as unknown as [string, string, string, string]
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    })
    .join(' ')
}

/** Búsqueda global por descripción, categoría, importe, cuenta, fecha y comercio (movimientos y transferencias). */
export function searchAll(data: FinanceData, query: string, l: Lookups, limit = 200): SearchResult[] {
  const q = normalizeQuery(query.trim())
  if (!q) return []
  const out: SearchResult[] = []
  const txs = filterTransactions(data.transactions, { ...EMPTY_FILTER, text: q }, l)
  for (const t of txs) {
    const cat = l.categories.get(t.categoryId)
    out.push({
      kind: 'transaction', id: t.id, type: t.type, date: t.date, amount: t.amount,
      title: t.description || cat?.name || 'Movimiento',
      subtitle: [cat?.name, l.accounts.get(t.accountId)?.name, t.merchant].filter(Boolean).join(' · '),
      to: `/${t.type === 'expense' ? 'gastos' : 'ingresos'}?focus=${t.id}`,
    })
  }
  const words = norm(q).split(/\s+/).filter(Boolean)
  for (const tr of data.transfers) {
    const from = l.accounts.get(tr.fromAccountId)?.name ?? ''
    const to = l.accounts.get(tr.toAccountId)?.name ?? ''
    const hay = norm(`transferencia ${tr.description} ${from} ${to} ${tr.amount} ${tr.date}`)
    const digits = hay.replace(/[.\s]/g, '')
    if (words.every((w) => hay.includes(w) || digits.includes(w.replace(/[.$]/g, '')))) {
      out.push({
        kind: 'transfer', id: tr.id, type: 'transfer', date: tr.date, amount: tr.amount,
        title: tr.description || 'Transferencia', subtitle: `${from} → ${to}`,
        to: `/cuentas?ledger=${tr.fromAccountId}&focus=${tr.id}`,
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit)
}
