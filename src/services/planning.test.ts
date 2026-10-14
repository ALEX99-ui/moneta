import { describe, expect, it } from 'vitest'
import { CASH, ENTERTAINMENT, FOOD, SALARY, setup, SUBS, TRANSPORT } from '@/test/helpers'
import { budgetOverview, budgetStatus, effectiveBudget } from '@/domain/budgets'
import { goalProgress } from '@/domain/goals'
import { accountBalance, allocatedToGoals, summarize, totalBalance } from '@/domain/ledger'
import { annualCost, monthlyEquivalent, nextAfter, occurrenceAt, overdueRules, plannedEvents, plannedTotal } from '@/domain/recurring'
import { monthRange } from '@/domain/dates'

describe('regla 9: presupuestos por período y categoría', () => {
  it('estados normal / cerca / excedido', () => {
    expect(budgetStatus(0, 500_000)).toBe('normal')
    expect(budgetStatus(399_999, 500_000)).toBe('normal')
    expect(budgetStatus(400_000, 500_000)).toBe('near')
    expect(budgetStatus(500_000, 500_000)).toBe('near')
    expect(budgetStatus(500_001, 500_000)).toBe('exceeded')
  })
  it('calcula gastado, restante y % solo con gastos de esa categoría y mes', async () => {
    const t = setup()
    await t.s.budgets.set({ categoryId: FOOD, month: 'default', amount: 500_000 })
    await t.s.budgets.set({ categoryId: TRANSPORT, month: 'default', amount: 200_000 })
    await t.expense(300_000, '2025-06-03')
    await t.expense(100_000, '2025-05-31') // mes anterior: no cuenta
    await t.income(900_000, '2025-06-04') // ingreso: no cuenta
    await t.s.transactions.create({ type: 'expense', amount: 210_000, date: '2025-06-10', accountId: CASH, categoryId: TRANSPORT })
    await t.s.transactions.create({ type: 'expense', amount: 77_000, date: '2025-06-11', accountId: CASH, categoryId: ENTERTAINMENT })
    const d = await t.load()
    const ov = budgetOverview(d, '2025-06')
    const food = ov.rows.find((r) => r.category.id === FOOD)!
    const tr = ov.rows.find((r) => r.category.id === TRANSPORT)!
    expect(food).toMatchObject({ budget: 500_000, spent: 300_000, remaining: 200_000, status: 'normal' })
    expect(food.used).toBeCloseTo(0.6)
    expect(tr).toMatchObject({ spent: 210_000, remaining: -10_000, status: 'exceeded' })
    expect(ov.totalBudget).toBe(700_000)
    expect(ov.totalSpentBudgeted).toBe(510_000)
    expect(ov.remaining).toBe(190_000)
    expect(ov.unbudgetedSpent).toBe(77_000)
    expect(budgetOverview(d, '2025-05').rows.find((r) => r.category.id === FOOD)?.spent).toBe(100_000)
  })
  it('presupuesto específico del mes sobrescribe el predeterminado y se puede quitar', async () => {
    const t = setup()
    await t.s.budgets.set({ categoryId: FOOD, month: 'default', amount: 500_000 })
    await t.s.budgets.set({ categoryId: FOOD, month: '2025-12', amount: 800_000 })
    await t.s.budgets.set({ categoryId: FOOD, month: '2025-12', amount: 850_000 }) // upsert
    let d = await t.load()
    expect(effectiveBudget(d.budgets, FOOD, '2025-12')).toEqual({ amount: 850_000, source: 'month' })
    expect(effectiveBudget(d.budgets, FOOD, '2025-11')).toEqual({ amount: 500_000, source: 'default' })
    await t.s.budgets.set({ categoryId: FOOD, month: '2025-12', amount: null })
    d = await t.load()
    expect(effectiveBudget(d.budgets, FOOD, '2025-12')?.source).toBe('default')
    expect(await t.s.budgets.copyMonth('2025-11', '2026-01')).toBe(1)
    await expect(t.s.budgets.set({ categoryId: SALARY, month: 'default', amount: 10 })).rejects.toThrow(/gasto/)
    await expect(t.s.budgets.set({ categoryId: FOOD, month: '2025-13', amount: 10 })).rejects.toThrow()
  })
  it('respeta el primer día del mes financiero', async () => {
    const t = setup('2025-07-01')
    await t.s.budgets.set({ categoryId: FOOD, month: 'default', amount: 100_000 })
    await t.expense(30_000, '2025-05-20') // período 2025-05 si inicia el 15 → 15 may – 14 jun
    await t.expense(20_000, '2025-06-10') // también 2025-05
    await t.expense(10_000, '2025-06-16') // período 2025-06
    const d = await t.load()
    expect(budgetOverview(d, '2025-05', 15).rows[0]?.spent).toBe(50_000)
    expect(budgetOverview(d, '2025-06', 15).rows[0]?.spent).toBe(10_000)
    expect(budgetOverview(d, '2025-06', 1).rows[0]?.spent).toBe(30_000)
  })
  it('sin presupuestos el resumen está vacío y en estado normal', async () => {
    const d = await setup().load()
    const ov = budgetOverview(d, '2025-06')
    expect(ov).toMatchObject({ rows: [], totalBudget: 0, remaining: 0, status: 'normal' })
  })
})

describe('metas de ahorro', () => {
  it('aportes y retiros, porcentaje y restante', async () => {
    const t = setup()
    const g = await t.s.goals.create({ name: 'Fondo de emergencia', targetAmount: 1_000_000 })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 300_000, date: '2025-05-01' })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 300_000, date: '2025-06-01' })
    await t.s.goals.contribute({ goalId: g, kind: 'withdrawal', amount: 100_000, date: '2025-06-02' })
    const d = await t.load()
    const p = goalProgress(d.goals[0]!, d.contributions, '2025-06-15')
    expect(p).toMatchObject({ saved: 500_000, remaining: 500_000, completed: false })
    expect(p.percent).toBeCloseTo(50)
    expect(allocatedToGoals(d)).toBe(500_000)
  })
  it('no permite retirar más de lo ahorrado ni aportar a metas archivadas o con fecha futura', async () => {
    const t = setup()
    const g = await t.s.goals.create({ name: 'Viaje', targetAmount: 500_000 })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 100_000, date: '2025-06-01' })
    await expect(t.s.goals.contribute({ goalId: g, kind: 'withdrawal', amount: 100_001, date: '2025-06-02' })).rejects.toThrow(/supera/)
    await expect(t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 10, date: '2025-06-20' })).rejects.toThrow(/futura/)
    await t.s.goals.archive(g)
    await expect(t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 10, date: '2025-06-02' })).rejects.toThrow(/archivada/)
  })
  it('el trigger de la base también impide retiros excesivos y eliminar aportes que dejarían saldo negativo', async () => {
    const t = setup()
    const g = await t.s.goals.create({ name: 'X', targetAmount: 500_000 })
    const dep = await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 100_000, date: '2025-06-01' })
    await expect(t.db.execute(`INSERT INTO goal_contributions (id,goal_id,kind,amount,date,created_at) VALUES ('w','${g}','withdrawal',200000,'2025-06-02','t')`)).rejects.toThrow()
    await t.s.goals.contribute({ goalId: g, kind: 'withdrawal', amount: 60_000, date: '2025-06-02' })
    await expect(t.s.goals.removeContribution(dep)).rejects.toThrow(/negativo/)
  })
  it('proyección: sin datos suficientes no inventa; con ritmo estima fecha y evalúa la fecha objetivo', async () => {
    const t = setup()
    const g = await t.s.goals.create({ name: 'Computador', targetAmount: 3_000_000, targetDate: '2025-12-15' })
    let d = await t.load()
    expect(goalProgress(d.goals[0]!, d.contributions, '2025-06-15')).toMatchObject({ monthlyPace: null, eta: null, onTrack: null })
    expect(goalProgress(d.goals[0]!, d.contributions, '2025-06-15').note).toMatch(/suficientes/)
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 300_000, date: '2025-04-15' })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 300_000, date: '2025-05-15' })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 300_000, date: '2025-06-14' })
    d = await t.load()
    const p = goalProgress(d.goals[0]!, d.contributions, '2025-06-15')
    expect(p.saved).toBe(900_000)
    expect(p.monthlyPace).toBe(Math.round(900_000 / (61 / 30))) // 900k durante 61 días de historia
    expect(p.eta).not.toBeNull()
    expect(p.requiredMonthly).toBeGreaterThan(0)
    expect(typeof p.onTrack).toBe('boolean')
  })
  it('meta cumplida', async () => {
    const t = setup()
    const g = await t.s.goals.create({ name: 'Pequeña', targetAmount: 100_000 })
    await t.s.goals.contribute({ goalId: g, kind: 'deposit', amount: 150_000, date: '2025-06-01' })
    const d = await t.load()
    expect(goalProgress(d.goals[0]!, d.contributions, '2025-06-15')).toMatchObject({ completed: true, percent: 100, remaining: 0 })
  })
})

describe('pagos recurrentes y suscripciones', () => {
  const mk = (t: ReturnType<typeof setup>, over: Record<string, unknown> = {}) =>
    t.s.recurring.create({ name: 'Netflix', kind: 'expense', amount: 38_900, frequency: 'monthly', nextDueDate: '2025-06-20', categoryId: SUBS, accountId: CASH, ...over })

  it('equivalencias mensual y anual', () => {
    expect(monthlyEquivalent(38_900, 'monthly')).toBe(38_900)
    expect(annualCost(38_900, 'monthly')).toBe(466_800)
    expect(monthlyEquivalent(120_000, 'yearly')).toBe(10_000)
    expect(annualCost(120_000, 'yearly')).toBe(120_000)
    expect(monthlyEquivalent(30_000, 'weekly')).toBe(130_000)
    expect(monthlyEquivalent(100_000, 'quarterly')).toBe(33_333)
    expect(annualCost(15_000, 'biweekly')).toBe(390_000)
  })
  it('ocurrencias sin deriva en meses cortos', () => {
    expect(occurrenceAt('2025-01-31', 'monthly', 1)).toBe('2025-02-28')
    expect(occurrenceAt('2025-01-31', 'monthly', 2)).toBe('2025-03-31')
    expect(nextAfter('2025-01-31', 'monthly', '2025-02-28')).toBe('2025-03-31')
    expect(occurrenceAt('2025-01-06', 'weekly', 3)).toBe('2025-01-27')
  })
  it('regla 7 y 8: lo previsto no cuenta hasta registrarse', async () => {
    const t = setup()
    const r = await mk(t)
    let d = await t.load()
    expect(totalBalance(d)).toBe(0)
    expect(summarize(d.transactions, monthRange('2025-06')).expense).toBe(0)
    const ev = plannedEvents(d.rules, d.transactions, monthRange('2025-06'), '2025-06-15')
    expect(ev.map((e) => e.date)).toEqual(['2025-06-20'])
    expect(plannedTotal(ev, 'expense')).toBe(38_900)
    // Registrar el pago
    t.setToday('2025-06-20')
    const txId = await t.s.recurring.registerPayment(r)
    d = await t.load()
    expect(totalBalance(d)).toBe(-38_900)
    expect(d.transactions.find((x) => x.id === txId)).toMatchObject({ isRecurring: true, recurringRuleId: r, occurrenceDate: '2025-06-20', description: 'Netflix' })
    expect(d.rules[0]!.nextDueDate).toBe('2025-07-20')
    expect(plannedEvents(d.rules, d.transactions, monthRange('2025-06'), '2025-06-20')).toHaveLength(0)
    expect(plannedEvents(d.rules, d.transactions, monthRange('2025-07'), '2025-06-20').map((e) => e.date)).toEqual(['2025-07-20'])
  })
  it('no duplica: cada ocurrencia se registra una sola vez', async () => {
    const t = setup()
    const r = await mk(t, { nextDueDate: '2025-06-10' })
    await t.s.recurring.registerPayment(r)
    await t.s.recurring.registerPayment(r) // avanza a la ocurrencia siguiente (10 jul) pero hoy es 15 jun
    const d = await t.load()
    expect(d.transactions).toHaveLength(2)
    expect(d.transactions.map((x) => x.occurrenceDate).sort()).toEqual(['2025-06-10', '2025-07-10'])
    // forzar manualmente la misma ocurrencia: el índice único la rechaza
    await expect(t.db.execute(`INSERT INTO transactions (id,type,amount,date,account_id,category_id,description,is_recurring,recurring_rule_id,occurrence_date,created_at,updated_at) VALUES ('dup','expense',38900,'2025-06-15','${CASH}','${SUBS}','',1,'${r}','2025-06-10','t','t')`)).rejects.toThrow()
  })
  it('eliminar el pago registrado devuelve la regla a pendiente; deshacer lo reconcilia', async () => {
    const t = setup()
    const r = await mk(t, { nextDueDate: '2025-06-10' })
    const tx = await t.s.recurring.registerPayment(r)
    expect((await t.load()).rules[0]!.nextDueDate).toBe('2025-07-10')
    await t.s.transactions.remove(tx)
    let d = await t.load()
    expect(d.rules[0]!.nextDueDate).toBe('2025-06-10')
    expect(totalBalance(d)).toBe(0)
    await t.s.transactions.restore(tx)
    d = await t.load()
    expect(d.rules[0]!.nextDueDate).toBe('2025-07-10')
    expect(totalBalance(d)).toBe(-38_900)
  })
  it('pausar excluye de lo previsto; omitir avanza sin registrar; vencidas se detectan', async () => {
    const t = setup()
    const r = await mk(t, { nextDueDate: '2025-06-01' })
    let d = await t.load()
    expect(overdueRules(d.rules, '2025-06-15')).toHaveLength(1)
    await t.s.recurring.skipNext(r)
    d = await t.load()
    expect(d.rules[0]!.nextDueDate).toBe('2025-07-01')
    expect(d.transactions).toHaveLength(0)
    await t.s.recurring.setStatus(r, 'paused')
    d = await t.load()
    expect(plannedEvents(d.rules, d.transactions, monthRange('2025-07'), '2025-06-15')).toHaveLength(0)
  })
  it('ingresos recurrentes (salario) y validaciones', async () => {
    const t = setup()
    const r = await t.s.recurring.create({ name: 'Salario', kind: 'income', isSubscription: false, amount: 3_000_000, frequency: 'monthly', nextDueDate: '2025-06-30', categoryId: SALARY, accountId: CASH })
    t.setToday('2025-06-30')
    await t.s.recurring.registerPayment(r)
    expect(totalBalance(await t.load())).toBe(3_000_000)
    await expect(t.s.recurring.create({ name: 'Malo', kind: 'expense', amount: 10, frequency: 'monthly', nextDueDate: '2025-06-30', categoryId: SALARY, accountId: CASH })).rejects.toThrow(/categoría/)
    await expect(t.s.recurring.registerPayment(r, { date: '2025-07-02' })).rejects.toThrow(/futura/)
  })
  it('registrar con un monto distinto al previsto (la factura cambió)', async () => {
    const t = setup()
    const r = await mk(t, { nextDueDate: '2025-06-10', name: 'Internet', amount: 90_000 })
    await t.s.recurring.registerPayment(r, { amount: 95_500 })
    expect(accountBalance(await t.load(), CASH)).toBe(-95_500)
  })
})
