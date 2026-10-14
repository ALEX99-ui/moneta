import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeftRight, ArrowRight, BellRing, PiggyBank, Plus, Sparkles, Target, TrendingDown, TrendingUp, Wallet, PieChart as PieIcon, Percent } from 'lucide-react'
import { useApp, useLookups } from '@/app/DataProvider'
import { useUI } from '@/app/UIProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PageHeader } from '@/components/ui/page-header'
import { Amount, CategoryBadge, Delta, IconTile, PeriodPicker, StatCard, monthLabel, useDateFmt } from '@/components/common'
import { BalanceChart, CategoryDonut, ComparisonChart, IncomeExpenseChart, SavingsTrendChart, type BalancePointDatum, type MonthDatum } from '@/components/charts'
import { addDaysISO, addMonthKey, daysBetween, monthKeyOf, monthRange, monthsInRange, previousRange, resolvePeriod, type DateRange, type PeriodSelection } from '@/domain/dates'
import { allocatedToGoals, balanceSeries, lastMonths, monthlySeries, summarize, totalBalance, totalsByCategory } from '@/domain/ledger'
import { budgetOverview } from '@/domain/budgets'
import { goalProgress } from '@/domain/goals'
import { overdueRules } from '@/domain/recurring'
import { formatMoney } from '@/domain/money'
import { generateInsights } from '@/insights'
import { INSIGHT_COLOR } from './Insights'

function previousOf(sel: PeriodSelection, startDay: number): DateRange | null {
  if (sel.mode === 'month') return monthRange(addMonthKey(sel.month, -1), startDay)
  if (sel.mode === 'year') return resolvePeriod({ mode: 'year', year: sel.year - 1 }, startDay)
  if (sel.mode === 'custom') return previousRange(resolvePeriod(sel, startDay))
  return null
}

export function Dashboard() {
  const { data, today } = useApp()
  const ui = useUI()
  const l = useLookups()
  const fmt = useDateFmt()
  const sd = data.settings.monthStartDay
  const [period, setPeriod] = React.useState<PeriodSelection>({ mode: 'month', month: monthKeyOf(today, sd) })

  const m = React.useMemo(() => {
    const range = resolvePeriod(period, sd)
    let prev = previousOf(period, sd)
    // Período en curso: se compara con el mismo tramo del anterior (si no, un mes a medias parecería "mucho menor").
    const inProgress = range.to > today && range.from <= today
    if (prev && inProgress) {
      const elapsed = daysBetween(range.from, today)
      const to = addDaysISO(prev.from, elapsed)
      prev = { from: prev.from, to: to < prev.to ? to : prev.to }
    }
    const cur = summarize(data.transactions, range)
    const before = prev ? summarize(data.transactions, prev) : null

    // Meses para las series
    let months: string[]
    if (period.mode === 'month') months = lastMonths(period.month, 6)
    else if (period.mode === 'year') months = monthsInRange(range, sd).slice(0, 12)
    else months = monthsInRange(range.from < '1970-01-01' ? { from: data.transactions.reduce((a, t) => (t.date < a ? t.date : a), today), to: today } : range, sd).slice(-24)
    if (months.length < 2 && period.mode !== 'month') months = lastMonths(months[0] ?? monthKeyOf(today, sd), 6)
    const series: MonthDatum[] = monthlySeries(data.transactions, months, sd).map((p) => ({ month: p.month, label: monthLabel(p.month, false), income: p.income, expense: p.expense, net: p.net, rate: p.savingsRate }))

    // Evolución del balance (nunca más allá de hoy)
    const end = range.to > today ? today : range.to
    const start = range.from < '1970-01-01' ? series.length ? monthRange(series[0]!.month, sd).from : today : range.from
    const days = daysBetween(start, end)
    let dates: string[] = []
    if (days <= 62) {
      const step = days > 31 ? 2 : 1
      for (let i = 0; i <= days; i += step) dates.push(addDaysISO(start, i))
      if (dates[dates.length - 1] !== end) dates.push(end)
    } else {
      dates = monthsInRange({ from: start, to: end }, sd).map((mk) => (monthRange(mk, sd).to > end ? end : monthRange(mk, sd).to)).filter((d) => d >= start)
    }
    const dayFmt = days <= 62 ? 'd MMM' : 'MMM yy'
    const balance: BalancePointDatum[] = balanceSeries(data, dates).map((p) => ({ date: p.date, label: format(parseISO(p.date), dayFmt, { locale: es }), balance: p.balance }))

    // Presupuesto del período: suma de los meses financieros que cubre
    const bmonths = period.mode === 'month' ? [period.month] : monthsInRange(range, sd).slice(0, 36)
    const ovs = bmonths.map((mk) => budgetOverview(data, mk, sd))
    const budget = { total: ovs.reduce((s, o) => s + o.totalBudget, 0), spent: ovs.reduce((s, o) => s + o.totalSpentBudgeted, 0) }

    const cats = totalsByCategory(data.transactions, range, 'expense')
    const prevCats = prev ? new Map(totalsByCategory(data.transactions, prev, 'expense').map((c) => [c.categoryId, c.amount])) : null
    return { range, prev, cur, before, series, balance, budget, cats, prevCats, inProgress }
  }, [data, period, sd, today])

  const insights = React.useMemo(() => generateInsights(data, today), [data, today])
  const total = totalBalance(data)
  const allocated = allocatedToGoals(data)
  const overdue = overdueRules(data.rules, today)
  const curMonthBudget = budgetOverview(data, monthKeyOf(today, sd), sd)
  const goals = data.goals.filter((g) => !g.archivedAt).slice(0, 4)
  const empty = data.transactions.length === 0 && data.transfers.length === 0

  const latest = React.useMemo(() => {
    const items = [
      ...data.transactions.map((t) => ({ kind: 'tx' as const, id: t.id, date: t.date, created: t.createdAt, t })),
      ...data.transfers.map((t) => ({ kind: 'tr' as const, id: t.id, date: t.date, created: t.createdAt, t })),
    ]
    return items.sort((a, b) => (a.date === b.date ? (a.created < b.created ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 8)
  }, [data.transactions, data.transfers])

  const rate = m.cur.savingsRate
  const periodName = period.mode === 'month' ? monthLabel(period.month) : period.mode === 'year' ? String(period.year) : period.mode === 'custom' ? 'rango elegido' : 'todo el historial'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${data.settings.profileName}`}
        subtitle={format(parseISO(today), "EEEE d 'de' MMMM yyyy", { locale: es }).replace(/^./, (c) => c.toUpperCase())}
        actions={<PeriodPicker value={period} onChange={setPeriod} modes={['month', 'year', 'custom', 'all']} />}
      />

      {overdue.length > 0 && (
        <Link to="/suscripciones" className="mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning transition-colors hover:bg-warning/15">
          <BellRing className="size-4 shrink-0" />
          <span className="flex-1">
            Tienes <strong>{overdue.length}</strong> pago{overdue.length > 1 ? 's' : ''} periódico{overdue.length > 1 ? 's' : ''} vencido{overdue.length > 1 ? 's' : ''} sin registrar ({overdue.slice(0, 3).map((r) => r.name).join(', ')}
            {overdue.length > 3 ? '…' : ''}). Aún no afectan tus saldos.
          </span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      {empty && (
        <Card className="mb-5 overflow-hidden">
          <div className="relative p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-primary/20 blur-3xl" />
            <h2 className="text-xl font-semibold tracking-tight">Bienvenido a MONETA</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">Todo se guarda solo en este equipo, sin Internet. Empieza en tres pasos y tu panel se llenará con tus datos reales.</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { n: 1, t: 'Revisa tus cuentas', d: 'Ajusta el saldo inicial de Efectivo o crea tu cuenta bancaria.', to: '/cuentas' },
                { n: 2, t: 'Registra un ingreso', d: 'Tu salario u otra fuente. Es la base para calcular tu ahorro.', action: () => ui.openTransaction({ type: 'income' }) },
                { n: 3, t: 'Anota tus gastos', d: 'Con Ctrl+N lo haces en segundos.', action: () => ui.openTransaction({ type: 'expense', quick: true }) },
              ].map((s) => (
                <li key={s.n} className="rounded-xl border bg-surface-2/50 p-4">
                  <span className="mb-2 grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{s.n}</span>
                  <p className="text-sm font-medium">{s.t}</p>
                  <p className="mb-3 mt-0.5 text-xs text-muted">{s.d}</p>
                  {s.to ? (
                    <Button asChild size="sm" variant="outline"><Link to={s.to}>Ir a cuentas</Link></Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={s.action}><Plus /> Registrar</Button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Balance total disponible" value={formatMoney(total)} icon={<Wallet />} tone="primary" valueClassName={total < 0 ? 'text-expense' : undefined}
          sub={allocated > 0 ? `${formatMoney(allocated)} asignados a metas · ${formatMoney(total - allocated)} libres` : `${data.accounts.filter((a) => !a.archivedAt).length} cuenta(s) · saldo actual`} />
        <StatCard title={`Ingresos · ${periodName}`} value={formatMoney(m.cur.income)} icon={<TrendingUp />} tone="income" delay={40}
          sub={m.before ? <Delta current={m.cur.income} previous={m.before.income} goodWhenUp label={m.inProgress ? 'vs. mismo tramo anterior' : 'vs. anterior'} /> : `${data.transactions.filter((t) => t.type === 'income').length} registros en total`} />
        <StatCard title={`Gastos · ${periodName}`} value={formatMoney(m.cur.expense)} icon={<TrendingDown />} tone="expense" delay={80}
          sub={m.before ? <Delta current={m.cur.expense} previous={m.before.expense} goodWhenUp={false} label={m.inProgress ? 'vs. mismo tramo anterior' : 'vs. anterior'} /> : 'todo el historial'} />
        <StatCard title="Ahorro neto del período" value={formatMoney(m.cur.net, { sign: true })} icon={<PiggyBank />} tone="saving" delay={120}
          valueClassName={m.cur.net < 0 ? 'text-expense' : m.cur.net > 0 ? 'text-income' : undefined}
          sub="Ingresos − gastos (sin transferencias ni aportes a metas)" />
        <StatCard title="Porcentaje de ingresos ahorrado" value={rate === null ? '—' : `${(rate * 100).toFixed(1).replace('.', ',')}%`} icon={<Percent />} tone={rate !== null && rate < 0 ? 'expense' : 'income'} delay={160}
          valueClassName={rate !== null && rate < 0 ? 'text-expense' : undefined}
          sub={rate === null ? 'Sin ingresos en el período' : rate >= 0.2 ? 'Superas la referencia del 20%' : 'Referencia habitual: 20%'} />
        <StatCard title="Presupuesto restante" value={m.budget.total ? formatMoney(m.budget.total - m.budget.spent) : '—'} icon={<PieIcon />} tone={m.budget.total && m.budget.spent > m.budget.total ? 'expense' : 'warning'} delay={200}
          valueClassName={m.budget.total && m.budget.spent > m.budget.total ? 'text-expense' : undefined}
          sub={m.budget.total ? `${formatMoney(m.budget.spent)} de ${formatMoney(m.budget.total)} (${Math.round((m.budget.spent / m.budget.total) * 100)}%)` : <Link to="/presupuestos" className="text-primary hover:underline">Define presupuestos por categoría</Link>} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Ingresos y gastos" subtitle={period.mode === 'month' ? 'Últimos 6 meses' : 'Por mes dentro del período'} />
          <CardBody>{m.series.some((s) => s.income || s.expense) ? <IncomeExpenseChart series={m.series} /> : <NoData />}</CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Gastos por categoría" subtitle={periodName} />
          <CardBody>{m.cats.length ? <CategoryDonut items={m.cats} total={m.cur.expense} /> : <NoData text="No hay gastos en este período." />}</CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tendencia del ahorro" subtitle="Ingresos − gastos por mes" />
          <CardBody>{m.series.some((s) => s.net) ? <SavingsTrendChart series={m.series} /> : <NoData />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolución del balance" subtitle="Dinero total en cuentas al cierre de cada fecha" />
          <CardBody>{m.balance.length > 1 && data.transactions.length ? <BalanceChart points={m.balance} /> : <NoData />}</CardBody>
        </Card>
        <Card>
          <CardHeader title={m.prev ? 'Período actual vs. anterior' : 'Comparación de períodos'} subtitle={m.prev ? `${periodName} frente al ${m.inProgress ? 'mismo tramo del período previo' : 'período previo'}` : 'Elige un mes, año o rango para comparar'} />
          <CardBody>
            {m.before ? (
              <ComparisonChart
                currentLabel="Actual" previousLabel="Anterior"
                rows={[
                  { name: 'Ingresos', actual: m.cur.income, anterior: m.before.income, color: 'var(--income)' },
                  { name: 'Gastos', actual: m.cur.expense, anterior: m.before.expense, color: 'var(--expense)' },
                  { name: 'Ahorro neto', actual: m.cur.net, anterior: m.before.net, color: 'var(--saving)' },
                ]}
              />
            ) : (
              <NoData text="La comparación no aplica a «todo el historial»." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Categorías con mayor gasto" subtitle={`${periodName}${m.prev ? ' · variación vs. período anterior' : ''}`} action={<Link to="/gastos" className="text-xs text-primary hover:underline">Ver gastos</Link>} />
          <CardBody className="space-y-3">
            {m.cats.length === 0 && <p className="py-8 text-center text-sm text-muted">No hay gastos en este período.</p>}
            {m.cats.slice(0, 5).map((c) => {
              const cat = l.categories.get(c.categoryId)
              const p = m.prevCats?.get(c.categoryId)
              return (
                <div key={c.categoryId}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <CategoryBadge category={cat} />
                    <div className="num text-right text-sm">
                      <span className="font-semibold">{formatMoney(c.amount)}</span>
                      <span className="ml-2 text-xs text-muted">{(c.share * 100).toFixed(0)}%</span>
                      {m.prevCats && (p ? <span className={`ml-2 text-xs ${c.amount > p ? 'text-expense' : 'text-income'}`}>{c.amount > p ? '▲' : '▼'}{Math.abs(Math.round(((c.amount - p) / p) * 100))}%</span> : <span className="ml-2 text-xs text-muted">nuevo</span>)}
                    </div>
                  </div>
                  <Progress value={c.share} color={cat?.color} label={cat?.name} />
                </div>
              )
            })}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Últimas transacciones" action={<Link to="/gastos" className="text-xs text-primary hover:underline">Ver todas</Link>} />
          <CardBody className="pt-2">
            {latest.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Aún no hay movimientos. Usa «Nuevo» o Ctrl+N para registrar el primero.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]/60">
                {latest.map((x) =>
                  x.kind === 'tx' ? (
                    <li key={x.id}>
                      <Link to={`/${x.t.type === 'expense' ? 'gastos' : 'ingresos'}?focus=${x.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2/70">
                        <CategoryBadge category={l.categories.get(x.t.categoryId)} compact />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{x.t.description || l.categories.get(x.t.categoryId)?.name}</span>
                          <span className="block truncate text-xs text-muted">{fmt(x.date)} · {l.categories.get(x.t.categoryId)?.name} · {l.accounts.get(x.t.accountId)?.name}</span>
                        </span>
                        <Amount value={x.t.type === 'expense' ? -x.t.amount : x.t.amount} tone="auto" sign className="text-sm font-semibold" />
                      </Link>
                    </li>
                  ) : (
                    <li key={x.id}>
                      <Link to={`/cuentas?ledger=${x.t.fromAccountId}&focus=${x.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2/70">
                        <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary"><ArrowLeftRight className="size-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{x.t.description || 'Transferencia'}</span>
                          <span className="block truncate text-xs text-muted">{fmt(x.date)} · {l.accounts.get(x.t.fromAccountId)?.name} → {l.accounts.get(x.t.toAccountId)?.name}</span>
                        </span>
                        <span className="num text-sm font-semibold text-muted">{formatMoney(x.t.amount)}</span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Alertas de presupuesto" subtitle="Mes en curso" action={<Link to="/presupuestos" className="text-xs text-primary hover:underline">Presupuestos</Link>} />
            <CardBody className="space-y-3 pt-3">
              {curMonthBudget.rows.length === 0 && <p className="text-sm text-muted">Sin presupuestos definidos. <Link to="/presupuestos" className="text-primary hover:underline">Crear</Link></p>}
              {curMonthBudget.rows.length > 0 && curMonthBudget.rows.every((r) => r.status === 'normal') && <p className="text-sm text-income">Todo dentro de los límites. ✔</p>}
              {curMonthBudget.rows.filter((r) => r.status !== 'normal').slice(0, 4).map((r) => (
                <div key={r.category.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{r.category.name}</span>
                    <Badge tone={r.status === 'exceeded' ? 'expense' : 'warning'}>{r.status === 'exceeded' ? 'Excedido' : 'Cerca del límite'} · {Math.round(r.used * 100)}%</Badge>
                  </div>
                  <Progress value={r.used} color={r.status === 'exceeded' ? 'var(--expense)' : 'var(--warning)'} label={`Uso del presupuesto de ${r.category.name}`} />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Metas de ahorro" action={<Link to="/metas" className="text-xs text-primary hover:underline">Ver metas</Link>} />
            <CardBody className="space-y-3 pt-3">
              {goals.length === 0 && <p className="text-sm text-muted">Aún no tienes metas. <Link to="/metas" className="text-primary hover:underline">Crear una</Link></p>}
              {goals.map((g) => {
                const p = goalProgress(g, data.contributions, today)
                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <IconTile icon={g.icon} color={g.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex justify-between text-sm"><span className="truncate font-medium">{g.name}</span><span className="num text-xs text-muted">{Math.round(p.percent)}%</span></div>
                      <Progress value={p.percent / 100} color={g.color} label={g.name} />
                    </div>
                  </div>
                )
              })}
              {goals.length > 0 && <p className="text-xs text-muted"><Target className="mr-1 inline size-3" />Asignado a metas: {formatMoney(allocated)}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recomendaciones" subtitle="Calculadas localmente con tus movimientos" action={<Link to="/insights" className="text-xs text-primary hover:underline">Ver todas</Link>} />
            <CardBody className="space-y-2.5 pt-3">
              {insights.insights.length === 0 && <p className="text-sm text-muted">{insights.limitedData ? 'Aún no hay historial suficiente (necesitas al menos 2 meses completos). A medida que registres movimientos aparecerán recomendaciones basadas en tus datos.' : 'No hay nada que destacar por ahora. ¡Buen trabajo!'}</p>}
              {insights.insights.slice(0, 3).map((i) => (
                <Link to="/insights" key={i.id} className="flex gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-2/70">
                  <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: INSIGHT_COLOR[i.severity] }} />
                  <span className="text-[13px] leading-5">{i.title}</span>
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function NoData({ text = 'Aún no hay datos para mostrar en este período.' }: { text?: string }) {
  return <div className="grid h-[200px] place-items-center text-center text-sm text-muted">{text}</div>
}
