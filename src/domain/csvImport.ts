/**
 * Importación de movimientos desde CSV: mapeo de columnas, validación fila por fila y detección de repetidos.
 * Todo es puro (sin base de datos): la vista previa muestra exactamente lo que se guardará.
 */
import { isISODate, type ISODate } from './dates'
import { dedupeKey, norm } from './filters'
import { MAX_AMOUNT } from './money'
import type { FinanceData, TxType } from './types'
import type { TransactionInput } from '@/validation/schemas'

export type NumberStyle = 'co' | 'us'
export type ImportDateFormat = 'auto-dmy' | 'mdy' | 'ymd'

export interface ColumnMapping {
  date: number | null
  /** Columna con signo (negativo = gasto) o con valor absoluto + columna de tipo. */
  amount: number | null
  /** Alternativa: columnas separadas de ingreso y de gasto. */
  income: number | null
  expense: number | null
  type: number | null
  description: number | null
  category: number | null
  account: number | null
  merchant: number | null
  notes: number | null
  tags: number | null
}

export const EMPTY_MAPPING: ColumnMapping = { date: null, amount: null, income: null, expense: null, type: null, description: null, category: null, account: null, merchant: null, notes: null, tags: null }

const SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  date: ['fecha', 'date', 'dia', 'fecha de la transaccion', 'fecha transaccion'],
  amount: ['valor', 'monto', 'importe', 'amount', 'total', 'cantidad', 'value'],
  income: ['ingreso', 'ingresos', 'credito', 'abono', 'entrada', 'income', 'credit', 'deposito'],
  expense: ['gasto', 'gastos', 'debito', 'cargo', 'salida', 'expense', 'debit', 'retiro'],
  type: ['tipo', 'type', 'movimiento', 'clase'],
  description: ['descripcion', 'concepto', 'detalle', 'description', 'memo', 'referencia', 'nota breve'],
  category: ['categoria', 'category', 'rubro'],
  account: ['cuenta', 'account', 'banco'],
  merchant: ['comercio', 'destinatario', 'merchant', 'beneficiario', 'establecimiento', 'pagador'],
  notes: ['notas', 'nota', 'observaciones', 'notes', 'comentario', 'comentarios'],
  tags: ['etiquetas', 'tags', 'etiqueta'],
}

/** Propone un mapeo comparando los encabezados con sinónimos comunes (sin acentos ni mayúsculas). */
export function autoMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = { ...EMPTY_MAPPING }
  const used = new Set<number>()
  const h = headers.map((x) => norm(x))
  for (const key of Object.keys(SYNONYMS) as (keyof ColumnMapping)[]) {
    const idx = h.findIndex((name, i) => !used.has(i) && SYNONYMS[key].includes(name))
    if (idx >= 0) {
      m[key] = idx
      used.add(idx)
    }
  }
  if (m.amount !== null && (m.income !== null || m.expense !== null) && m.type === null) {
    // Ambas formas presentes: se prefiere la columna única con signo
    m.income = null
    m.expense = null
  }
  return m
}

/** Convierte texto a pesos enteros con signo. null si no se puede interpretar sin ambigüedad. */
export function parseAmountCell(raw: string, style: NumberStyle): number | null {
  let s = raw.trim()
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$\s ]|COP|USD/gi, '')
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  } else if (s.endsWith('-')) {
    neg = !neg
    s = s.slice(0, -1)
  }
  if (s.startsWith('+')) s = s.slice(1)
  const [thousands, decimal] = style === 'co' ? (['.', ','] as const) : ([',', '.'] as const)
  const parts = s.split(decimal)
  if (parts.length > 2) return null
  const intPart = parts[0] ?? ''
  const dec = parts[1] ?? ''
  if (dec && !/^0*$/.test(dec)) return null // COP no admite fracciones de peso
  const groups = intPart.split(thousands)
  if (groups.length > 1 && !/^\d{1,3}$/.test(groups[0]!)) return null
  if (groups.slice(1).some((g) => !/^\d{3}$/.test(g))) return null
  const digits = groups.join('')
  if (!/^\d+$/.test(digits)) return null
  const n = Number(digits)
  if (!Number.isSafeInteger(n)) return null
  return neg ? -n : n
}

/** Acepta yyyy-MM-dd, dd/MM/yyyy (por defecto, formato colombiano) o MM/dd/yyyy; años de 2 dígitos → 20xx. */
export function parseDateCell(raw: string, fmt: ImportDateFormat): ISODate | null {
  const s = raw.trim()
  if (!s) return null
  let y: string, mo: string, d: string
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s)
  if (m) [, y, mo, d] = m as unknown as string[] as [string, string, string, string]
  else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s)
    if (!m) return null
    const [, a, b, yy] = m as unknown as [string, string, string, string]
    y = yy.length === 2 ? `20${yy}` : yy
    ;[d, mo] = fmt === 'mdy' ? [b, a] : [a, b]
  }
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  return isISODate(iso) ? iso : null
}

function parseType(raw: string): TxType | null {
  const v = norm(raw)
  if (['gasto', 'egreso', 'expense', 'debito', 'salida', 'retiro', 'cargo', 'g'].includes(v)) return 'expense'
  if (['ingreso', 'income', 'credito', 'entrada', 'abono', 'deposito', 'i'].includes(v)) return 'income'
  return null
}

export interface ImportOptions {
  numberStyle: NumberStyle
  dateFormat: ImportDateFormat
  defaultAccountId: string
  /** Importar también filas que parecen repetidas. */
  includeDuplicates: boolean
}

export type RowStatus = 'ok' | 'duplicate' | 'error'
export interface PreviewRow {
  /** Número de línea del archivo (1 = encabezado). */
  line: number
  status: RowStatus
  messages: string[]
  input: TransactionInput | null
  /** Resumen legible para la tabla de vista previa. */
  display: { date: string; type: string; amount: number; description: string; category: string; account: string }
}

const get = (row: string[], i: number | null) => (i === null ? '' : (row[i] ?? '').trim())

export function buildPreview(rows: string[][], mapping: ColumnMapping, opts: ImportOptions, data: FinanceData, today: ISODate): PreviewRow[] {
  const body = rows.slice(1)
  const out: PreviewRow[] = []
  const existing = new Set(data.transactions.map((t) => dedupeKey(t)))
  const seen = new Set<string>()
  const accounts = data.accounts.filter((a) => !a.archivedAt)
  const accByName = new Map(accounts.map((a) => [norm(a.name), a.id]))
  const catByName = (kind: TxType) => new Map(data.categories.filter((c) => c.kind === kind && !c.archivedAt).map((c) => [norm(c.name), c.id]))
  const expCats = catByName('expense')
  const incCats = catByName('income')
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? ''

  body.forEach((row, idx) => {
    const line = idx + 2
    if (row.every((c) => !c.trim())) return
    const messages: string[] = []
    const errors: string[] = []

    const dateRaw = get(row, mapping.date)
    const date = parseDateCell(dateRaw, opts.dateFormat)
    if (!dateRaw) errors.push('Falta la fecha')
    else if (!date) errors.push(`Fecha no válida: «${dateRaw}»`)
    else if (date > today) errors.push('La fecha es futura')

    let signed: number | null = null
    let type: TxType | null = null
    if (mapping.amount !== null) {
      const raw = get(row, mapping.amount)
      signed = parseAmountCell(raw, opts.numberStyle)
      if (!raw) errors.push('Falta el valor')
      else if (signed === null) errors.push(`Valor no válido: «${raw}»`)
      if (mapping.type !== null) {
        type = parseType(get(row, mapping.type))
        if (!type) errors.push(`Tipo no reconocido: «${get(row, mapping.type)}»`)
        if (signed !== null) signed = Math.abs(signed)
      } else if (signed !== null) type = signed < 0 ? 'expense' : 'income'
    } else if (mapping.income !== null || mapping.expense !== null) {
      const inc = parseAmountCell(get(row, mapping.income), opts.numberStyle)
      const exp = parseAmountCell(get(row, mapping.expense), opts.numberStyle)
      if (inc && exp) errors.push('La fila tiene ingreso y gasto a la vez')
      else if (inc) [type, signed] = ['income', Math.abs(inc)]
      else if (exp) [type, signed] = ['expense', Math.abs(exp)]
      else errors.push('Falta el valor')
    } else errors.push('No hay columna de valor')
    const amount = signed === null ? null : Math.abs(signed)
    if (amount !== null && amount === 0) errors.push('El valor es cero')
    if (amount !== null && amount > MAX_AMOUNT) errors.push('El valor es demasiado grande')

    // Cuenta
    const accRaw = get(row, mapping.account)
    let accountId = opts.defaultAccountId
    if (accRaw) {
      const found = accByName.get(norm(accRaw))
      if (found) accountId = found
      else messages.push(`Cuenta «${accRaw}» no existe: se usa la cuenta por defecto`)
    }
    if (!accounts.some((a) => a.id === accountId)) errors.push('Elige una cuenta por defecto')

    // Categoría
    let categoryId = ''
    if (type) {
      const catRaw = get(row, mapping.category)
      const map = type === 'expense' ? expCats : incCats
      const fallback = type === 'expense' ? 'cat_otros' : 'cat_ing_otros'
      const found = catRaw ? map.get(norm(catRaw)) : undefined
      categoryId = found ?? ([...map.values()].includes(fallback) ? fallback : [...map.values()][0] ?? '')
      if (catRaw && !found) messages.push(`Categoría «${catRaw}» no existe: se usa «${catName(categoryId)}»`)
      if (!catRaw) messages.push(`Sin categoría: se usa «${catName(categoryId)}»`)
    }

    const description = get(row, mapping.description).slice(0, 200)
    const display = { date: date ?? dateRaw, type: type === 'income' ? 'Ingreso' : type === 'expense' ? 'Gasto' : '—', amount: amount ?? 0, description, category: categoryId ? catName(categoryId) : '', account: data.accounts.find((a) => a.id === accountId)?.name ?? '' }
    if (errors.length || !date || !type || amount === null) {
      out.push({ line, status: 'error', messages: errors, input: null, display })
      return
    }
    const input: TransactionInput = {
      type, amount, date, accountId, categoryId, description,
      merchant: get(row, mapping.merchant).slice(0, 100) || null,
      notes: get(row, mapping.notes).slice(0, 1000) || null,
      tags: get(row, mapping.tags).split(/[|;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
      isRecurring: false,
    }
    const key = dedupeKey({ type, date, amount, accountId, description })
    let status: RowStatus = 'ok'
    if (existing.has(key)) {
      status = 'duplicate'
      messages.unshift('Ya existe un movimiento igual en MONETA')
    } else if (seen.has(key)) {
      status = 'duplicate'
      messages.unshift('Se repite dentro del archivo')
    }
    seen.add(key)
    out.push({ line, status, messages, input, display })
  })
  return out
}

/** Filas que se guardarán según las opciones elegidas. */
export function rowsToImport(preview: PreviewRow[], includeDuplicates: boolean): TransactionInput[] {
  return preview.filter((r) => r.input && (r.status === 'ok' || (includeDuplicates && r.status === 'duplicate'))).map((r) => r.input!)
}
