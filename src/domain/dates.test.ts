import { describe, expect, it } from 'vitest'
import { addMonthKey, addMonthsISO, isISODate, monthKeyOf, monthRange, monthsInRange, previousRange, resolvePeriod, yearRange } from './dates'

describe('períodos financieros', () => {
  it('mes calendario por defecto', () => {
    expect(monthRange('2025-02')).toEqual({ from: '2025-02-01', to: '2025-02-28' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2025-12')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
  it('mes financiero que inicia el día 15', () => {
    expect(monthRange('2025-03', 15)).toEqual({ from: '2025-03-15', to: '2025-04-14' })
    expect(monthRange('2025-12', 15)).toEqual({ from: '2025-12-15', to: '2026-01-14' })
    expect(monthKeyOf('2025-03-14', 15)).toBe('2025-02')
    expect(monthKeyOf('2025-03-15', 15)).toBe('2025-03')
    expect(monthKeyOf('2025-01-05', 15)).toBe('2024-12')
  })
  it('los períodos contiguos no se solapan ni dejan huecos', () => {
    for (const sd of [1, 5, 15, 28]) {
      const a = monthRange('2025-05', sd)
      const b = monthRange('2025-06', sd)
      expect(b.from > a.to).toBe(true)
      expect(monthKeyOf(a.to, sd)).toBe('2025-05')
      expect(monthKeyOf(b.from, sd)).toBe('2025-06')
    }
  })
  it('año y selección de período', () => {
    expect(yearRange(2025)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(resolvePeriod({ mode: 'custom', from: '2025-03-10', to: '2025-03-01' })).toEqual({ from: '2025-03-01', to: '2025-03-10' })
    expect(monthsInRange({ from: '2025-01-20', to: '2025-03-02' })).toEqual(['2025-01', '2025-02', '2025-03'])
  })
  it('período anterior de igual duración', () => {
    expect(previousRange({ from: '2025-03-01', to: '2025-03-31' })).toEqual({ from: '2025-01-29', to: '2025-02-28' })
  })
  it('suma de meses sin desbordar', () => {
    expect(addMonthsISO('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonthKey('2025-12', 1)).toBe('2026-01')
    expect(addMonthKey('2025-01', -1)).toBe('2024-12')
  })
  it('valida fechas', () => {
    expect(isISODate('2025-02-29')).toBe(false)
    expect(isISODate('2024-02-29')).toBe(true)
    expect(isISODate('2025-13-01')).toBe(false)
    expect(isISODate('hola')).toBe(false)
  })
})
