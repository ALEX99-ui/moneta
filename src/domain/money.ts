/**
 * Dinero: SIEMPRE enteros en la unidad mínima de la moneda contable.
 * COP se maneja en pesos enteros (decimales = 0). Jamás se hacen cálculos financieros con floats;
 * los porcentajes son solo para mostrar y las divisiones monetarias se redondean con `roundDiv`.
 */

export const CURRENCY = { code: 'COP', symbol: '$', decimals: 0 } as const
/** Límite por movimiento (9 billones). Garantiza que las sumas queden dentro de Number.MAX_SAFE_INTEGER. */
export const MAX_AMOUNT = 9_000_000_000_000

export type Money = number

export function isValidAmount(n: unknown): n is Money {
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT
}

/** División entera redondeada al más cercano (mitades hacia arriba en valor absoluto). */
export function roundDiv(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error('División por cero')
  const q = numerator / denominator
  return q < 0 ? -Math.round(-q) : Math.round(q)
}

/** Porcentaje de `part` sobre `whole` (0-100+) o null si `whole` es 0. Solo para mostrar. */
export function pct(part: number, whole: number): number | null {
  if (!whole) return null
  return (part / whole) * 100
}

/** Aplica un porcentaje entero (p. ej. 15 = 15 %) a un monto, devolviendo pesos enteros. */
export function percentOf(amount: Money, percent: number): Money {
  return roundDiv(amount * percent, 100)
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** $ 1.500.000 · formato colombiano (punto de miles, sin decimales). */
export function formatMoney(n: Money, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const abs = Math.abs(Math.trunc(n))
  const body = group(String(abs))
  const sym = opts.symbol === false ? '' : '$ '
  const sign = n < 0 ? '-' : opts.sign && n > 0 ? '+' : ''
  return `${sign}${sym}${body}`
}

/** Versión corta para ejes de gráficos: $ 1,5 M · $ 850 mil. */
export function formatCompact(n: Money): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const fmt = (v: number) => {
    const s = (Math.round(v * 10) / 10).toString().replace('.', ',')
    return s
  }
  if (abs >= 1_000_000_000) return `${sign}$ ${fmt(abs / 1_000_000_000)} MM`
  if (abs >= 1_000_000) return `${sign}$ ${fmt(abs / 1_000_000)} M`
  if (abs >= 1_000) return `${sign}$ ${fmt(abs / 1_000)} mil`
  return `${sign}$ ${abs}`
}

/**
 * Interpreta texto escrito por el usuario en formato colombiano.
 * Acepta "1.500.000", "1500000", "$ 2.000", "1.500.000,00". Devuelve null si es ambiguo o inválido
 * (COP no admite fracciones de peso).
 */
export function parseMoney(input: string): Money | null {
  let s = input.replace(/[\s$]/g, '')
  if (!s) return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  if (s.includes(',')) {
    const parts = s.split(',')
    if (parts.length !== 2) return null
    const [intPart, dec] = parts as [string, string]
    if (!/^0*$/.test(dec)) return null
    s = intPart
  }
  if (s.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null
    s = s.replace(/\./g, '')
  }
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n)) return null
  return negative ? -n : n
}
