import { describe, expect, it } from 'vitest'
import { formatCompact, formatMoney, isValidAmount, MAX_AMOUNT, parseMoney, percentOf, roundDiv } from './money'

describe('formato colombiano', () => {
  it('agrupa con puntos y sin decimales', () => {
    expect(formatMoney(1500000)).toBe('$\u00a01.500.000')
    expect(formatMoney(0)).toBe('$\u00a00')
    expect(formatMoney(-85000)).toBe('-$\u00a085.000')
    expect(formatMoney(999)).toBe('$\u00a0999')
    expect(formatMoney(1000, { sign: true })).toBe('+$\u00a01.000')
    expect(formatMoney(2500, { symbol: false })).toBe('2.500')
  })
  it('formatea montos muy elevados sin perder precisión', () => {
    expect(formatMoney(MAX_AMOUNT)).toBe('$\u00a09.000.000.000.000')
    expect(formatMoney(123456789012)).toBe('$\u00a0123.456.789.012')
  })
  it('compacta para ejes', () => {
    expect(formatCompact(850000)).toBe('$\u00a0850\u00a0mil')
    expect(formatCompact(1500000)).toBe('$\u00a01,5\u00a0M')
    expect(formatCompact(2_000_000_000)).toBe('$\u00a02\u00a0MM')
    expect(formatCompact(-1200000)).toBe('-$\u00a01,2\u00a0M')
  })
})

describe('parseMoney', () => {
  it.each([
    ['1.500.000', 1500000],
    ['1500000', 1500000],
    ['$\u00a02.000', 2000],
    ['1.500.000,00', 1500000],
    ['0', 0],
  ])('%s → %i', (input, expected) => expect(parseMoney(input)).toBe(expected))
  it.each(['', 'abc', '1.5', '1,5', '12.34.56', '1.500,5', '--1'])('rechaza "%s"', (input) => expect(parseMoney(input)).toBeNull())
})

describe('aritmética monetaria', () => {
  it('redondea sin usar floats acumulados', () => {
    expect(roundDiv(10, 3)).toBe(3)
    expect(roundDiv(11, 3)).toBe(4)
    expect(roundDiv(-10, 3)).toBe(-3)
    expect(percentOf(600000, 15)).toBe(90000)
    expect(percentOf(333, 10)).toBe(33)
  })
  it('valida montos', () => {
    expect(isValidAmount(1)).toBe(true)
    expect(isValidAmount(0)).toBe(false)
    expect(isValidAmount(-5)).toBe(false)
    expect(isValidAmount(1.5)).toBe(false)
    expect(isValidAmount(MAX_AMOUNT + 1)).toBe(false)
    expect(isValidAmount(NaN)).toBe(false)
  })
  it('la suma de muchos montos grandes sigue siendo exacta', () => {
    let s = 0
    for (let i = 0; i < 1000; i++) s += MAX_AMOUNT
    expect(Number.isSafeInteger(s)).toBe(true)
    expect(s).toBe(MAX_AMOUNT * 1000)
  })
})
