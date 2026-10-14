import { z } from 'zod'
import { isISODate } from '@/domain/dates'
import { MAX_AMOUNT } from '@/domain/money'

/** Esquemas compartidos por los formularios (React Hook Form) y por los servicios (defensa en profundidad). */

export const amountSchema = z
  .number({ error: 'Ingresa un valor' })
  .int('Solo pesos enteros')
  .positive('El valor debe ser mayor que cero')
  .max(MAX_AMOUNT, 'El valor es demasiado grande')

export const dateSchema = z.string({ error: 'Ingresa una fecha' }).refine(isISODate, 'Fecha inválida')

/** Fecha válida y no futura: los movimientos son siempre confirmados; lo futuro se registra como pago previsto. */
export const pastDateSchema = (today: string) =>
  dateSchema.refine((d) => d <= today, 'La fecha no puede ser futura. Para pagos futuros usa Suscripciones y pagos.')

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null))

const name = (label: string) => z.string({ error: `Ingresa ${label}` }).trim().min(1, `Ingresa ${label}`).max(80, 'Máximo 80 caracteres')
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido')
const icon = z.string().min(1).max(40)
const id = z.string().min(1)

export const transactionSchema = (today: string) =>
  z.object({
    id: id.optional(),
    type: z.enum(['income', 'expense']),
    amount: amountSchema,
    date: pastDateSchema(today),
    accountId: id,
    categoryId: z.string({ error: 'Elige una categoría' }).min(1, 'Elige una categoría'),
    subcategoryId: z.string().nullish().transform((v) => v || null),
    description: z.string().trim().max(200, 'Máximo 200 caracteres').default(''),
    paymentMethod: optText(40),
    merchant: optText(100),
    notes: optText(1000),
    isRecurring: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(30)).max(10, 'Máximo 10 etiquetas').default([]),
  })
export type TransactionInput = z.input<ReturnType<typeof transactionSchema>>
export type TransactionData = z.output<ReturnType<typeof transactionSchema>>

export const transferSchema = (today: string) =>
  z
    .object({
      id: id.optional(),
      fromAccountId: z.string({ error: 'Elige la cuenta de origen' }).min(1, 'Elige la cuenta de origen'),
      toAccountId: z.string({ error: 'Elige la cuenta de destino' }).min(1, 'Elige la cuenta de destino'),
      amount: amountSchema,
      date: pastDateSchema(today),
      description: z.string().trim().max(200).default(''),
    })
    .refine((t) => t.fromAccountId !== t.toAccountId, { message: 'El origen y el destino deben ser distintos', path: ['toAccountId'] })
export type TransferInput = z.input<ReturnType<typeof transferSchema>>

export const accountSchema = z.object({
  id: id.optional(),
  name: name('un nombre'),
  type: z.enum(['cash', 'bank', 'wallet', 'savings']),
  initialBalance: z.number({ error: 'Ingresa el saldo inicial' }).int('Solo pesos enteros').min(-MAX_AMOUNT).max(MAX_AMOUNT),
  color: color.default('#6366F1'),
  icon: icon.default('wallet'),
})
export type AccountInput = z.input<typeof accountSchema>

export const categorySchema = z.object({
  id: id.optional(),
  name: name('un nombre'),
  kind: z.enum(['income', 'expense']),
  icon: icon.default('tag'),
  color: color.default('#6366F1'),
  essential: z.boolean().default(false),
})
export type CategoryInput = z.input<typeof categorySchema>

export const goalSchema = z.object({
  id: id.optional(),
  name: name('un nombre'),
  description: optText(300),
  targetAmount: amountSchema,
  targetDate: z.string().nullish().transform((v) => v || null).refine((v) => v === null || isISODate(v), 'Fecha inválida'),
  accountId: z.string().nullish().transform((v) => v || null),
  color: color.default('#10B981'),
  icon: icon.default('target'),
})
export type GoalInput = z.input<typeof goalSchema>

export const contributionSchema = (today: string) =>
  z.object({
    goalId: id,
    kind: z.enum(['deposit', 'withdrawal']),
    amount: amountSchema,
    date: pastDateSchema(today),
    note: optText(200),
  })
export type ContributionInput = z.input<ReturnType<typeof contributionSchema>>

export const budgetSchema = z.object({
  categoryId: id,
  month: z.string().refine((m) => m === 'default' || /^\d{4}-(0[1-9]|1[0-2])$/.test(m), 'Mes inválido'),
  amount: amountSchema.nullable(),
})
export type BudgetInput = z.input<typeof budgetSchema>

export const ruleSchema = z.object({
  id: id.optional(),
  name: name('un nombre'),
  kind: z.enum(['expense', 'income']),
  isSubscription: z.boolean().default(true),
  amount: amountSchema,
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']),
  nextDueDate: dateSchema,
  categoryId: z.string({ error: 'Elige una categoría' }).min(1, 'Elige una categoría'),
  accountId: z.string({ error: 'Elige una cuenta' }).min(1, 'Elige una cuenta'),
  notes: optText(300),
})
export type RuleInput = z.input<typeof ruleSchema>

export const settingsSchema = z.object({
  profileName: z.string().trim().min(1, 'Ingresa un nombre').max(60),
  dateFormat: z.enum(['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy']),
  monthStartDay: z.number().int().min(1, 'Entre 1 y 28').max(28, 'Entre 1 y 28'),
  theme: z.enum(['dark', 'light']),
  autoBackup: z.boolean(),
  autoBackupKeep: z.number().int().min(1).max(60),
  backupDir: z.string().max(500),
})
export type SettingsInput = z.input<typeof settingsSchema>
