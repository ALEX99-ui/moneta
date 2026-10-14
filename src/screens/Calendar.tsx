import * as React from 'react'
import { ChevronLeft, ChevronRight, Flag, Repeat } from 'lucide-react'
import { eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp, useLookups } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Amount, LegendDot, monthLabel } from '@/components/common'
import { addMonthKey, toISO } from '@/domain/dates'
import { plannedEvents } from '@/domain/recurring'
import { formatCompact, formatMoney } from '@/domain/money'
import { cn } from '@/lib/utils'

/** Calendario financiero: movimientos confirmados (relleno) vs. eventos previstos (borde punteado). */
export function CalendarScreen() {
  const { data, today } = useApp()
  const l = useLookups()
  const [month, setMonth] = React.useState(today.slice(0, 7))
  const [selected, setSelected] = React.useState(today)
  const first = startOfMonth(parseISO(`${month}-01`))
  const days = eachDayOfInterval({ start: startOfWeek(first, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(first), { weekStartsOn: 1 }) })
  const gridFrom = toISO(days[0]!)
  const gridTo = toISO(days[days.length - 1]!)

  const byDay = React.useMemo(() => {
    const m = new Map<string, { income: number; expense: number; planned: number; transfers: number; goals: string[]; txs: typeof data.transactions; planned_: ReturnType<typeof plannedEvents>; transfers_: typeof data.transfers }>()
    const get = (d: string) => m.get(d) ?? m.set(d, { income: 0, expense: 0, planned: 0, transfers: 0, goals: [], txs: [], planned_: [], transfers_: [] }).get(d)!
    for (const t of data.transactions) if (t.date >= gridFrom && t.date <= gridTo) { const e = get(t.date); (t.type === 'income' ? (e.income += t.amount) : (e.expense += t.amount)); e.txs.push(t) }
    for (const tr of data.transfers) if (tr.date >= gridFrom && tr.date <= gridTo) { const e = get(tr.date); e.transfers += tr.amount; e.transfers_.push(tr) }
    for (const ev of plannedEvents(data.rules, data.transactions, { from: gridFrom, to: gridTo }, today)) { const e = get(ev.date); e.planned += ev.rule.kind === 'expense' ? -ev.rule.amount : ev.rule.amount; e.planned_.push(ev) }
    for (const g of data.goals) if (!g.archivedAt && g.targetDate && g.targetDate >= gridFrom && g.targetDate <= gridTo) get(g.targetDate).goals.push(g.name)
    return m
  }, [data, gridFrom, gridTo, today])

  const sel = byDay.get(selected)
  const selGoals = data.goals.filter((g) => !g.archivedAt && g.targetDate === selected)
  const dow = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const longDate = format(parseISO(selected), "EEEE d 'de' MMMM yyyy", { locale: es }).replace(/^./, (c) => c.toUpperCase())
  const isFuture = selected > today

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Calendario financiero</h1><p className="mt-1 text-sm text-muted">Lo confirmado ya afectó tus saldos; lo previsto todavía no.</p></div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setMonth(addMonthKey(month, -1))}><ChevronLeft /></Button>
          <div className="min-w-36 text-center text-sm font-semibold">{monthLabel(month)}</div>
          <Button variant="ghost" size="icon" aria-label="Mes siguiente" onClick={() => setMonth(addMonthKey(month, 1))}><ChevronRight /></Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }}>Hoy</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-4">
        <LegendDot color="var(--income)">Ingresos confirmados</LegendDot><LegendDot color="var(--expense)">Gastos confirmados</LegendDot>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="size-2.5 rounded-[3px] border-2 border-dashed border-warning" />Pagos previstos</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Flag className="size-3 text-primary" />Fecha objetivo de meta</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted">{dow.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const iso = toISO(d)
              const e = byDay.get(iso)
              const inMonth = iso.slice(0, 7) === month
              const isSel = iso === selected
              return (
                <button key={iso} onClick={() => { setSelected(iso); if (!inMonth) setMonth(iso.slice(0, 7)) }} aria-label={`${format(d, "d 'de' MMMM", { locale: es })}`} aria-pressed={isSel}
                  className={cn('relative flex h-[92px] flex-col items-stretch gap-0.5 border-b border-r border-[var(--border)]/60 p-1.5 text-left transition-colors hover:bg-surface-2/60 [&:nth-child(7n)]:border-r-0', !inMonth && 'opacity-40', isSel && 'bg-primary/10 ring-1 ring-inset ring-primary')}>
                  <span className={cn('grid size-6 place-items-center rounded-full text-xs', iso === today && 'bg-primary font-semibold text-white')}>{format(d, 'd')}</span>
                  {e?.income ? <span className="num truncate rounded bg-income/15 px-1 text-[10px] font-medium text-income">+{formatCompact(e.income).replace('$ ', '').replace('$ ', '')}</span> : null}
                  {e?.expense ? <span className="num truncate rounded bg-expense/15 px-1 text-[10px] font-medium text-expense">−{formatCompact(e.expense).replace('$ ', '').replace('$ ', '')}</span> : null}
                  {e?.planned_.length ? <span className="num truncate rounded border border-dashed border-warning/70 px-1 text-[10px] text-warning">{e.planned_.length} prev.</span> : null}
                  {e?.goals.length ? <Flag className="absolute right-1.5 top-1.5 size-3 text-primary" /> : null}
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title={longDate} subtitle={isFuture ? 'Día futuro: solo eventos previstos' : selected === today ? 'Hoy' : undefined} />
          <CardBody className="space-y-4 pt-3">
            {!sel && selGoals.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin movimientos ni eventos este día.</p>}
            {sel && sel.txs.length + sel.transfers_.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted"><Badge tone="income">Confirmado</Badge></p>
                <ul className="space-y-1">
                  {sel.txs.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.description || l.categories.get(t.categoryId)?.name}</p><p className="truncate text-xs text-muted">{l.categories.get(t.categoryId)?.name} · {l.accounts.get(t.accountId)?.name}</p></div><Amount value={t.type === 'expense' ? -t.amount : t.amount} tone="auto" sign className="text-sm font-semibold" /></li>
                  ))}
                  {sel.transfers_.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.description || 'Transferencia'}</p><p className="truncate text-xs text-muted">{l.accounts.get(t.fromAccountId)?.name} → {l.accounts.get(t.toAccountId)?.name}</p></div><span className="num text-sm text-muted">{formatMoney(t.amount)}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {sel && sel.planned_.length > 0 && (
              <div>
                <p className="mb-1.5"><Badge tone="warning">Previsto · aún no afecta saldos</Badge></p>
                <ul className="space-y-1">
                  {sel.planned_.map((e) => (
                    <li key={e.rule.id + e.date} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-warning/50 px-2 py-1.5"><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-sm font-medium"><Repeat className="size-3 text-muted" />{e.rule.name}</p><p className="text-xs text-muted">{e.overdue ? 'Vencido, sin registrar' : 'Por registrar'}</p></div><Amount value={e.rule.kind === 'expense' ? -e.rule.amount : e.rule.amount} tone="auto" sign className="text-sm" /></li>
                  ))}
                </ul>
              </div>
            )}
            {selGoals.length > 0 && (
              <div><p className="mb-1.5 text-xs font-medium text-muted">Fecha objetivo de meta</p><ul>{selGoals.map((g) => <li key={g.id} className="flex items-center gap-2 px-2 py-1 text-sm"><Flag className="size-3.5 text-primary" />{g.name} · {formatMoney(g.targetAmount)}</li>)}</ul></div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
