import { addDays, addMonths, format, getDaysInMonth, parseISO, isValid } from 'date-fns'

/** Fecha calendario sin hora ni zona: 'YYYY-MM-DD'. Se compara como texto. */
export type ISODate = string
/** Clave de mes financiero: 'YYYY-MM'. */
export type MonthKey = string

export interface DateRange {
  from: ISODate
  to: ISODate
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false
  const d = parseISO(s)
  return isValid(d) && format(d, 'yyyy-MM-dd') === s
}

export function toISO(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd')
}

export function fromISO(s: ISODate): Date {
  return parseISO(s)
}

/** Fecha local de hoy (no UTC). `clock` permite fijarla en pruebas. */
export function todayISO(clock: () => Date = () => new Date()): ISODate {
  return toISO(clock())
}

export function addDaysISO(s: ISODate, n: number): ISODate {
  return toISO(addDays(parseISO(s), n))
}

/** Suma meses sin desbordar (31 ene + 1 mes = 28/29 feb). */
export function addMonthsISO(s: ISODate, n: number): ISODate {
  return toISO(addMonths(parseISO(s), n))
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const da = parseISO(a)
  const db = parseISO(b)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

export function monthOf(s: ISODate): MonthKey {
  return s.slice(0, 7)
}

export function addMonthKey(key: MonthKey, n: number): MonthKey {
  return monthOf(addMonthsISO(`${key}-01`, n))
}

export function daysInMonthKey(key: MonthKey): number {
  return getDaysInMonth(parseISO(`${key}-01`))
}

/**
 * Período de un mes financiero. Con `startDay = 1` es el mes calendario.
 * Con `startDay = 15`, el período '2025-03' va del 15-mar al 14-abr (se nombra por el mes en que inicia).
 */
export function monthRange(key: MonthKey, startDay = 1): DateRange {
  const sd = Math.min(Math.max(Math.trunc(startDay) || 1, 1), 28)
  const from = `${key}-${String(sd).padStart(2, '0')}`
  if (sd === 1) return { from, to: `${key}-${String(daysInMonthKey(key)).padStart(2, '0')}` }
  const next = addMonthKey(key, 1)
  return { from, to: `${next}-${String(sd - 1).padStart(2, '0')}` }
}

/** Mes financiero al que pertenece una fecha. */
export function monthKeyOf(date: ISODate, startDay = 1): MonthKey {
  const sd = Math.min(Math.max(Math.trunc(startDay) || 1, 1), 28)
  const day = Number(date.slice(8, 10))
  const key = monthOf(date)
  return day >= sd ? key : addMonthKey(key, -1)
}

export function yearRange(year: number, startDay = 1): DateRange {
  return { from: monthRange(`${year}-01`, startDay).from, to: monthRange(`${year}-12`, startDay).to }
}

export function monthsInRange(range: DateRange, startDay = 1): MonthKey[] {
  const out: MonthKey[] = []
  let k = monthKeyOf(range.from, startDay)
  const last = monthKeyOf(range.to, startDay)
  while (k <= last && out.length < 600) {
    out.push(k)
    k = addMonthKey(k, 1)
  }
  return out
}

export function inRange(date: ISODate, r: DateRange): boolean {
  return date >= r.from && date <= r.to
}

/** Rango inmediatamente anterior de igual duración (para comparar períodos). */
export function previousRange(r: DateRange): DateRange {
  const len = daysBetween(r.from, r.to) + 1
  return { from: addDaysISO(r.from, -len), to: addDaysISO(r.from, -1) }
}

export type PeriodSelection =
  | { mode: 'month'; month: MonthKey }
  | { mode: 'year'; year: number }
  | { mode: 'custom'; from: ISODate; to: ISODate }
  | { mode: 'all' }

export function resolvePeriod(sel: PeriodSelection, startDay = 1): DateRange {
  switch (sel.mode) {
    case 'month':
      return monthRange(sel.month, startDay)
    case 'year':
      return yearRange(sel.year, startDay)
    case 'custom':
      return sel.from <= sel.to ? { from: sel.from, to: sel.to } : { from: sel.to, to: sel.from }
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31' }
  }
}

export type DateFormat = 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'MM/dd/yyyy'

export function formatDate(s: ISODate, fmt: DateFormat = 'dd/MM/yyyy'): string {
  if (!isISODate(s)) return s
  return format(parseISO(s), fmt)
}
