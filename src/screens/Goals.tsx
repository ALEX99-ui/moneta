import * as React from 'react'
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Ellipsis, History, Info, Pencil, PiggyBank, Plus, Target, Trash2 } from 'lucide-react'
import { useApp } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { useConfirm } from '@/components/ui/confirm'
import { Amount, IconTile, StatCard, useDateFmt } from '@/components/common'
import { ContributionDialog, GoalDialog } from '@/components/forms/GoalDialogs'
import { goalProgress, goalSaved } from '@/domain/goals'
import { accountBalances, allocatedToGoals, summarize } from '@/domain/ledger'
import { monthKeyOf, monthRange } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import type { Goal } from '@/domain/types'

export function GoalsScreen() {
  const { data, services, act, today } = useApp()
  const confirm = useConfirm()
  const fmt = useDateFmt()
  const [editing, setEditing] = React.useState<Goal | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [contrib, setContrib] = React.useState<{ goal: Goal; kind: 'deposit' | 'withdrawal' } | null>(null)
  const [history, setHistory] = React.useState<string | null>(null)
  const [showArchived, setShowArchived] = React.useState(false)
  const active = data.goals.filter((g) => !g.archivedAt)
  const archived = data.goals.filter((g) => g.archivedAt)
  const sd = data.settings.monthStartDay
  const month = summarize(data.transactions, monthRange(monthKeyOf(today, sd), sd))
  const allocated = allocatedToGoals(data)
  const allocatedMonth = allocatedToGoals(data, monthRange(monthKeyOf(today, sd), sd))
  const target = active.reduce((s, g) => s + g.targetAmount, 0)
  const balances = React.useMemo(() => accountBalances(data), [data])

  // Aviso de coherencia: metas asociadas a una cuenta que suman más que su saldo
  const overAllocated = data.accounts.filter((a) => !a.archivedAt).map((a) => {
    const sum = active.filter((g) => g.accountId === a.id).reduce((s, g) => s + goalSaved(data.contributions, g.id), 0)
    return { a, sum, bal: balances.get(a.id) ?? 0 }
  }).filter((x) => x.sum > x.bal)

  const archive = async (g: Goal) => {
    const ok = await confirm({ title: `¿Archivar «${g.name}»?`, description: 'Conserva su historial de aportes, pero deja de aparecer entre tus metas activas. Los aportes siguen contando como dinero asignado hasta que los retires.', confirmLabel: 'Archivar' })
    if (ok) await act(() => services.goals.archive(g.id), { success: 'Meta archivada' })
  }

  return (
    <div>
      <PageHeader title="Metas de ahorro" subtitle="Aparta dinero para lo que quieres lograr, sin confundirlo con un gasto." actions={<Button onClick={() => setCreating(true)}><Plus /> Nueva meta</Button>} />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <StatCard title="Ahorro neto del mes" value={formatMoney(month.net, { sign: true })} icon={<PiggyBank />} tone="saving" valueClassName={month.net < 0 ? 'text-expense' : 'text-income'} sub="Ingresos − gastos del mes (resultado del período)" />
        <StatCard title="Asignado a metas (acumulado)" value={formatMoney(allocated)} icon={<Target />} tone="income" delay={40} sub={`${formatMoney(allocatedMonth, { sign: true })} este mes · ya es tu dinero, solo apartado`} />
        <StatCard title="Objetivo total" value={formatMoney(target)} icon={<Target />} tone="primary" delay={80} sub={target ? `${Math.round(Math.min(100, (allocated / target) * 100))}% alcanzado` : 'Sin metas activas'} />
      </div>
      <p className="mb-5 flex items-start gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span><strong>Ahorro neto</strong> mide cuánto te sobró en el período (ingresos − gastos). <strong>Asignado a metas</strong> es dinero que ya tienes en tus cuentas y decides reservar: aportar o retirar no genera ingresos ni gastos, ni cambia tus saldos.</span>
      </p>

      {overAllocated.map(({ a, sum, bal }) => (
        <p key={a.id} className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Las metas asociadas a «{a.name}» suman {formatMoney(sum)} pero la cuenta tiene {formatMoney(bal)}: estás reservando más dinero del que hay en ella.
        </p>
      ))}

      {active.length === 0 ? (
        <Card><EmptyState icon={<Target />} title="Crea tu primera meta" description="Fondo de emergencia, un computador, un viaje… Registra aportes y mira tu progreso y la fecha estimada." action={<Button onClick={() => setCreating(true)}><Plus /> Nueva meta</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((g, i) => {
            const p = goalProgress(g, data.contributions, today)
            const acc = data.accounts.find((a) => a.id === g.accountId)
            return (
              <div key={g.id} className="surface page-enter flex flex-col p-5" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconTile icon={g.icon} color={g.color} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.name}</p>
                      <p className="truncate text-xs text-muted">{g.description || (acc ? `En ${acc.name}` : 'Sin cuenta asociada')}</p>
                    </div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${g.name}`}><Ellipsis /></Button></MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setHistory(g.id)}><History /> Historial de aportes</MenuItem>
                      <MenuItem onSelect={() => setEditing(g)}><Pencil /> Editar</MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => void archive(g)}><Archive /> Archivar</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <p className="num text-2xl font-semibold tracking-tight">{formatMoney(p.saved)}</p>
                  <p className="num text-sm text-muted">de {formatMoney(g.targetAmount)}</p>
                </div>
                <Progress className="mt-2 h-2.5" value={p.percent / 100} color={g.color} label={`Progreso de ${g.name}`} />
                <div className="mt-2 flex justify-between text-xs">
                  <span className="num font-medium" style={{ color: g.color }}>{p.percent.toFixed(p.percent >= 10 ? 0 : 1).replace('.', ',')}%</span>
                  <span className="num text-muted">{p.completed ? '¡Meta cumplida!' : `Faltan ${formatMoney(p.remaining)}`}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted">
                  {g.targetDate && <p>Fecha objetivo: <span className="text-foreground">{fmt(g.targetDate)}</span>{p.requiredMonthly !== null && !p.completed && <> · necesitas ≈ <span className="num text-foreground">{formatMoney(p.requiredMonthly)}</span> al mes</>}</p>}
                  <p>{p.note}</p>
                  {p.onTrack !== null && !p.completed && <Badge tone={p.onTrack ? 'income' : 'warning'}>{p.onTrack ? 'Vas a tiempo' : 'Por debajo del ritmo necesario'}</Badge>}
                </div>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button className="flex-1" variant="success" size="sm" onClick={() => setContrib({ goal: g, kind: 'deposit' })}><ArrowDownToLine /> Aportar</Button>
                  <Button className="flex-1" variant="outline" size="sm" disabled={p.saved <= 0} onClick={() => setContrib({ goal: g, kind: 'withdrawal' })}><ArrowUpFromLine /> Retirar</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <button className="text-sm font-medium text-muted hover:text-foreground" onClick={() => setShowArchived((s) => !s)}>{showArchived ? 'Ocultar' : 'Mostrar'} metas archivadas ({archived.length})</button>
          {showArchived && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {archived.map((g) => (
                <Card key={g.id} className="flex items-center justify-between p-4 opacity-75">
                  <div className="flex items-center gap-3"><IconTile icon={g.icon} color={g.color} size="sm" /><div><p className="text-sm">{g.name}</p><p className="num text-xs text-muted">{formatMoney(goalSaved(data.contributions, g.id))} ahorrados</p></div></div>
                  <Button variant="outline" size="sm" onClick={() => void act(() => services.goals.unarchive(g.id), { success: 'Meta restaurada' })}><ArchiveRestore /> Restaurar</Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <GoalDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }} editing={editing} />
      <ContributionDialog goal={contrib?.goal ?? null} kind={contrib?.kind ?? 'deposit'} onClose={() => setContrib(null)} />
      <HistoryDialog goalId={history} onClose={() => setHistory(null)} />
    </div>
  )
}

function HistoryDialog({ goalId, onClose }: { goalId: string | null; onClose: () => void }) {
  const { data, services, act } = useApp()
  const fmt = useDateFmt()
  const goal = data.goals.find((g) => g.id === goalId)
  const list = data.contributions.filter((c) => c.goalId === goalId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      {goal && (
        <DialogContent title={`Aportes · ${goal.name}`} description="Eliminar un aporte solo es posible si la meta no queda con saldo negativo.">
          <div className="p-5">
            {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">Aún no hay aportes.</p> : (
              <ul className="divide-y divide-[var(--border)]/60">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className={`grid size-8 place-items-center rounded-lg ${c.kind === 'deposit' ? 'bg-income/15 text-income' : 'bg-warning/15 text-warning'}`}>{c.kind === 'deposit' ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}</span>
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.kind === 'deposit' ? 'Aporte' : 'Retiro'}{c.note ? ` · ${c.note}` : ''}</p><p className="text-xs text-muted">{fmt(c.date)}</p></div>
                    <Amount value={c.kind === 'deposit' ? c.amount : -c.amount} tone="auto" sign className="text-sm font-semibold" />
                    <Button variant="ghost" size="icon-sm" aria-label="Eliminar aporte" onClick={() => void act(() => services.goals.removeContribution(c.id), { success: 'Aporte eliminado' })}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
