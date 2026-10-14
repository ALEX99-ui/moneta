import { withFriendlyErrors, type Db } from '@/db/types'
import { defaultContext, type ServiceContext } from './context'
import { accountService, categoryService } from './catalog'
import { budgetService, goalService, recurringService, settingsService } from './planning'
import { transactionService, transferService } from './transactions'

export type { ServiceContext } from './context'

export function createServices(db: Db, ctx: ServiceContext = defaultContext(db)) {
  return {
    ctx,
    transactions: withFriendlyErrors(transactionService(ctx)),
    transfers: withFriendlyErrors(transferService(ctx)),
    accounts: withFriendlyErrors(accountService(ctx)),
    categories: withFriendlyErrors(categoryService(ctx)),
    budgets: withFriendlyErrors(budgetService(ctx)),
    goals: withFriendlyErrors(goalService(ctx)),
    recurring: withFriendlyErrors(recurringService(ctx)),
    settings: withFriendlyErrors(settingsService(ctx)),
  }
}
export type Services = ReturnType<typeof createServices>
