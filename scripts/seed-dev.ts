/**
 * SOLO DESARROLLO / PRUEBAS E2E: llena una base de datos de desarrollo con datos de ejemplo para ver la interfaz.
 * Uso: MONETA_DEV_DB=.dev-data/dev.db npx vite-node scripts/seed-dev.ts
 * La aplicación instalada NUNCA incluye datos de ejemplo.
 */
import fs from 'node:fs'
import { createNodeDb } from '../src/db/nodeSqliteDb'
import { createServices } from '../src/services'
import { defaultContext } from '../src/services/context'
import { addDaysISO, addMonthsISO, todayISO } from '../src/domain/dates'

const file = process.env.MONETA_DEV_DB ?? '.dev-data/dev.db'
fs.mkdirSync(file.replace(/[^/]+$/, '') || '.', { recursive: true })
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true })
const db = createNodeDb(file)
const s = createServices(db, defaultContext(db))
const today = todayISO()

// Pseudoaleatorio determinista
let seed = 42
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!
const round = (n: number, to = 500) => Math.round(n / to) * to

const bank = await s.accounts.create({ name: 'Bancolombia', type: 'bank', initialBalance: 1_800_000, color: '#F59E0B', icon: 'landmark' })
const nequi = await s.accounts.create({ name: 'Nequi', type: 'wallet', initialBalance: 120_000, color: '#A855F7', icon: 'smartphone' })
const ahorros = await s.accounts.create({ name: 'Ahorros', type: 'savings', initialBalance: 2_000_000, color: '#10B981', icon: 'piggy-bank' })
await s.accounts.update('acc_cash', { name: 'Efectivo', type: 'cash', initialBalance: 150_000, color: '#14B8A6', icon: 'banknote' })

const startMonth = addMonthsISO(today.slice(0, 7) + '-01', -6)
for (let i = 0; i <= 6; i++) {
  const first = addMonthsISO(startMonth, i)
  const d = (day: number) => addDaysISO(first, day - 1)
  const ok = (date: string) => date <= today
  if (ok(d(1))) await s.transactions.create({ type: 'income', amount: 4_200_000, date: d(1), accountId: bank, categoryId: 'cat_ing_salario', description: 'Nómina', merchant: 'Empresa S.A.S.' })
  if (i % 2 === 0 && ok(d(12))) await s.transactions.create({ type: 'income', amount: round(600_000 + rnd() * 900_000, 10_000), date: d(12), accountId: nequi, categoryId: 'cat_ing_independiente', description: 'Proyecto freelance', merchant: 'Cliente' })
  if (ok(d(2))) await s.transactions.create({ type: 'expense', amount: 1_100_000, date: d(2), accountId: bank, categoryId: 'cat_vivienda', subcategoryId: 'sub_vivienda_1', description: 'Arriendo', paymentMethod: 'Transferencia' })
  if (ok(d(5))) await s.transactions.create({ type: 'expense', amount: 90_000, date: d(5), accountId: bank, categoryId: 'cat_salud', description: 'Gimnasio', merchant: 'Smart Fit', isRecurring: true })
  if (ok(d(6))) await s.transactions.create({ type: 'expense', amount: round(180_000 + rnd() * 60_000, 1000), date: d(6), accountId: bank, categoryId: 'cat_servicios', description: 'Servicios públicos' })
  if (ok(d(8))) await s.transactions.create({ type: 'expense', amount: 95_000, date: d(8), accountId: bank, categoryId: 'cat_internet', subcategoryId: 'sub_internet_1', description: 'Internet hogar' })
  for (let k = 0; k < 9; k++) {
    const day = 3 + Math.floor(rnd() * 25)
    if (!ok(d(day))) continue
    await s.transactions.create({ type: 'expense', amount: round(25_000 + rnd() * 140_000, 500), date: d(day), accountId: pick([bank, 'acc_cash', nequi]), categoryId: 'cat_alimentacion', subcategoryId: pick(['sub_alimentacion_1', 'sub_alimentacion_2', 'sub_alimentacion_3']), description: pick(['Mercado Éxito', 'Almuerzo', 'Domicilio', 'Restaurante', 'Panadería']), tags: rnd() > 0.7 ? ['trabajo'] : [] })
  }
  for (let k = 0; k < 5; k++) {
    const day = 2 + Math.floor(rnd() * 26)
    if (!ok(d(day))) continue
    await s.transactions.create({ type: 'expense', amount: round(5_000 + rnd() * 40_000, 500), date: d(day), accountId: pick([nequi, 'acc_cash']), categoryId: 'cat_transporte', subcategoryId: pick(['sub_transporte_1', 'sub_transporte_3']), description: pick(['Uber', 'Metro', 'Gasolina']) })
  }
  for (let k = 0; k < 3; k++) {
    const day = 5 + Math.floor(rnd() * 22)
    if (!ok(d(day))) continue
    await s.transactions.create({ type: 'expense', amount: round(30_000 + rnd() * 160_000, 1000), date: d(day), accountId: bank, categoryId: pick(['cat_entretenimiento', 'cat_compras', 'cat_tecnologia']), description: pick(['Cine', 'Salida con amigos', 'Ropa', 'Accesorios', 'Videojuego']) })
  }
  if (ok(d(10))) await s.transfers.create({ fromAccountId: bank, toAccountId: ahorros, amount: 500_000, date: d(10), description: 'Ahorro mensual' })
}

for (const [cat, amount] of [['cat_alimentacion', 700_000], ['cat_transporte', 200_000], ['cat_entretenimiento', 150_000], ['cat_compras', 200_000]] as const) {
  await s.budgets.set({ categoryId: cat, month: 'default', amount })
}
const goal1 = await s.goals.create({ name: 'Computador nuevo', description: 'MacBook para trabajo', targetAmount: 6_000_000, targetDate: addMonthsISO(today, 8), accountId: ahorros, color: '#6366F1', icon: 'laptop' })
const goal2 = await s.goals.create({ name: 'Fondo de emergencia', targetAmount: 12_000_000, accountId: ahorros, color: '#10B981', icon: 'shield' })
await s.goals.create({ name: 'Viaje a Cartagena', targetAmount: 2_500_000, targetDate: addMonthsISO(today, 4), color: '#06B6D4', icon: 'plane' })
for (let i = 4; i >= 1; i--) {
  await s.goals.contribute({ goalId: goal1, kind: 'deposit', amount: 400_000, date: addMonthsISO(today, -i) })
  await s.goals.contribute({ goalId: goal2, kind: 'deposit', amount: 300_000, date: addDaysISO(addMonthsISO(today, -i), 2) })
}
await s.recurring.create({ name: 'Netflix', kind: 'expense', amount: 38_900, frequency: 'monthly', nextDueDate: addDaysISO(today, 6), categoryId: 'cat_suscripciones', accountId: bank })
await s.recurring.create({ name: 'Spotify', kind: 'expense', amount: 16_900, frequency: 'monthly', nextDueDate: addDaysISO(today, 12), categoryId: 'cat_suscripciones', accountId: nequi })
await s.recurring.create({ name: 'Claro móvil', kind: 'expense', amount: 65_000, frequency: 'monthly', nextDueDate: addDaysISO(today, -3), categoryId: 'cat_internet', accountId: bank, isSubscription: false })
await s.recurring.create({ name: 'iCloud 2 TB', kind: 'expense', amount: 38_000, frequency: 'monthly', nextDueDate: addDaysISO(today, 20), categoryId: 'cat_suscripciones', accountId: bank })
await s.recurring.create({ name: 'Seguro del carro', kind: 'expense', amount: 1_200_000, frequency: 'yearly', nextDueDate: addMonthsISO(today, 3), categoryId: 'cat_transporte', accountId: bank, isSubscription: false })
await s.settings.update({ profileName: 'Alex' })
console.log('Datos de desarrollo creados en', file)
db.close()
