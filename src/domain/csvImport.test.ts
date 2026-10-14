import { describe, expect, it } from 'vitest'
import { autoMapping, buildPreview, parseAmountCell, parseDateCell, rowsToImport, EMPTY_MAPPING, type ImportOptions } from './csvImport'
import { parseCsv } from './csv'
import { accountBalance, totalBalance } from './ledger'
import { CASH, setup } from '@/test/helpers'

const opts: ImportOptions = { numberStyle: 'co', dateFormat: 'auto-dmy', defaultAccountId: CASH, includeDuplicates: false }

describe('lectura de valores', () => {
  it.each([
    ['1.500.000', 'co', 1500000], ['-45.000', 'co', -45000], ['(45.000)', 'co', -45000], ['$ 2.000,00', 'co', 2000], ['45.000-', 'co', -45000],
    ['1,500,000', 'us', 1500000], ['1,500.00', 'us', 1500], ['1500', 'co', 1500],
  ] as const)('%s (%s) → %i', (raw, style, expected) => expect(parseAmountCell(raw, style)).toBe(expected))
  it.each([['1.5', 'co'], ['12.34', 'co'], ['1.500,5', 'co'], ['abc', 'co'], ['', 'co'], ['1,2,3', 'us']] as const)('rechaza %s', (raw, style) => expect(parseAmountCell(raw, style)).toBeNull())
  it('fechas en varios formatos y rechazo de inválidas', () => {
    expect(parseDateCell('2025-06-15', 'auto-dmy')).toBe('2025-06-15')
    expect(parseDateCell('15/06/2025', 'auto-dmy')).toBe('2025-06-15')
    expect(parseDateCell('06/15/2025', 'mdy')).toBe('2025-06-15')
    expect(parseDateCell('5/6/25', 'auto-dmy')).toBe('2025-06-05')
    expect(parseDateCell('2025-06-15T10:00:00', 'auto-dmy')).toBe('2025-06-15')
    expect(parseDateCell('31/02/2025', 'auto-dmy')).toBeNull()
    expect(parseDateCell('ayer', 'auto-dmy')).toBeNull()
  })
  it('mapeo automático por sinónimos', () => {
    expect(autoMapping(['Fecha', 'Descripción', 'Valor', 'Categoría', 'Cuenta'])).toMatchObject({ date: 0, description: 1, amount: 2, category: 3, account: 4 })
    expect(autoMapping(['Date', 'Concepto', 'Débito', 'Crédito'])).toMatchObject({ date: 0, description: 1, expense: 2, income: 3, amount: null })
  })
})

describe('vista previa y validación antes de guardar', () => {
  it('valida fila por fila y no importa errores', async () => {
    const t = setup('2025-06-15')
    const d = await t.load()
    const csv = 'Fecha;Descripción;Valor;Categoría\n01/06/2025;Almuerzo;-45.000;Alimentación\n02/06/2025;Sueldo;3.000.000;Salario\n99/99/2025;Mala fecha;-1000;Otros\n03/06/2025;Sin valor;;Otros\n20/06/2025;Futuro;-500;Otros\n04/06/2025;Cero;0;Otros\n05/06/2025;Cat rara;-2.000;Inventada'
    const rows = parseCsv(csv)
    const p = buildPreview(rows, autoMapping(rows[0]!), opts, d, '2025-06-15')
    expect(p.map((r) => r.status)).toEqual(['ok', 'ok', 'error', 'error', 'error', 'error', 'ok'])
    expect(p[0]!.input).toMatchObject({ type: 'expense', amount: 45000, date: '2025-06-01', categoryId: 'cat_alimentacion' })
    expect(p[1]!.input).toMatchObject({ type: 'income', amount: 3_000_000, categoryId: 'cat_ing_salario' })
    expect(p[6]!.messages.join(' ')).toMatch(/Inventada/)
    expect(p[6]!.input?.categoryId).toBe('cat_otros')
    expect(p[2]!.messages[0]).toMatch(/Fecha no válida/)
    expect(p[4]!.messages[0]).toMatch(/futura/)
  })
  it('detecta repetidos contra lo existente y dentro del archivo; permite incluirlos', async () => {
    const t = setup('2025-06-15')
    await t.expense(45_000, '2025-06-01', { description: 'Almuerzo' })
    const d = await t.load()
    const rows = parseCsv('Fecha,Descripción,Valor\n2025-06-01,Almuerzo,-45000\n2025-06-02,Cena,-30000\n2025-06-02,Cena,-30000\n2025-06-03,Otra,-1000')
    const p = buildPreview(rows, autoMapping(rows[0]!), opts, d, '2025-06-15')
    expect(p.map((r) => r.status)).toEqual(['duplicate', 'ok', 'duplicate', 'ok'])
    expect(p[0]!.messages[0]).toMatch(/Ya existe/)
    expect(p[2]!.messages[0]).toMatch(/archivo/)
    expect(rowsToImport(p, false)).toHaveLength(2)
    expect(rowsToImport(p, true)).toHaveLength(4)
  })
  it('importar dos veces el mismo archivo no duplica nada', async () => {
    const t = setup('2025-06-15')
    const csv = 'Fecha,Descripción,Valor\n2025-06-01,Almuerzo,-45000\n2025-06-02,Sueldo,3000000'
    const rows = parseCsv(csv)
    for (let i = 0; i < 2; i++) {
      const p = buildPreview(rows, autoMapping(rows[0]!), opts, await t.load(), '2025-06-15')
      await t.s.transactions.createMany(rowsToImport(p, false))
    }
    const d = await t.load()
    expect(d.transactions).toHaveLength(2)
    expect(totalBalance(d)).toBe(2_955_000)
  })
  it('columnas separadas de ingreso/gasto y columna de tipo', async () => {
    const t = setup('2025-06-15')
    const d = await t.load()
    let rows = parseCsv('Fecha,Concepto,Débito,Crédito\n2025-06-01,Mercado,50000,\n2025-06-02,Pago,,100000\n2025-06-03,Raro,10,10')
    let p = buildPreview(rows, autoMapping(rows[0]!), opts, d, '2025-06-15')
    expect(p.map((r) => [r.status, r.display.type, r.display.amount])).toEqual([['ok', 'Gasto', 50000], ['ok', 'Ingreso', 100000], ['error', '—', 0]])
    rows = parseCsv('Fecha,Tipo,Valor\n2025-06-01,Gasto,50000\n2025-06-02,Ingreso,100000\n2025-06-03,Otro,5')
    p = buildPreview(rows, autoMapping(rows[0]!), opts, d, '2025-06-15')
    expect(p.map((r) => r.status)).toEqual(['ok', 'ok', 'error'])
  })
  it('importa en bloque con todo-o-nada y cuenta destino por nombre', async () => {
    const t = setup('2025-06-15')
    const bank = await t.bank(0, 'Banco X')
    const d = await t.load()
    const rows = parseCsv('Fecha,Valor,Cuenta\n2025-06-01,-1000,Banco X\n2025-06-02,-2000,Cuenta inexistente')
    const p = buildPreview(rows, autoMapping(rows[0]!), opts, d, '2025-06-15')
    expect(p[0]!.input?.accountId).toBe(bank)
    expect(p[1]!.input?.accountId).toBe(CASH)
    expect(p[1]!.messages.join(' ')).toMatch(/no existe/)
    // Si una fila falla en el servicio, no se guarda ninguna
    const bad = [...rowsToImport(p, false), { type: 'expense' as const, amount: -5, date: '2025-06-03', accountId: CASH, categoryId: 'cat_otros' }]
    await expect(t.s.transactions.createMany(bad)).rejects.toThrow()
    expect((await t.load()).transactions).toHaveLength(0)
    await t.s.transactions.createMany(rowsToImport(p, false))
    const after = await t.load()
    expect(accountBalance(after, bank)).toBe(-1000)
    expect(accountBalance(after, CASH)).toBe(-2000)
  })
  it('archivo vacío o sin columnas útiles', async () => {
    const d = await setup().load()
    const p = buildPreview([['x', 'y']], { ...EMPTY_MAPPING }, opts, d, '2025-06-15')
    expect(p).toEqual([])
    const p2 = buildPreview([['x', 'y'], ['1', '2']], { ...EMPTY_MAPPING }, opts, d, '2025-06-15')
    expect(p2[0]!.status).toBe('error')
  })
})
