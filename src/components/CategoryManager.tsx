import * as React from 'react'
import { Archive, ArchiveRestore, Check, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { useApp } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { CategoryBadge } from '@/components/common'
import { CategoryDialog } from '@/components/forms/CategoryDialog'
import { monthKeyOf, monthRange, type DateRange } from '@/domain/dates'
import { totalsByCategory } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import type { Category, TxType } from '@/domain/types'
import { cn } from '@/lib/utils'

export function CategoryManager() {
  const { data, services, act, today } = useApp()
  const confirm = useConfirm()
  const sd = data.settings.monthStartDay
  const [kind, setKind] = React.useState<TxType>('expense')
  const [period, setPeriod] = React.useState<'month' | 'year' | 'all'>('month')
  const [dialog, setDialog] = React.useState<{ editing?: Category | null } | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [subName, setSubName] = React.useState('')
  const [editSub, setEditSub] = React.useState<{ id: string; name: string } | null>(null)
  const [showArchived, setShowArchived] = React.useState(false)
  const range: DateRange = period === 'month' ? monthRange(monthKeyOf(today, sd), sd) : period === 'year' ? { from: monthRange(`${today.slice(0, 4)}-01`, sd).from, to: monthRange(`${today.slice(0, 4)}-12`, sd).to } : { from: '0000-01-01', to: '9999-12-31' }
  const totals = React.useMemo(() => new Map(totalsByCategory(data.transactions, range, kind).map((c) => [c.categoryId, c])), [data.transactions, range.from, range.to, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = data.categories.filter((c) => c.kind === kind && (showArchived || !c.archivedAt))
  const archivedCount = data.categories.filter((c) => c.kind === kind && c.archivedAt).length
  const budgetOf = (id: string) => data.budgets.find((b) => b.categoryId === id && b.month === 'default')?.amount

  const archive = async (c: Category) => {
    if (await confirm({ title: `¿Archivar «${c.name}»?`, description: 'Se conservan todos sus movimientos e históricos. Solo dejará de ofrecerse al registrar nuevos movimientos; puedes restaurarla cuando quieras.', confirmLabel: 'Archivar' })) await act(() => services.categories.archive(c.id), { success: 'Categoría archivada' })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as TxType)}><TabsList><TabsTrigger value="expense">Categorías de gasto</TabsTrigger><TabsTrigger value="income">Fuentes de ingreso</TabsTrigger></TabsList></Tabs>
        <div className="flex items-center gap-2">
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as 'month' | 'year' | 'all')} aria-label="Período del resumen"><option value="month">Este mes</option><option value="year">Este año</option><option value="all">Todo el historial</option></Select>
          <Button onClick={() => setDialog({})}><Plus /> {kind === 'expense' ? 'Nueva categoría' : 'Nueva fuente'}</Button>
        </div>
      </div>
      <Card className="divide-y divide-[var(--border)]/60 overflow-hidden">
        {cats.map((c) => {
          const t = totals.get(c.id)
          const subs = data.subcategories.filter((s) => s.categoryId === c.id)
          const open = openId === c.id
          const b = budgetOf(c.id)
          return (
            <div key={c.id} className={cn(c.archivedAt && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setOpenId(open ? null : c.id)} className="text-muted hover:text-foreground" aria-label={open ? 'Ocultar subcategorías' : 'Ver subcategorías'} aria-expanded={open}><ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} /></button>
                <div className="w-52 shrink-0"><CategoryBadge category={c} /></div>
                <div className="hidden min-w-0 flex-1 sm:block">
                  <Progress value={t?.share ?? 0} color={c.color} label={`Participación de ${c.name}`} />
                </div>
                <div className="num w-44 shrink-0 text-right text-sm"><span className="font-medium">{formatMoney(t?.amount ?? 0)}</span><span className="ml-2 text-xs text-muted">{t ? `${(t.share * 100).toFixed(1).replace('.', ',')}%` : '0%'}</span></div>
                <div className="hidden w-32 shrink-0 text-right lg:block">{kind === 'expense' && (b ? <Badge tone="primary">Presup. {formatMoney(b)}</Badge> : <span className="text-xs text-muted">Sin presupuesto</span>)}{c.essential && kind === 'expense' && <Badge className="ml-1">Esencial</Badge>}</div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${c.name}`} onClick={() => setDialog({ editing: c })}><Pencil /></Button>
                  {c.archivedAt ? <Button variant="ghost" size="icon-sm" aria-label={`Restaurar ${c.name}`} onClick={() => void act(() => services.categories.unarchive(c.id), { success: 'Categoría restaurada' })}><ArchiveRestore /></Button> : <Button variant="ghost" size="icon-sm" aria-label={`Archivar ${c.name}`} onClick={() => void archive(c)}><Archive /></Button>}
                </div>
              </div>
              {open && (
                <div className="border-t bg-surface-2/30 px-4 py-3 pl-14">
                  <p className="mb-2 text-xs font-medium text-muted">Subcategorías</p>
                  <ul className="mb-2 space-y-1">
                    {subs.length === 0 && <li className="text-xs text-muted">Sin subcategorías.</li>}
                    {subs.map((s) => (
                      <li key={s.id} className={cn('flex items-center gap-2 text-sm', s.archivedAt && 'opacity-50')}>
                        {editSub?.id === s.id ? (
                          <>
                            <Input autoFocus className="h-8 max-w-60" value={editSub.name} onChange={(e) => setEditSub({ ...editSub, name: e.target.value })} aria-label="Nuevo nombre" onKeyDown={(e) => { if (e.key === 'Enter') void act(() => services.categories.renameSubcategory(s.id, editSub.name), { success: 'Subcategoría renombrada' }).then(() => setEditSub(null)) }} />
                            <Button variant="ghost" size="icon-sm" aria-label="Guardar" onClick={() => void act(() => services.categories.renameSubcategory(s.id, editSub.name), { success: 'Subcategoría renombrada' }).then(() => setEditSub(null))}><Check /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Cancelar" onClick={() => setEditSub(null)}><X /></Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1">{s.name}{s.archivedAt && ' (archivada)'}</span>
                            <Button variant="ghost" size="icon-sm" aria-label={`Renombrar ${s.name}`} onClick={() => setEditSub({ id: s.id, name: s.name })}><Pencil /></Button>
                            {s.archivedAt ? <Button variant="ghost" size="icon-sm" aria-label={`Restaurar ${s.name}`} onClick={() => void act(() => services.categories.unarchiveSubcategory(s.id))}><ArchiveRestore /></Button> : <Button variant="ghost" size="icon-sm" aria-label={`Archivar ${s.name}`} onClick={() => void act(() => services.categories.archiveSubcategory(s.id))}><Archive /></Button>}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!c.archivedAt && (
                    <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); if (subName.trim()) void act(() => services.categories.addSubcategory(c.id, subName), { success: 'Subcategoría creada' }).then((r) => r.ok && setSubName('')) }}>
                      <Input className="h-8" placeholder="Nueva subcategoría" value={subName} onChange={(e) => setSubName(e.target.value)} aria-label="Nombre de la subcategoría" />
                      <Button size="sm" type="submit" disabled={!subName.trim()}><Plus /> Agregar</Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>
      {archivedCount > 0 && <button className="mt-3 text-sm font-medium text-muted hover:text-foreground" onClick={() => setShowArchived((s) => !s)}>{showArchived ? 'Ocultar' : 'Mostrar'} archivadas ({archivedCount})</button>}
      <CategoryDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} editing={dialog?.editing} kind={kind} />
    </div>
  )
}
