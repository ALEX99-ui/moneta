import type { DateFormat, ISODate, MonthKey } from './dates'
import type { Money } from './money'

export type AccountType = 'cash' | 'bank' | 'wallet' | 'savings'
export type TxType = 'income' | 'expense'
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly'
export type ThemeName = 'dark' | 'light'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: Money
  color: string
  icon: string
  sortOrder: number
  archivedAt: string | null
  createdAt: string
}

export interface Category {
  id: string
  name: string
  kind: TxType
  icon: string
  color: string
  essential: boolean
  sortOrder: number
  archivedAt: string | null
}

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  archivedAt: string | null
}

/** Movimiento CONFIRMADO de ingreso o gasto. */
export interface Transaction {
  id: string
  type: TxType
  amount: Money
  date: ISODate
  accountId: string
  categoryId: string
  subcategoryId: string | null
  description: string
  paymentMethod: string | null
  merchant: string | null
  notes: string | null
  isRecurring: boolean
  recurringRuleId: string | null
  occurrenceDate: ISODate | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** Movimiento entre cuentas propias: no es ingreso ni gasto. */
export interface Transfer {
  id: string
  fromAccountId: string
  toAccountId: string
  amount: Money
  date: ISODate
  description: string
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  name: string
  description: string | null
  targetAmount: Money
  targetDate: ISODate | null
  accountId: string | null
  color: string
  icon: string
  archivedAt: string | null
  createdAt: string
}

export interface Contribution {
  id: string
  goalId: string
  kind: 'deposit' | 'withdrawal'
  amount: Money
  date: ISODate
  note: string | null
  createdAt: string
}

export interface Budget {
  id: string
  categoryId: string
  /** 'default' aplica a todos los meses; 'YYYY-MM' sobrescribe ese mes. */
  month: 'default' | MonthKey
  amount: Money
}

/** Pago/ingreso periódico PREVISTO. No afecta saldos hasta que se registra como transacción. */
export interface RecurringRule {
  id: string
  name: string
  kind: TxType
  isSubscription: boolean
  amount: Money
  frequency: Frequency
  anchorDate: ISODate
  nextDueDate: ISODate
  categoryId: string
  accountId: string
  status: 'active' | 'paused'
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SavedFilter {
  id: string
  name: string
  scope: TxType
  filter: string
  createdAt: string
}

export interface AppSettings {
  profileName: string
  currency: 'COP'
  dateFormat: DateFormat
  monthStartDay: number
  theme: ThemeName
  autoBackup: boolean
  autoBackupKeep: number
  backupDir: string
}

export interface FinanceData {
  accounts: Account[]
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  transfers: Transfer[]
  goals: Goal[]
  contributions: Contribution[]
  budgets: Budget[]
  rules: RecurringRule[]
  savedFilters: SavedFilter[]
  settings: AppSettings
  tags: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: 'Mi perfil',
  currency: 'COP',
  dateFormat: 'dd/MM/yyyy',
  monthStartDay: 1,
  theme: 'dark',
  autoBackup: true,
  autoBackupKeep: 7,
  backupDir: '',
}

export function emptyData(): FinanceData {
  return {
    accounts: [],
    categories: [],
    subcategories: [],
    transactions: [],
    transfers: [],
    goals: [],
    contributions: [],
    budgets: [],
    rules: [],
    savedFilters: [],
    settings: { ...DEFAULT_SETTINGS },
    tags: [],
  }
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Cuenta bancaria',
  wallet: 'Billetera digital',
  savings: 'Cuenta de ahorros',
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal (14 días)',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
}

export const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Transferencia', 'Tarjeta de crédito', 'PSE', 'Billetera digital', 'Otro'] as const
