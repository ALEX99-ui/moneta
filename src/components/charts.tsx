import * as React from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCompact, formatMoney } from '@/domain/money'
import { lastMonths, monthlySeries, totalsByCategory } from '@/domain/ledger'
import { monthKeyOf, monthRange, type ISODate } from '@/domain/dates'
import { useApp, useLookups } from '@/app/DataProvider'
import { Card, CardBody, CardHeader } from './ui/card'
import { LegendDot, monthLabel } from './common'
import type { CategoryTotal } from '@/domain/ledger'

/** Colores semánticos de medidas (siguen la paleta del producto y cambian con el tema). */
export const C = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  saving: 'var(--saving)',
  warning: 'var(--warning)',
  grid: 'var(--grid)',
  surface: 'var(--surface)',
}

interface TipRow { name: string; value: number; color: string; format?: (v: number) => string }

function TooltipBox({ title, rows, footer }: { title?: React.ReactNode; rows: TipRow[]; footer?: React.ReactNode }) {
  return (
    <div className="min-w-40 rounded-lg border bg-surface px-3 py-2 text-xs shadow-lg" style={{ boxShadow: 'var(--shadow)' }}>
      {title && <p className="mb-1.5 font-medium text-muted">{title}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-[3px] w-3 rounded-full" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className="num text-[13px] font-semibold text-foreground">{(r.format ?? formatMoney)(r.value)}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t pt-1.5 text-muted">{footer}</div>}
    </div>
  )
}

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const

export interface MonthDatum { month: string; label: string; income: number; expense: number; net: number; rate: number | null }

export function useMonthSeries(endMonth: string, n: number): MonthDatum[] {
  const { data } = useApp()
  return React.useMemo(() => {
    const months = lastMonths(endMonth, n)
    return monthlySeries(data.transactions, months, data.settings.monthStartDay).map((p) => ({
      month: p.month, label: monthLabel(p.month, false), income: p.income, expense: p.expense, net: p.net, rate: p.savingsRate,
    }))
  }, [data.transactions, data.settings.monthStartDay, endMonth, n])
}

/** Ingresos vs gastos por mes (barras agrupadas). */
export function IncomeExpenseChart({ series, height = 260 }: { series: MonthDatum[]; height?: number }) {
  return (
    <div>
      <div className="mb-2 flex gap-4">
        <LegendDot color={C.income}>Ingresos</LegendDot>
        <LegendDot color={C.expense}>Gastos</LegendDot>
      </div>
      <div role="img" aria-label="Gráfico de ingresos y gastos por mes" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={64} tickFormatter={formatCompact} />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={label}
                    rows={[
                      { name: 'Ingresos', value: payload.find((p) => p.dataKey === 'income')?.value as number ?? 0, color: C.income },
                      { name: 'Gastos', value: payload.find((p) => p.dataKey === 'expense')?.value as number ?? 0, color: C.expense },
                    ]}
                    footer={`Neto: ${formatMoney((payload[0]?.payload as MonthDatum).net, { sign: true })}`}
                  />
                ) : null
              }
            />
            <Bar dataKey="income" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Ahorro neto por mes: positivo en verde, negativo en rojo (polaridad + signo en el eje). */
export function SavingsTrendChart({ series, height = 220 }: { series: MonthDatum[]; height?: number }) {
  return (
    <div>
      <div className="mb-2 flex gap-4">
        <LegendDot color={C.income}>Ahorro (ingresos − gastos)</LegendDot>
        <LegendDot color={C.expense}>Déficit</LegendDot>
      </div>
      <div role="img" aria-label="Tendencia del ahorro neto mensual" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={64} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]!.payload as MonthDatum
                return (
                  <TooltipBox
                    title={label}
                    rows={[{ name: d.net >= 0 ? 'Ahorro neto' : 'Déficit', value: d.net, color: d.net >= 0 ? C.income : C.expense }]}
                    footer={d.rate === null ? 'Sin ingresos: no hay % de ahorro' : `Tasa de ahorro: ${(d.rate * 100).toFixed(1).replace('.', ',')}%`}
                  />
                )
              }}
            />
            <Bar dataKey="net" radius={[4, 4, 4, 4]} maxBarSize={26}>
              {series.map((d) => (
                <Cell key={d.month} fill={d.net >= 0 ? C.income : C.expense} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Dona de gastos por categoría con leyenda; agrupa la cola larga en «Otras categorías». */
export function CategoryDonut({ items, total, maxItems = 6 }: { items: CategoryTotal[]; total: number; maxItems?: number }) {
  const l = useLookups()
  const [active, setActive] = React.useState<number | null>(null)
  const slices = React.useMemo(() => {
    const head = items.slice(0, maxItems).map((i) => ({ id: i.categoryId, name: l.categories.get(i.categoryId)?.name ?? '—', color: l.categories.get(i.categoryId)?.color ?? '#94A3B8', value: i.amount, share: i.share }))
    const rest = items.slice(maxItems)
    if (rest.length) {
      const v = rest.reduce((s, r) => s + r.amount, 0)
      head.push({ id: 'other', name: `Otras (${rest.length})`, color: '#64748B', value: v, share: rest.reduce((s, r) => s + r.share, 0) })
    }
    return head
  }, [items, l.categories, maxItems])
  const a = active !== null ? slices[active] : null
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-[190px] shrink-0" role="img" aria-label="Distribución de gastos por categoría">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke={C.surface} strokeWidth={2} onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)} startAngle={90} endAngle={-270}>
              {slices.map((s, i) => (
                <Cell key={s.id} fill={s.color} opacity={active === null || active === i ? 1 : 0.4} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[110px]">
            <p className="truncate text-[11px] text-muted">{a ? a.name : 'Total gastado'}</p>
            <p className="num text-base font-semibold leading-5">{formatMoney(a ? a.value : total)}</p>
            {a && <p className="text-[11px] text-muted">{(a.share * 100).toFixed(1).replace('.', ',')}%</p>}
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-surface-2" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="num text-xs text-muted">{(s.share * 100).toFixed(0)}%</span>
            <span className="num w-24 text-right text-[13px] font-medium">{formatMoney(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BalancePointDatum { date: ISODate; label: string; balance: number }

export function BalanceChart({ points, height = 220 }: { points: BalancePointDatum[]; height?: number }) {
  return (
    <div role="img" aria-label="Evolución del balance total" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--saving)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--saving)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={64} tickFormatter={formatCompact} domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? <TooltipBox title={label} rows={[{ name: 'Balance total', value: payload[0]!.value as number, color: C.saving }]} /> : null
            }
          />
          <Area type="monotone" dataKey="balance" stroke="var(--saving)" strokeWidth={2} fill="url(#balfill)" dot={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface CompareDatum { name: string; actual: number; anterior: number; color: string }

export function ComparisonChart({ rows, currentLabel, previousLabel, height = 220 }: { rows: CompareDatum[]; currentLabel: string; previousLabel: string; height?: number }) {
  return (
    <div>
      <div className="mb-2 flex gap-4">
        <LegendDot color="var(--foreground)">{currentLabel}</LegendDot>
        <LegendDot color="color-mix(in srgb, var(--foreground) 35%, transparent)">{previousLabel}</LegendDot>
      </div>
      <div role="img" aria-label="Comparación entre el período actual y el anterior" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={3} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={64} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={label}
                    rows={[
                      { name: currentLabel, value: (payload[0]!.payload as CompareDatum).actual, color: (payload[0]!.payload as CompareDatum).color },
                      { name: previousLabel, value: (payload[0]!.payload as CompareDatum).anterior, color: 'var(--muted-foreground)' },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="actual" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {rows.map((r) => <Cell key={r.name} fill={r.color} />)}
            </Bar>
            <Bar dataKey="anterior" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {rows.map((r) => <Cell key={r.name} fill={r.color} fillOpacity={0.35} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Ingresos por fuente a lo largo de los últimos 12 meses (barras apiladas con separación de 2 px). */
export function SourceTrendChart() {
  const { data, today } = useApp()
  const l = useLookups()
  const startDay = data.settings.monthStartDay
  const { rows, sources } = React.useMemo(() => {
    const months = lastMonths(monthKeyOf(today, startDay), 12)
    const used = new Map<string, number>()
    const rows = months.map((m) => {
      const r: Record<string, number | string> = { label: monthLabel(m, false) }
      for (const c of totalsByCategory(data.transactions, monthRange(m, startDay), 'income')) {
        r[c.categoryId] = c.amount
        used.set(c.categoryId, (used.get(c.categoryId) ?? 0) + c.amount)
      }
      return r
    })
    return { rows, sources: [...used.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id) }
  }, [data.transactions, today, startDay])
  return (
    <Card>
      <CardHeader title="Ingresos por fuente" subtitle="Últimos 12 meses" />
      <CardBody>
        {sources.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Aún no hay ingresos en los últimos 12 meses.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
              {sources.map((id) => (
                <LegendDot key={id} color={l.categories.get(id)?.color ?? '#94A3B8'}>{l.categories.get(id)?.name}</LegendDot>
              ))}
            </div>
            <div style={{ height: 240 }} role="img" aria-label="Ingresos por fuente en los últimos 12 meses">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="label" {...axisProps} interval={1} />
                  <YAxis {...axisProps} width={64} tickFormatter={formatCompact} />
                  <Tooltip
                    cursor={{ fill: 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <TooltipBox
                          title={label}
                          rows={payload.filter((p) => (p.value as number) > 0).map((p) => ({ name: l.categories.get(String(p.dataKey))?.name ?? '', value: p.value as number, color: String(p.color) }))}
                        />
                      ) : null
                    }
                  />
                  {sources.map((id) => (
                    <Bar key={id} dataKey={id} stackId="s" fill={l.categories.get(id)?.color ?? '#94A3B8'} stroke={C.surface} strokeWidth={2} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
