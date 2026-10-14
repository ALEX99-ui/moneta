import * as React from 'react'
import { Archive, CalendarClock, CheckCircle2, Ellipsis, Info, Pause, Pencil, Play, Plus, Repeat, SkipForward } from 'lucide-react'
import { useApp, useLookups } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { Amount, CategoryBadge, StatCard, useDateFmt } from '@/components/common'
import { RegisterPaymentDialog, RuleDialog } from '@/components/forms/RuleDialogs'
import { addDaysISO, daysBetween } from '@/domain/dates'
import { annualCost, monthlyEquivalent, plannedEvents, plannedTotal } from '@/domain/recurring'
import { formatMoney } from '@/domain/money'
import { FREQUENCY_LABEL, type RecurringRule } from '@/domain/types'
import { cn } from '@/lib/utils'

export function SubscriptionsScreen() {
  const { data, services, act, today } = useApp()
  const l = useLookups()
  const fmt = useDateFmt()
  const confirm = useConfirm()
  const [tab, setTab] = React.useState<'subs' | 'other'>('subs')
  const [dialog, setDialog] = React.useState<{ editing?: RecurringRule | null } | null>(null)
  const [paying, setPaying] = React.useState<RecurringRule | null>(null)
  const live = data.rules.filter((r) => !r.archivedAt)
  const list = live.filter((r) => (tab === 'subs' ? r.isSubscription : !r.isSubscription))
  const activeSubs = live.filter((r) => r.isSubscription && r.kind === 'expense' && r.status === 'active')
  const monthly = activeSubs.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0)
  const annual = activeSubs.reduce((s, r) => s + annualCost(r.amount, r.frequency), 0)
  const next30 = plannedEvents(data.rules, data.transactions, { from: '0000-01-01', to: addDaysISO(today, 30) }, today)
  const upcoming = plannedEvents(data.rules, data.transactions, { from: today, to: addDaysISO(today, 60) }, today)
  const overdue = plannedEvents(data.rules, data.transactions, { from: '0000-01-01', to: addDaysISO(today, -1) }, today)

  const archive = async (r: RecurringRule) => {
    if (await confirm({ title: `¿Archivar «${r.name}»?`, description: 'Se deja de prever. Los pagos que ya registraste se conservan en tus gastos.', confirmLabel: 'Archivar' })) await act(() => services.recurring.archive(r.id), { success: 'Archivado' })
  }
  const status = (r: RecurringRule) => {
    if (r.status === 'paused') return <Badge>Pausado</Badge>
    const d = daysBetween(today, r.nextDueDate)
    if (d < 0) return <Badge tone="warning">Vencido hace {-d} día{-d === 1 ? '' : 's'}</Badge>
    if (d === 0) return <Badge tone="primary">Previsto hoy</Badge>
    return <Badge tone="neutral">Previsto en {d} día{d === 1 ? '' : 's'}</Badge>
  }

  return (
    <div>
      <PageHeader title="Suscripciones y pagos periódicos" subtitle="Controla lo que pagas cada cierto tiempo y cuánto te cuesta al año." actions={<Button onClick={() => setDialog({})}><Plus /> Nuevo</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Costo mensual equivalente" value={formatMoney(monthly)} icon={<Repeat />} tone="primary" sub={`${activeSubs.length} suscripción${activeSubs.length === 1 ? '' : 'es'} activa${activeSubs.length === 1 ? '' : 's'}`} />
        <StatCard title="Costo anual proyectado" value={formatMoney(annual)} icon={<CalendarClock />} tone="warning" delay={40} sub="Suma de pagos por año" />
        <StatCard title="Previstos próximos 30 días" value={formatMoney(plannedTotal(next30, 'expense'))} icon={<CalendarClock />} tone="expense" delay={80} sub={`${next30.filter((e) => e.rule.kind === 'expense').length} pago(s) por registrar · aún no descontados`} />
        <StatCard title="Vencidos sin registrar" value={overdue.length} icon={<Info />} tone={overdue.length ? 'warning' : 'income'} delay={120} sub={overdue.length ? formatMoney(plannedTotal(overdue, 'expense')) : 'Todo al día'} />
      </div>
      <p className="mb-5 flex items-start gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span><Badge tone="neutral" className="mr-1">Previsto</Badge> no afecta tus saldos ni reportes. Al pulsar <strong>Registrar pago</strong> se crea un gasto <Badge tone="income" className="mx-1">Confirmado</Badge> en la cuenta elegida y la fecha prevista avanza. Nunca se descuentan pagos que aún no ocurren.</span>
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'subs' | 'other')}>
            <TabsList className="mb-3"><TabsTrigger value="subs">Suscripciones</TabsTrigger><TabsTrigger value="other">Otros pagos periódicos</TabsTrigger></TabsList>
          </Tabs>
          <Card className="overflow-hidden">
            {list.length === 0 ? (
              <EmptyState icon={<Repeat />} title={tab === 'subs' ? 'Sin suscripciones' : 'Sin otros pagos periódicos'} description={tab === 'subs' ? 'Agrega Netflix, Spotify, software o membresías para ver su costo mensual y anual.' : 'Arriendo, seguros, cuotas o ingresos que se repiten (como tu nómina).'} action={<Button onClick={() => setDialog({})}><Plus /> Agregar</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted"><th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-3 font-medium">Frecuencia</th><th className="px-3 font-medium">Próximo pago</th><th className="px-3 text-right font-medium">Valor</th><th className="px-3 text-right font-medium">Mensual</th><th className="px-3 text-right font-medium">Anual</th><th className="w-12" /></tr></thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className={cn('border-b border-[var(--border)]/60 last:border-0 hover:bg-surface-2/50', r.status === 'paused' && 'opacity-60')}>
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><CategoryBadge category={l.categories.get(r.categoryId)} compact /><div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-muted">{l.accounts.get(r.accountId)?.name} · {r.kind === 'income' ? 'Ingreso' : 'Gasto'}</p></div></div></td>
                        <td className="px-3 text-muted">{FREQUENCY_LABEL[r.frequency]}</td>
                        <td className="px-3"><div className="num">{fmt(r.nextDueDate)}</div><div className="mt-0.5">{status(r)}</div></td>
                        <td className="px-3 text-right"><Amount value={r.amount} tone={r.kind} className="font-medium" /></td>
                        <td className="num px-3 text-right text-muted">{formatMoney(monthlyEquivalent(r.amount, r.frequency))}</td>
                        <td className="num px-3 text-right text-muted">{formatMoney(annualCost(r.amount, r.frequency))}</td>
                        <td className="px-2">
                          <Menu>
                            <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${r.name}`}><Ellipsis /></Button></MenuTrigger>
                            <MenuContent>
                              <MenuItem onSelect={() => setPaying(r)} disabled={r.status === 'paused'}><CheckCircle2 /> {r.kind === 'income' ? 'Registrar cobro' : 'Registrar pago'}</MenuItem>
                              <MenuItem onSelect={() => void act(() => services.recurring.skipNext(r.id), { success: 'Ocurrencia omitida' })}><SkipForward /> Omitir próxima</MenuItem>
                              <MenuItem onSelect={() => setDialog({ editing: r })}><Pencil /> Editar</MenuItem>
                              <MenuItem onSelect={() => void act(() => services.recurring.setStatus(r.id, r.status === 'active' ? 'paused' : 'active'))}>{r.status === 'active' ? <><Pause /> Pausar</> : <><Play /> Reanudar</>}</MenuItem>
                              <MenuSeparator />
                              <MenuItem danger onSelect={() => void archive(r)}><Archive /> Archivar</MenuItem>
                            </MenuContent>
                          </Menu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Próximos 60 días" subtitle="Eventos previstos (aún no confirmados)" />
          <CardBody className="pt-3">
            {overdue.length + upcoming.length === 0 ? <p className="py-6 text-center text-sm text-muted">No hay pagos previstos.</p> : (
              <ul className="space-y-1">
                {[...overdue, ...upcoming].slice(0, 14).map((e, i) => (
                  <li key={`${e.rule.id}-${e.date}-${i}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-2/50">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{e.rule.name}</p><p className={cn('text-xs', e.overdue ? 'text-warning' : 'text-muted')}>{fmt(e.date)}{e.overdue ? ' · vencido' : ''}</p></div>
                    <Amount value={e.rule.amount} tone={e.rule.kind} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <RuleDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} editing={dialog?.editing} defaults={tab === 'other' ? { isSubscription: false } : undefined} />
      <RegisterPaymentDialog rule={paying} onClose={() => setPaying(null)} />
    </div>
  )
}
