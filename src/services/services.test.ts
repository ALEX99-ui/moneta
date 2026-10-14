import { describe, expect, it } from 'vitest'
import { CASH, ENTERTAINMENT, FOOD, SALARY, setup, TRANSPORT } from '@/test/helpers'
import { accountBalance, summarize, totalBalance } from '@/domain/ledger'
import { monthRange } from '@/domain/dates'
import { dedupeKey, EMPTY_FILTER, filterTransactions, findPossibleDuplicates, sortTransactions } from '@/domain/filters'
import { accountMap, categoryMap } from '@/domain/ledger'

describe('creación de gastos e ingresos', () => {
  it('guarda todos los campos, etiquetas incluidas', async () => {
    const t = setup()
    const id = await t.s.transactions.create({
      type: 'expense', amount: 45_000, date: '2025-06-10', accountId: CASH, categoryId: FOOD, subcategoryId: 'sub_alimentacion_2',
      description: 'Almuerzo', paymentMethod: 'Débito', merchant: 'Crepes', notes: 'con el equipo', isRecurring: false, tags: ['trabajo', 'Trabajo', 'equipo'],
    })
    const [tx] = (await t.load()).transactions
    expect(tx).toMatchObject({ id, amount: 45_000, subcategoryId: 'sub_alimentacion_2', merchant: 'Crepes', paymentMethod: 'Débito', notes: 'con el equipo' })
    expect(tx!.tags).toEqual(['equipo', 'trabajo'])
  })
  it('valida montos, fechas y categorías', async () => {
    const t = setup()
    const base = { type: 'expense' as const, date: '2025-06-10', accountId: CASH, categoryId: FOOD }
    await expect(t.s.transactions.create({ ...base, amount: 0 })).rejects.toThrow(/mayor que cero/)
    await expect(t.s.transactions.create({ ...base, amount: -5 })).rejects.toThrow()
    await expect(t.s.transactions.create({ ...base, amount: 10.5 })).rejects.toThrow(/enteros/)
    await expect(t.s.transactions.create({ ...base, amount: NaN })).rejects.toThrow()
    await expect(t.s.transactions.create({ ...base, amount: 10, date: '2025-02-30' })).rejects.toThrow(/inválida/)
    await expect(t.s.transactions.create({ ...base, amount: 10, date: '2025-06-16' })).rejects.toThrow(/futura/)
    await expect(t.s.transactions.create({ ...base, amount: 10, categoryId: SALARY })).rejects.toThrow(/categoría/)
    await expect(t.s.transactions.create({ ...base, amount: 10, accountId: 'nope' })).rejects.toThrow(/cuenta/i)
    await expect(t.s.transactions.create({ ...base, amount: 10, subcategoryId: 'sub_transporte_1' })).rejects.toThrow(/subcategoría/)
    expect((await t.load()).transactions).toHaveLength(0)
  })
  it('el doble envío del mismo formulario no duplica el movimiento', async () => {
    const t = setup()
    const input = { id: 'form-1', type: 'expense' as const, amount: 10_000, date: '2025-06-10', accountId: CASH, categoryId: FOOD }
    await t.s.transactions.create(input)
    await expect(t.s.transactions.create(input)).rejects.toThrow()
    const d = await t.load()
    expect(d.transactions).toHaveLength(1)
    expect(accountBalance(d, CASH)).toBe(-10_000)
  })
  it('una operación con etiquetas inválidas no deja un movimiento a medias', async () => {
    const t = setup()
    await expect(t.s.transactions.create({ type: 'expense', amount: 10, date: '2025-06-10', accountId: CASH, categoryId: FOOD, tags: ['x'.repeat(50)] })).rejects.toThrow()
    expect((await t.load()).transactions).toHaveLength(0)
  })
  it('duplicar copia el movimiento con la fecha de hoy', async () => {
    const t = setup()
    const id = await t.expense(30_000, '2025-05-01', { tags: ['a'], merchant: 'Tienda' })
    const copy = await t.s.transactions.duplicate(id)
    const d = await t.load()
    const c = d.transactions.find((x) => x.id === copy)!
    expect(c).toMatchObject({ amount: 30_000, date: '2025-06-15', merchant: 'Tienda', tags: ['a'] })
    expect(accountBalance(d, CASH)).toBe(-60_000)
  })
})

describe('cuentas', () => {
  it('crea, edita el saldo inicial y recalcula', async () => {
    const t = setup()
    const id = await t.bank(100_000, 'Bancolombia')
    await t.s.transactions.create({ type: 'income', amount: 50_000, date: '2025-06-01', accountId: id, categoryId: SALARY })
    await t.s.accounts.update(id, { name: 'Bancolombia', type: 'bank', initialBalance: 300_000 })
    expect(accountBalance(await t.load(), id)).toBe(350_000)
  })
  it('nombres únicos entre cuentas activas', async () => {
    const t = setup()
    await expect(t.s.accounts.create({ name: 'efectivo', type: 'cash', initialBalance: 0 })).rejects.toThrow(/Ya existe/)
  })
  it('no se archiva una cuenta con saldo; con saldo cero sí, y conserva su historial', async () => {
    const t = setup()
    const bank = await t.bank(0)
    await t.s.transfers.create({ fromAccountId: CASH, toAccountId: bank, amount: 1_000, date: '2025-06-01' })
    await expect(t.s.accounts.archive(bank)).rejects.toThrow(/saldo/)
    await t.s.transfers.create({ fromAccountId: bank, toAccountId: CASH, amount: 1_000, date: '2025-06-02' })
    await t.s.accounts.archive(bank)
    const d = await t.load()
    expect(d.accounts.find((a) => a.id === bank)?.archivedAt).toBeTruthy()
    expect(d.transfers).toHaveLength(2)
    await expect(t.s.transactions.create({ type: 'expense', amount: 5, date: '2025-06-03', accountId: bank, categoryId: FOOD })).rejects.toThrow(/archivada/)
  })
  it('siempre queda una cuenta activa', async () => {
    const t = setup()
    await expect(t.s.accounts.archive(CASH)).rejects.toThrow(/al menos una/)
  })
  it('ingresos y gastos con saldo inicial negativo (sobregiro)', async () => {
    const t = setup()
    const id = await t.s.accounts.create({ name: 'Tarjeta/Sobregiro', type: 'bank', initialBalance: -200_000 })
    expect(accountBalance(await t.load(), id)).toBe(-200_000)
  })
})

describe('categorías archivadas conservan el historial', () => {
  it('archivar no borra gastos ni altera totales; no se ofrece para nuevos movimientos', async () => {
    const t = setup()
    const cat = await t.s.categories.create({ name: 'Gimnasio', kind: 'expense', icon: 'dumbbell', color: '#ff0000' })
    await t.s.transactions.create({ type: 'expense', amount: 90_000, date: '2025-06-01', accountId: CASH, categoryId: cat })
    const before = summarize((await t.load()).transactions, monthRange('2025-06'))
    await t.s.categories.archive(cat)
    const d = await t.load()
    expect(summarize(d.transactions, monthRange('2025-06'))).toEqual(before)
    expect(d.categories.find((c) => c.id === cat)?.archivedAt).toBeTruthy()
    await expect(t.s.transactions.create({ type: 'expense', amount: 10, date: '2025-06-02', accountId: CASH, categoryId: cat })).rejects.toThrow(/archivada/)
    // un movimiento antiguo de la categoría archivada sigue siendo editable
    const old = d.transactions[0]!
    await t.s.transactions.update(old.id, { type: 'expense', amount: 95_000, date: old.date, accountId: CASH, categoryId: cat })
    expect(accountBalance(await t.load(), CASH)).toBe(-95_000)
  })
  it('no se puede cambiar el tipo ni eliminar físicamente una categoría usada', async () => {
    const t = setup()
    await t.expense(1, '2025-06-01')
    await expect(t.s.categories.update(FOOD, { name: 'Alimentación', kind: 'income' })).rejects.toThrow(/tipo/)
    await expect(t.db.execute('DELETE FROM categories WHERE id = ?', [FOOD])).rejects.toThrow()
  })
  it('subcategorías: crear, renombrar y archivar', async () => {
    const t = setup()
    const sub = await t.s.categories.addSubcategory(FOOD, 'Panadería')
    await t.s.categories.renameSubcategory(sub, 'Panadería y postres')
    await t.s.categories.archiveSubcategory(sub)
    const d = await t.load()
    expect(d.subcategories.find((s) => s.id === sub)).toMatchObject({ name: 'Panadería y postres' })
    expect(d.subcategories.find((s) => s.id === sub)?.archivedAt).toBeTruthy()
  })
})

describe('papelera y deshacer', () => {
  it('purga solo lo eliminado hace más de 30 días', async () => {
    const t = setup()
    const a = await t.expense(1, '2025-06-01')
    const b = await t.expense(2, '2025-06-01')
    await t.s.transactions.remove(a)
    await t.s.transactions.purgeDeleted(30)
    expect((await t.db.select('SELECT id FROM transactions')).length).toBe(2)
    t.setToday('2025-08-01')
    await t.s.transactions.purgeDeleted(30)
    expect(((await t.db.select('SELECT id FROM transactions')) as { id: string }[]).map((r) => r.id)).toEqual([b])
  })
})

describe('filtros, orden, búsqueda y duplicados', () => {
  it('filtra por texto (sin acentos), categoría, fecha, monto y ordena', async () => {
    const t = setup()
    await t.expense(45_000, '2025-06-01', { description: 'Almuerzo ejecutivo', merchant: 'Crepes & Waffles' })
    await t.expense(1_500_000, '2025-06-05', { description: 'Mercado', categoryId: FOOD })
    await t.s.transactions.create({ type: 'expense', amount: 12_000, date: '2025-06-07', accountId: CASH, categoryId: TRANSPORT, description: 'Bus', tags: ['diario'] })
    await t.s.transactions.create({ type: 'expense', amount: 80_000, date: '2025-05-20', accountId: CASH, categoryId: ENTERTAINMENT, description: 'Cine' })
    const d = await t.load()
    const l = { categories: categoryMap(d.categories), subcategories: new Map(), accounts: accountMap(d.accounts) }
    const f = (p: Partial<typeof EMPTY_FILTER>) => filterTransactions(d.transactions, { ...EMPTY_FILTER, ...p }, l).map((x) => x.description)
    expect(f({ text: 'almuerzo' })).toEqual(['Almuerzo ejecutivo'])
    expect(f({ text: 'ALMUERZO crepes' })).toEqual(['Almuerzo ejecutivo'])
    expect(f({ text: 'transporte' })).toEqual(['Bus'])
    expect(f({ text: 'diario' })).toEqual(['Bus'])
    expect(f({ text: '1500000' })).toEqual(['Mercado'])
    expect(f({ text: 'efectivo' })).toHaveLength(4)
    expect(f({ categoryIds: [FOOD] })).toHaveLength(2)
    expect(f({ range: monthRange('2025-06') })).toHaveLength(3)
    expect(f({ minAmount: 40_000, maxAmount: 100_000 }).sort()).toEqual(['Almuerzo ejecutivo', 'Cine'])
    expect(sortTransactions(d.transactions, { key: 'amount', dir: 'desc' })[0]?.amount).toBe(1_500_000)
    expect(sortTransactions(d.transactions, { key: 'amount', dir: 'asc' })[0]?.amount).toBe(12_000)
    expect(sortTransactions(d.transactions, { key: 'date', dir: 'desc' })[0]?.date).toBe('2025-06-07')
  })
  it('detecta posibles duplicados y claves de importación', async () => {
    const t = setup()
    await t.expense(45_000, '2025-06-01', { description: 'Almuerzo' })
    const d = await t.load()
    const cand = { type: 'expense' as const, date: '2025-06-01', amount: 45_000, accountId: CASH, description: 'almuerzo', merchant: null }
    expect(findPossibleDuplicates(d.transactions, cand)).toHaveLength(1)
    expect(findPossibleDuplicates(d.transactions, { ...cand, amount: 46_000 })).toHaveLength(0)
    expect(findPossibleDuplicates(d.transactions, { ...cand, description: 'Cena distinta' })).toHaveLength(0)
    expect(dedupeKey(cand)).toBe(dedupeKey({ ...cand, description: 'ALMUERZO' }))
  })
})

describe('integridad general', () => {
  it('las restricciones de la base rechazan datos inválidos aunque se salten los servicios', async () => {
    const t = setup()
    await expect(t.db.execute(`INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('x','expense',1.5,'2025-01-01','${CASH}','${FOOD}','','t','t')`)).rejects.toThrow()
    await expect(t.db.execute(`INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('x','expense',-1,'2025-01-01','${CASH}','${FOOD}','','t','t')`)).rejects.toThrow()
    await expect(t.db.execute(`INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,created_at,updated_at) VALUES ('x','expense',1,'hoy','${CASH}','${FOOD}','','t','t')`)).rejects.toThrow()
  })
  it('los ajustes se validan y persisten', async () => {
    const t = setup()
    await t.s.settings.update({ monthStartDay: 15, theme: 'light', profileName: 'Alex' })
    const st = (await t.load()).settings
    expect(st).toMatchObject({ monthStartDay: 15, theme: 'light', profileName: 'Alex', currency: 'COP' })
    await expect(t.s.settings.update({ monthStartDay: 31 })).rejects.toThrow()
    await expect(t.s.settings.update({ dateFormat: 'xx' as never })).rejects.toThrow()
  })
  it('el total sigue siendo coherente tras una secuencia de operaciones mixtas', async () => {
    const t = setup()
    const bank = await t.bank(250_000)
    const a = await t.income(1_000_000, '2025-06-01')
    const b = await t.expense(300_000, '2025-06-02')
    await t.s.transfers.create({ fromAccountId: CASH, toAccountId: bank, amount: 200_000, date: '2025-06-03' })
    await t.s.transactions.update(b, { type: 'expense', amount: 350_000, date: '2025-06-02', accountId: bank, categoryId: FOOD })
    await t.s.transactions.remove(a)
    await t.s.transactions.restore(a)
    const d = await t.load()
    expect(totalBalance(d)).toBe(250_000 + 1_000_000 - 350_000)
  })
})
