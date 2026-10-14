import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './app/Shell'
import { Dashboard } from './screens/Dashboard'
import { TransactionsScreen } from './screens/Transactions'
import { AccountsScreen } from './screens/Accounts'
import { BudgetsScreen } from './screens/Budgets'
import { GoalsScreen } from './screens/Goals'
import { SubscriptionsScreen } from './screens/Subscriptions'
import { CalendarScreen } from './screens/Calendar'
import { ReportsScreen } from './screens/Reports'
import { InsightsScreen } from './screens/Insights'
import { SearchScreen } from './screens/Search'
import { SettingsScreen } from './screens/Settings'

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="gastos" element={<TransactionsScreen type="expense" />} />
        <Route path="ingresos" element={<TransactionsScreen type="income" />} />
        <Route path="cuentas" element={<AccountsScreen />} />
        <Route path="presupuestos" element={<BudgetsScreen />} />
        <Route path="metas" element={<GoalsScreen />} />
        <Route path="suscripciones" element={<SubscriptionsScreen />} />
        <Route path="calendario" element={<CalendarScreen />} />
        <Route path="reportes" element={<ReportsScreen />} />
        <Route path="insights" element={<InsightsScreen />} />
        <Route path="buscar" element={<SearchScreen />} />
        <Route path="configuracion" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
