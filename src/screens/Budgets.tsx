import * as React from 'react'
import { AlertTriangle, CopyPlus, Ellipsis, PieChart, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useApp } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/dropdown'
import { Field, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { useConfirm } from '@/components/ui/confirm'
import { CategoryBadge, PeriodPicker, StatCard, monthLabel } from '@/components/common'
import { budgetOverview, effectiveBudget, type BudgetRow, type BudgetStatus } from '@/domain/budgets'
import { addMonthKey, daysBetween, monthKeyOf, monthRange, type MonthKey } from '@/domain/dates'
import { totalsByCategory } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import { cn } from '@/lib/utils'

const STATUS: Record<BudgetStatus, { label: string; tone: 'income' | 'warning' | 'expense'; color: string }> = {
  normal: { label: 'Normal', tone: 'income', color: 'var(--income)' },
  near: { label: 'Cerca del límite', tone: 'warning', color: 'var(--warning)' },
  exceeded: { label: 'Excedido', tone: 'expense', color: 'var(--expense)' },
}

export function BudgetsScreen() {
  const { data, services, act, today } = useApp()
  const confirm = useConfirm()
  const sd = data.settings.monthStartDay
  const [month, setMonth] = React.useState<MonthKey>(monthKeyOf(today, sd))
  const [dialog, setDialog] = React.useState<{ categoryId?: string } | null>(null)
  const ov = React.useMemo(() => budgetOverview(data, month, sd), [data, month, sd])
  const range = monthRange(month, sd)
  const unbudgeted = React.useMemo(
    () => totalsByCategory(data.transactions, range, 'expense').filter((c) => !effectiveBudget(data.budgets, c.categoryId, month)),
    [data.transactions, data.budgets, range, month],
  )
  const isCurrent = month === monthKeyOf(today, sd)
  const daysLeft = isCurrent ? Math.max(0, daysBetween(today, range.to)) : 0
  const catOf = (id: string) => data.categories.find((c) => c.id === id)

  const remove = async (r: BudgetRow) => {
    const specific = data.budgets.some((b) => b.categoryId === r.category.id && b.month === month)
    const ok = await confirm({
      title: `Quitar presupuesto de ${r.category.name}`,
      description: specific ? `Se elimina el presupuesto de ${monthLabel(month)}${data.budgets.some((b) => b.categoryId === r.category.id && b.month === 'default') ? '; volverá a aplicarse el predeterminado de la categoría' : ''}.` : 'Se elimina el presupuesto predeterminado: dejará de aplicarse en todos los meses sin presupuesto propio.',
      confirmLabel: 'Quitar', destructive: true,
    })
    if (ok) await act(() => services.budgets.set({ categoryId: r.category.id, month: specific ? month : 'default', amount: null }), { success: 'Presupuesto eliminado' })
  }

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        subtitle="Define cuánto quieres gastar por categoría. El estado se calcula con los gastos reales del período."
        actions={
          <>
            <Button variant="outline" onClick={() => void act(() => services.budgets.copyMonth(addMonthKey(month, -1), month), { success: 'Presupuestos copiados del mes anterior' })}><CopyPlus /> Copiar mes anterior</Button>
            <Button onClick={() => setDialog({})}><Plus /> Nuevo presupuesto</Button>
          </>
        }
      />
      <div className="mb-4"><PeriodPicker value={{ mode: 'month', month }} onChange={(v) => v.mode === 'month' && setMonth(v.month)} modes={['month']} /></div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Presupuesto asignado" value={formatMoney(ov.totalBudget)} icon={<PieChart />} tone="primary" sub={`${ov.rows.length} categoría${ov.rows.length === 1 ? '' : 's'}`} />
        <StatCard title="Gastado (con presupuesto)" value={formatMoney(ov.totalSpentBudgeted)} icon={<Wallet />} tone="expense" delay={40} sub={ov.totalBudget ? `${Math.round(ov.used * 100)}% utilizado` : '—'} />
        <StatCard title={ov.remaining < 0 ? 'Excedido en total' : 'Restante'} value={formatMoney(Math.abs(ov.remaining))} icon={<PieChart />} tone={ov.remaining < 0 ? 'expense' : 'income'} delay={80} valueClassName={ov.remaining < 0 ? 'text-expense' : undefined}
          sub={isCurrent && daysLeft > 0 && ov.remaining > 0 ? `≈ ${formatMoney(Math.floor(ov.remaining / daysLeft))} por día (${daysLeft} días)` : isCurrent ? 'Quedan 0 días' : 'Mes cerrado'} />
        <StatCard title="Estado general" value={STATUS[ov.status].label} icon={<AlertTriangle />} tone={ov.status === 'normal' ? 'income' : ov.status === 'near' ? 'warning' : 'expense'} delay={120} sub={ov.unbudgetedSpent ? `${formatMoney(ov.unbudgetedSpent)} en categorías sin presupuesto` : 'Todo el gasto está presupuestado'} />
      </div>

      <Card>
        <CardHeader title={`Presupuestos de ${monthLabel(month)}`} subtitle="Ordenados por porcentaje utilizado" />
        <CardBody className="pt-3">
          {ov.rows.length === 0 ? (
            <EmptyState icon={<PieChart />} title="Sin presupuestos para este mes" description="Crea un presupuesto por categoría (ej. Alimentación $500.000) y verás cuánto llevas gastado y cuánto te queda." action={<Button onClick={() => setDialog({})}><Plus /> Nuevo presupuesto</Button>} />
          ) : (
            <ul className="space-y-1">
              {ov.rows.map((r) => {
                const st = STATUS[r.status]
                return (
                  <li key={r.category.id} className="group rounded-xl p-3 transition-colors hover:bg-surface-2/50">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <CategoryBadge category={r.category} />
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <Badge tone="neutral">{r.source === 'month' ? 'Solo este mes' : 'Todos los meses'}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="num text-sm"><span className="font-semibold">{formatMoney(r.spent)}</span> <span className="text-muted">de {formatMoney(r.budget)}</span></span>
                        <Menu>
                          <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${r.category.name}`}><Ellipsis /></Button></MenuTrigger>
                          <MenuContent>
                            <MenuItem onSelect={() => setDialog({ categoryId: r.category.id })}><Pencil /> Editar</MenuItem>
                            <MenuItem danger onSelect={() => void remove(r)}><Trash2 /> Quitar presupuesto</MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    </div>
                    <Progress value={r.used} color={st.color} label={`Uso del presupuesto de ${r.category.name}`} />
                    <div className="mt-1.5 flex justify-between text-xs text-muted">
                      <span className="num">{Math.round(r.used * 100)}% utilizado</span>
                      <span className={cn('num', r.remaining < 0 && 'text-expense')}>{r.remaining >= 0 ? `Restan ${formatMoney(r.remaining)}` : `Excedido por ${formatMoney(-r.remaining)}`}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {unbudgeted.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Gasto sin presupuesto" subtitle={`Categorías con gasto en ${monthLabel(month)} que no tienen límite definido`} />
          <CardBody className="pt-3">
            <ul className="divide-y divide-[var(--border)]/60">
              {unbudgeted.map((c) => (
                <li key={c.categoryId} className="flex items-center justify-between gap-3 py-2.5">
                  <CategoryBadge category={catOf(c.categoryId)} />
                  <div className="flex items-center gap-3"><span className="num text-sm font-medium">{formatMoney(c.amount)}</span><Button size="sm" variant="outline" onClick={() => setDialog({ categoryId: c.categoryId })}>Definir límite</Button></div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <BudgetDialog open={!!dialog} categoryId={dialog?.categoryId} month={month} onClose={() => setDialog(null)} />
    </div>
  )
}

function BudgetDialog({ open, categoryId, month, onClose }: { open: boolean; categoryId?: string; month: MonthKey; onClose: () => void }) {
  const { data, services, act } = useApp()
  const cats = data.categories.filter((c) => c.kind === 'expense' && !c.archivedAt)
  const [cat, setCat] = React.useState('')
  const [amount, setAmount] = React.useState<number | null>(null)
  const [scope, setScope] = React.useState<'default' | 'month'>('default')
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const id = categoryId ?? cats[0]?.id ?? ''
    setCat(id)
    const eff = id ? effectiveBudget(data.budgets, id, month) : null
    setAmount(eff?.amount ?? null)
    setScope(eff?.source === 'month' ? 'month' : 'default')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryId])
  const onCat = (id: string) => {
    setCat(id)
    const eff = effectiveBudget(data.budgets, id, month)
    setAmount(eff?.amount ?? null)
    setScope(eff?.source === 'month' ? 'month' : 'default')
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={categoryId ? 'Editar presupuesto' : 'Nuevo presupuesto'} description="Puedes fijar un valor para todos los meses o ajustarlo solo para un mes." size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!amount || amount <= 0) return setError('Ingresa un valor mayor que cero')
            setSaving(true)
            const r = await act(() => services.budgets.set({ categoryId: cat, month: scope === 'month' ? month : 'default', amount }), { success: 'Presupuesto guardado' })
            setSaving(false)
            if (r.ok) onClose()
          }}
        >
          <div className="space-y-4 p-5">
            <Field label="Categoría">
              <Select value={cat} onChange={(e) => onCat(e.target.value)} aria-label="Categoría">
                {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </Select>
            </Field>
            <Field label="Presupuesto mensual" error={error}>
              <MoneyInput value={amount} onChange={(v) => { setAmount(v); setError('') }} autoFocus aria-label="Presupuesto mensual" />
            </Field>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-muted">Aplicar a</legend>
              {([['default', 'Todos los meses (predeterminado)'], ['month', `Solo ${monthLabel(month)}`]] as const).map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                  <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} className="accent-[var(--primary)]" />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !cat}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
