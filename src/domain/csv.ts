import type { FinanceData, Transaction } from './types'

export type Delimiter = ',' | ';' | '\t'

function escapeCell(v: string | number | boolean | null | undefined, delim: Delimiter): string {
  const s = v === null || v === undefined ? '' : String(v)
  // Evita inyección de fórmulas al abrir en Excel (=, +, -, @) sin alterar números reales.
  const safe = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) || safe.includes(delim) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Serializa filas a CSV (RFC 4180). Incluye BOM UTF-8 para que Excel respete tildes y eñes. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][], delim: Delimiter = ',', bom = true): string {
  return (bom ? '﻿' : '') + rows.map((r) => r.map((c) => escapeCell(c, delim)).join(delim)).join('\r\n') + '\r\n'
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? ''
  const count = (d: string) => {
    let n = 0
    let inQ = false
    for (const ch of firstLine) {
      if (ch === '"') inQ = !inQ
      else if (ch === d && !inQ) n++
    }
    return n
  }
  const c = { ';': count(';'), ',': count(','), '\t': count('\t') }
  return c[';'] >= c[','] && c[';'] >= c['\t'] && c[';'] > 0 ? ';' : c['\t'] > c[','] ? '\t' : ','
}

/** Lector CSV tolerante: comillas, saltos de línea dentro de celdas, BOM y delimitador automático. */
export function parseCsv(text: string, delim: Delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQ = false
      } else cell += ch
    } else if (ch === '"' && cell === '') inQ = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export const TX_CSV_HEADER = ['Fecha', 'Tipo', 'Valor', 'Cuenta', 'Categoría', 'Subcategoría', 'Descripción', 'Comercio', 'Método de pago', 'Etiquetas', 'Notas', 'Recurrente', 'ID']

export function transactionsToRows(data: Pick<FinanceData, 'accounts' | 'categories' | 'subcategories'>, txs: readonly Transaction[]): (string | number)[][] {
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]))
  const cat = new Map(data.categories.map((c) => [c.id, c.name]))
  const sub = new Map(data.subcategories.map((s) => [s.id, s.name]))
  const rows: (string | number)[][] = [TX_CSV_HEADER]
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))) {
    rows.push([
      t.date, t.type === 'income' ? 'Ingreso' : 'Gasto', t.amount, acc.get(t.accountId) ?? '', cat.get(t.categoryId) ?? '',
      t.subcategoryId ? sub.get(t.subcategoryId) ?? '' : '', t.description, t.merchant ?? '', t.paymentMethod ?? '',
      t.tags.join(' | '), t.notes ?? '', t.isRecurring || t.recurringRuleId ? 'Sí' : 'No', t.id,
    ])
  }
  return rows
}

export function transfersToRows(data: Pick<FinanceData, 'accounts' | 'transfers'>): (string | number)[][] {
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]))
  return [
    ['Fecha', 'Desde', 'Hacia', 'Valor', 'Nota', 'ID'],
    ...[...data.transfers].sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => [t.date, acc.get(t.fromAccountId) ?? '', acc.get(t.toAccountId) ?? '', t.amount, t.description, t.id]),
  ]
}
