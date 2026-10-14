import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv, toCsv, transactionsToRows } from './csv'
import { setup } from '@/test/helpers'

describe('CSV', () => {
  it('serializa con comillas y escapes y se puede leer de vuelta', () => {
    const rows = [['a', 'b;c', 'd"e', 'línea\nnueva'], [1, 2.5, '', null]]
    for (const delim of [',', ';', '\t'] as const) {
      const csv = toCsv(rows, delim)
      expect(csv.startsWith('﻿')).toBe(true)
      expect(parseCsv(csv, delim)).toEqual([['a', 'b;c', 'd"e', 'línea\nnueva'], ['1', '2.5', '', '']])
    }
  })
  it('neutraliza fórmulas pero no los números negativos', () => {
    const csv = toCsv([['=SUM(A1)', -500, '@x', '+57 300']], ',', false)
    expect(csv).toBe("'=SUM(A1),-500,'@x,'+57 300\r\n")
  })
  it('detecta delimitador, BOM y fin de línea', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
    expect(detectDelimiter('"a;b",c\n1,2')).toBe(',')
  })
  it('exporta transacciones reales (no datos de ejemplo)', async () => {
    const t = setup()
    await t.expense(45_000, '2025-06-01', { description: 'Almuerzo, con "amigos"', tags: ['a', 'b'] })
    const d = await t.load()
    const rows = transactionsToRows(d, d.transactions)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual(expect.arrayContaining(['2025-06-01', 'Gasto', 45000, 'Efectivo', 'Alimentación', 'Almuerzo, con "amigos"', 'a | b']))
    expect(parseCsv(toCsv(rows))[1]![6]).toBe('Almuerzo, con "amigos"')
  })
})
