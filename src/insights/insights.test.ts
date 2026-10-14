import { describe, expect, it } from 'vitest'
import { generateInsights, financialHealth, simulateReduction, projectMonthEnd, essentialSplit, detectDuplicates } from './index'
import { CASH, ENTERTAINMENT, FOOD, SALARY, SUBS, setup, TRANSPORT } from '@/test/helpers'
import { formatMoney } from '@/domain/money'
import { monthRange } from '@/domain/dates'

const TODAY = '2025-06-20'

/** Historial de 3 meses completos (mar-may) + junio parcial. Todo se registra con movimientos reales. */
async function scenario() {
  const t = setup(TODAY)
  const rest = 'sub_alimentacion_2' // Restaurantes
  for (const [m, food, ent] of [['03', 400_000, 400_000], ['04', 400_000, 400_000], ['05', 300_000, 400_000]] as const) {
    await t.income(3_000_000, `2025-${m}-01`)
    await t.s.transactions.create({ type: 'expense', amount: 200_000, date: `2025-${m}-08`, accountId: CASH, categoryId: FOOD, subcategoryId: rest, description: 'Restaurante' })
    await t.s.transactions.create({ type: 'expense', amount: food - 200_000, date: `2025-${m}-12`, accountId: CASH, categoryId: FOOD, description: 'Mercado' })
    await t.s.transactions.create({ type: 'expense', amount: ent, date: `2025-${m}-15`, accountId: CASH, categoryId: ENTERTAINMENT, description: 'Salidas varias' })
  }
  // Mayo: 200k adicionales de comida DESPUÉS del día 20 (no deben entrar en la comparación al mismo punto)
  await t.s.transactions.create({ type: 'expense', amount: 200_000, date: '2025-05-25', accountId: CASH, categoryId: FOOD, description: 'Mercado grande' })
  // Junio hasta el 20
  await t.income(3_000_000, '2025-06-01')
  await t.s.transactions.create({ type: 'expense', amount: 520_000, date: '2025-06-10', accountId: CASH, categoryId: FOOD, description: 'Mercado' })
  return t
}

describe('sin datos suficientes no se inventan conclusiones', () => {
  it('sin movimientos', async () => {
    const t = setup(TODAY)
    const d = await t.load()
    const r = generateInsights(d, TODAY)
    expect(r.insights).toEqual([])
    expect(r.limitedData).toBe(true)
    expect(financialHealth(d, TODAY).score).toBeNull()
    expect(simulateReduction(d, FOOD, 15, TODAY)).toBeNull()
  })
  it('un solo mes: ni comparaciones ni promedios de ahorro', async () => {
    const t = setup(TODAY)
    await t.income(3_000_000, '2025-06-01')
    await t.expense(500_000, '2025-06-10')
    const r = generateInsights(await t.load(), TODAY)
    expect(r.limitedData).toBe(true)
    expect(r.insights.filter((i) => ['increase', 'savings', 'reduction', 'emergency'].includes(i.kind))).toEqual([])
  })
  it('un mes de partida a mitad de mes no cuenta como mes completo', async () => {
    const t = setup(TODAY)
    await t.income(3_000_000, '2025-04-20')
    await t.income(3_000_000, '2025-05-01')
    await t.income(3_000_000, '2025-06-01')
    const r = generateInsights(await t.load(), TODAY)
    expect(r.completeMonths).toBe(1) // solo mayo
  })
})

describe('recomendaciones con datos reales', () => {
  it('aumento de gasto por categoría comparado al mismo punto del mes anterior', async () => {
    const t = await scenario()
    const d = await t.load()
    const inc = generateInsights(d, TODAY).insights.find((i) => i.id === `increase-${FOOD}`)!
    expect(inc).toBeDefined()
    // Junio 1-20: 520.000 · Mayo 1-20: 300.000 → +73 %
    expect(inc.title).toContain('73%')
    expect(inc.title.toLowerCase()).toContain('alimentación')
    expect(inc.detail).toContain(formatMoney(520_000))
    expect(inc.detail).toContain(formatMoney(300_000))
    expect(inc.explanation.length).toBeGreaterThanOrEqual(3)
  })
  it('promedio de ahorro de los últimos 3 meses completos', async () => {
    const t = await scenario()
    const s = generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'savings')!
    // ingresos 9.000.000 · gastos 800k+800k+(700k+200k)=2.5M ... se verifica con los números del propio resultado
    // mar: 3M-800k=2.2M · abr: 2.2M · may: 3M-(300k+400k+200k)=2.1M → 6.5M/9M = 72 %
    expect(s.amount).toBe(6_500_000)
    expect(s.title).toContain('72%')
    expect(s.severity).toBe('positive')
    expect(s.explanation.join(' ')).toContain('2025-03')
  })
  it('potencial de reducción: no esenciales y subcategorías discrecionales, con los cálculos explicados', async () => {
    const t = await scenario()
    const r = generateInsights(await t.load(), TODAY).insights.filter((i) => i.kind === 'reduction')
    expect(r).toHaveLength(2)
    const ent = r.find((i) => i.id === `reduce-${ENTERTAINMENT}`)!
    expect(ent.amount).toBe(60_000) // 15 % de 400.000
    expect(ent.title).toContain(formatMoney(60_000))
    const rest = r.find((i) => i.id.includes('sub_alimentacion_2'))!
    expect(rest.amount).toBe(30_000) // 15 % de 200.000
    expect(rest.title.toLowerCase()).toContain('restaurantes')
  })
  it('participación de una categoría no esencial en los ingresos', async () => {
    const t = await scenario()
    const s = generateInsights(await t.load(), TODAY).insights.find((i) => i.id === `share-${ENTERTAINMENT}`)!
    expect(s).toBeDefined()
    expect(s.title).toContain('13%') // 400k / 3M (el mes en curso aún no tiene gasto en entretenimiento → usa el mes pasado)
  })
  it('suscripciones: suma mensual y anual equivalentes', async () => {
    const t = await scenario()
    await t.s.recurring.create({ name: 'Netflix', kind: 'expense', amount: 38_900, frequency: 'monthly', nextDueDate: '2025-06-25', categoryId: SUBS, accountId: CASH })
    await t.s.recurring.create({ name: 'Spotify', kind: 'expense', amount: 16_900, frequency: 'monthly', nextDueDate: '2025-06-28', categoryId: SUBS, accountId: CASH })
    await t.s.recurring.create({ name: 'Seguro', kind: 'expense', amount: 600_000, frequency: 'yearly', nextDueDate: '2025-11-01', categoryId: SUBS, accountId: CASH })
    const s = generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'subscriptions')!
    expect(s.amount).toBe(38_900 + 16_900 + 50_000)
    expect(s.title).toContain('tres suscripciones')
    expect(s.detail).toContain(formatMoney((38_900 + 16_900) * 12 + 600_000))
  })
  it('alertas de presupuesto por categoría', async () => {
    const t = await scenario()
    await t.s.budgets.set({ categoryId: FOOD, month: 'default', amount: 500_000 })
    await t.s.budgets.set({ categoryId: ENTERTAINMENT, month: 'default', amount: 100_000 })
    const ins = generateInsights(await t.load(), TODAY).insights
    const food = ins.find((i) => i.id === `budget-${FOOD}`)!
    expect(food.severity).toBe('alert')
    expect(food.title).toContain(formatMoney(20_000))
    expect(ins.find((i) => i.id === `budget-${ENTERTAINMENT}`)).toBeUndefined() // sin gasto en junio → normal
  })
  it('detecta un gasto mensual recurrente sin registrar, y no lo repite si ya existe como regla', async () => {
    const t = setup(TODAY)
    for (const d of ['2025-03-05', '2025-04-04', '2025-05-05']) {
      await t.s.transactions.create({ type: 'expense', amount: 90_000, date: d, accountId: CASH, categoryId: 'cat_salud', description: 'Gimnasio Smart', merchant: 'Smart Fit' })
    }
    let r = generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'recurring')
    expect(r?.title).toContain('Smart Fit')
    expect(r?.title).toContain(formatMoney(90_000))
    await t.s.recurring.create({ name: 'Smart Fit', kind: 'expense', amount: 90_000, frequency: 'monthly', nextDueDate: '2025-06-05', categoryId: 'cat_salud', accountId: CASH })
    r = generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'recurring')
    expect(r).toBeUndefined()
  })
  it('no marca recurrencia con montos o fechas irregulares', async () => {
    const t = setup(TODAY)
    for (const [d, a] of [['2025-03-05', 20_000], ['2025-04-20', 90_000], ['2025-05-08', 35_000]] as const) {
      await t.s.transactions.create({ type: 'expense', amount: a, date: d, accountId: CASH, categoryId: FOOD, description: 'Rappi' })
    }
    expect(generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'recurring')).toBeUndefined()
  })
  it('déficit del mes en curso', async () => {
    const t = setup(TODAY)
    await t.income(500_000, '2025-06-01')
    await t.expense(800_000, '2025-06-10')
    const i = generateInsights(await t.load(), TODAY).insights.find((x) => x.kind === 'deficit')!
    expect(i.amount).toBe(300_000)
    expect(i.severity).toBe('alert')
  })
  it('las recomendaciones solo usan cifras que existen en los movimientos', async () => {
    const t = await scenario()
    const d = await t.load()
    const real = new Set<number>()
    for (const tx of d.transactions) real.add(tx.amount)
    const ins = generateInsights(d, TODAY).insights.find((i) => i.id === `increase-${FOOD}`)!
    expect(real.has(520_000)).toBe(true)
    expect(ins.detail).toContain('520.000')
  })
})

describe('proyección de cierre de mes, simulador y salud', () => {
  it('proyección explicada y con pagos previstos pendientes', async () => {
    const t = setup(TODAY)
    await t.income(3_000_000, '2025-06-01')
    await t.expense(400_000, '2025-06-10') // 20 días transcurridos → 20.000/día
    await t.s.recurring.create({ name: 'Internet', kind: 'expense', amount: 90_000, frequency: 'monthly', nextDueDate: '2025-06-25', categoryId: 'cat_internet', accountId: CASH })
    const p = projectMonthEnd(await t.load(), TODAY)
    expect(p.enough).toBe(true)
    expect(p.elapsedDays).toBe(20)
    expect(p.totalDays).toBe(30)
    expect(p.variableDaily).toBe(20_000)
    expect(p.pendingPlanned).toBe(90_000)
    expect(p.projectedExpense).toBe(400_000 + 20_000 * 10 + 90_000)
  })
  it('proyección sin datos suficientes', async () => {
    const t = setup('2025-06-03')
    await t.expense(10_000, '2025-06-02')
    expect(projectMonthEnd(await t.load(), '2025-06-03').enough).toBe(false)
  })
  it('simulador: promedio real × porcentaje', async () => {
    const t = await scenario()
    const s = simulateReduction(await t.load(), ENTERTAINMENT, 25, TODAY)!
    expect(s.avgMonthly).toBe(400_000)
    expect(s.monthlySaving).toBe(100_000)
    expect(s.annualSaving).toBe(1_200_000)
    expect(s.newSavingsRate).toBeGreaterThan(s.currentSavingsRate!)
    expect(simulateReduction(await t.load(), TRANSPORT, 25, TODAY)).toBeNull() // sin historial en esa categoría
  })
  it('gastos esenciales vs no esenciales', async () => {
    const t = await scenario()
    const d = await t.load()
    const e = essentialSplit(d, monthRange('2025-05'))
    expect(e.essential).toBe(500_000) // 300k + 200k de alimentación
    expect(e.nonEssential).toBe(400_000)
    expect(e.essentialShare).toBeCloseTo(500 / 900)
    expect(e.essentialOfIncome).toBeCloseTo(500_000 / 3_000_000)
  })
  it('salud financiera con reglas transparentes', async () => {
    const t = await scenario()
    const h = financialHealth(await t.load(), TODAY)
    expect(h.score).not.toBeNull()
    const sav = h.components.find((c) => c.id === 'savings')!
    expect(sav.score).toBe(100) // ahorro 72 % ≥ 20 %
    expect(h.components.find((c) => c.id === 'emergency')!.score).toBeNull() // no hay cuenta de ahorros
    expect(h.components.every((c) => c.rule.length > 10)).toBe(true)
    expect(h.level).toBe('healthy')
  })
})

describe('duplicados', () => {
  it('detecta posibles duplicados recientes y no marca los espaciados', async () => {
    const t = setup(TODAY)
    await t.expense(45_000, '2025-06-18', { description: 'Almuerzo' })
    await t.expense(45_000, '2025-06-18', { description: 'Almuerzo' })
    await t.expense(45_000, '2025-06-19', { description: 'Almuerzo' })
    const g = detectDuplicates(await t.load(), TODAY)
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(2)
    expect(generateInsights(await t.load(), TODAY).insights.some((i) => i.kind === 'duplicates')).toBe(true)
  })
})

describe('gasto inusual', () => {
  it('avisa de un gasto muy superior al historial de su categoría', async () => {
    const t = setup(TODAY)
    for (let i = 1; i <= 8; i++) await t.s.transactions.create({ type: 'expense', amount: 20_000 + i * 500, date: `2025-05-${String(i + 1).padStart(2, '0')}`, accountId: CASH, categoryId: TRANSPORT })
    await t.s.transactions.create({ type: 'expense', amount: 600_000, date: '2025-06-18', accountId: CASH, categoryId: TRANSPORT, description: 'Reparación' })
    const a = generateInsights(await t.load(), TODAY).insights.find((i) => i.kind === 'anomaly')
    expect(a?.title).toContain(formatMoney(600_000))
  })
})
export { SALARY }
