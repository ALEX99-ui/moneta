import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, BookmarkPlus, Copy, Download, Ellipsis, Filter, Pencil, Plus, Repeat, Search, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApp, useLookups } from '@/app/DataProvider'
import { useUI } from '@/app/UIProvider'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { MoneyInput } from '@/components/ui/money-input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { Amount, CategoryBadge, PeriodPicker, StatCard, useDateFmt } from '@/components/common'
import { filterTransactions, sortTransactions, EMPTY_FILTER, type TxFilter, type TxSort } from '@/domain/filters'
import { resolvePeriod, monthKeyOf, type PeriodSelection } from '@/domain/dates'
import { totalsByCategory } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import { toCsv, transactionsToRows } from '@/domain/csv'
import { saveTextFile } from '@/lib/files'
import { cn } from '@/lib/utils'
import type { Transaction, TxType } from '@/domain/types'
import { SourceTrendChart } from '@/components/charts'

const PAGE_SIZE = 25

interface SavedState {
  text: string
  categoryId: string
  accountId: string
  tag: string
  min: number | null
  max: number | null
  period: PeriodSelection
}

export function TransactionsScreen({ type }: { type: TxType }) {
  const { data, services, act, today } = useApp()
  const ui = useUI()
  const l = useLookups()
  const fmt = useDateFmt()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const focusId = params.get('focus')
  const isExpense = type === 'expense'
  const startDay = data.settings.monthStartDay

  const [period, setPeriod] = React.useState<PeriodSelection>({ mode: 'month', month: monthKeyOf(today, startDay) })
  const [text, setText] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [tag, setTag] = React.useState('')
  const [min, setMin] = React.useState<number | null>(null)
  const [max, setMax] = React.useState<number | null>(null)
  const [advanced, setAdvanced] = React.useState(false)
  const [sort, setSort] = React.useState<TxSort>({ key: 'date', dir: 'desc' })
  const [page, setPage] = React.useState(0)
  const [view, setView] = React.useState('list')
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState<string | null>(null)

  const all = React.useMemo(() => data.transactions.filter((t) => t.type === type), [data.transactions, type])
  const range = React.useMemo(() => resolvePeriod(period, startDay), [period, startDay])
  const filter: TxFilter = React.useMemo(
    () => ({ ...EMPTY_FILTER, text, categoryIds: categoryId ? [categoryId] : [], accountIds: accountId ? [accountId] : [], tag: tag || null, minAmount: min, maxAmount: max, range: period.mode === 'all' ? null : range }),
    [text, categoryId, accountId, tag, min, max, range, period.mode],
  )
  const filtered = React.useMemo(() => sortTransactions(filterTransactions(all, filter, l), sort), [all, filter, l, sort])
  const total = filtered.reduce((s, t) => s + t.amount, 0)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const categories = data.categories.filter((c) => c.kind === type)
  const filterCount = [text, categoryId, accountId, tag, min !== null, max !== null].filter(Boolean).length

  // Al cambiar filtros u orden se vuelve a la primera página (salvo mientras se resalta un movimiento llegado desde la búsqueda).
  React.useEffect(() => {
    if (!highlight) setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort])

  // Llegar desde la búsqueda global: mostrar todo el historial y resaltar el movimiento.
  React.useEffect(() => {
    if (!focusId) return
    const idx = sortTransactions(all, sort).findIndex((t) => t.id === focusId)
    if (idx < 0) return
    setPeriod({ mode: 'all' })
    setText('')
    setCategoryId('')
    setAccountId('')
    setTag('')
    setMin(null)
    setMax(null)
    setPage(Math.floor(idx / PAGE_SIZE))
    setHighlight(focusId)
    const next = new URLSearchParams(params)
    next.delete('focus')
    setParams(next, { replace: true })
    const timer = setTimeout(() => setHighlight(null), 3500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])
  React.useEffect(() => {
    if (highlight) document.getElementById(`tx-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight, page, filtered.length])

  const toggleSort = (key: TxSort['key']) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  const remove = async (t: Transaction) => {
    const ok = await confirm({
      title: isExpense ? '¿Eliminar este gasto?' : '¿Eliminar este ingreso?',
      description: (
        <>
          <strong>{t.description || l.categories.get(t.categoryId)?.name}</strong> por {formatMoney(t.amount)} del {fmt(t.date)}. El saldo de <strong>{l.accounts.get(t.accountId)?.name}</strong> se recalculará. Podrás deshacerlo unos segundos después.
        </>
      ),
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    const done = await act(() => services.transactions.remove(t.id))
    if (!done.ok) return
    toast(isExpense ? 'Gasto eliminado' : 'Ingreso eliminado', {
      duration: 8000,
      action: { label: 'Deshacer', onClick: () => void act(() => services.transactions.restore(t.id), { success: 'Movimiento restaurado' }) },
    })
  }

  const exportCsv = async () => {
    const csv = toCsv(transactionsToRows(data, filtered), ';')
    const path = await saveTextFile(`moneta-${isExpense ? 'gastos' : 'ingresos'}-${today}.csv`, csv, [{ name: 'CSV', extensions: ['csv'] }])
    if (path) toast.success(`Exportados ${filtered.length} movimientos`, { description: path })
  }

  const applySaved = (id: string) => {
    const f = data.savedFilters.find((x) => x.id === id)
    if (!f) return
    try {
      const s = JSON.parse(f.filter) as SavedState
      setText(s.text ?? '')
      setCategoryId(s.categoryId ?? '')
      setAccountId(s.accountId ?? '')
      setTag(s.tag ?? '')
      setMin(s.min ?? null)
      setMax(s.max ?? null)
      if (s.period) setPeriod(s.period)
      setAdvanced(!!(s.min || s.max || s.tag))
    } catch {
      toast.error('El filtro guardado está dañado')
    }
  }
  const clear = () => {
    setText('')
    setCategoryId('')
    setAccountId('')
    setTag('')
    setMin(null)
    setMax(null)
  }
  const savedFilters = data.savedFilters.filter((f) => f.scope === type)
  const biggest = filtered.reduce((m, t) => Math.max(m, t.amount), 0)
  const byCat = React.useMemo(() => totalsByCategory(filtered, { from: '0000-01-01', to: '9999-12-31' }, type), [filtered, type])

  return (
    <div>
      <PageHeader
        title={isExpense ? 'Gastos' : 'Ingresos'}
        subtitle={isExpense ? 'Registra y analiza en qué se va tu dinero.' : 'Todo el dinero que recibes, por fuente y período.'}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Exportar CSV
            </Button>
            <Button onClick={() => ui.openTransaction({ type })}>
              <Plus /> {isExpense ? 'Nuevo gasto' : 'Nuevo ingreso'}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} modes={['month', 'year', 'custom', 'all']} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title={isExpense ? 'Total de gastos (filtrados)' : 'Total de ingresos (filtrados)'} value={formatMoney(total)} icon={isExpense ? <TrendingDown /> : <TrendingUp />} tone={isExpense ? 'expense' : 'income'} sub={filterCount ? `${filterCount} filtro${filterCount > 1 ? 's' : ''} activo${filterCount > 1 ? 's' : ''}` : 'Todo el período'} />
        <StatCard title="Movimientos" value={filtered.length} icon={<ArrowDownUp />} sub={`de ${all.length} registrados`} delay={40} />
        <StatCard title="Promedio" value={formatMoney(filtered.length ? Math.round(total / filtered.length) : 0)} icon={<Filter />} sub="por movimiento" delay={80} />
        <StatCard title="Mayor" value={formatMoney(biggest)} icon={<Repeat />} sub={isExpense ? 'gasto individual más alto' : 'ingreso individual más alto'} delay={120} />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar por descripción, comercio, nota…" className="pl-9" aria-label="Buscar movimientos" />
          </div>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48" aria-label="Filtrar por categoría">
            <option value="">{isExpense ? 'Todas las categorías' : 'Todas las fuentes'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.archivedAt ? ' (archivada)' : ''}</option>
            ))}
          </Select>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-44" aria-label="Filtrar por cuenta">
            <option value="">Todas las cuentas</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Button variant={advanced ? 'secondary' : 'outline'} onClick={() => setAdvanced((a) => !a)}>
            <Filter /> Más filtros
          </Button>
          {filterCount > 0 && (
            <Button variant="ghost" onClick={clear}>
              <X /> Limpiar
            </Button>
          )}
        </div>
        {(advanced || savedFilters.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            {advanced && (
              <>
                <div className="w-40"><MoneyInput value={min} onChange={setMin} placeholder="Valor mínimo" aria-label="Valor mínimo" /></div>
                <div className="w-40"><MoneyInput value={max} onChange={setMax} placeholder="Valor máximo" aria-label="Valor máximo" /></div>
                <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-44" aria-label="Filtrar por etiqueta">
                  <option value="">Todas las etiquetas</option>
                  {data.tags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {savedFilters.length > 0 && (
                <Select defaultValue="" onChange={(e) => { if (e.target.value) applySaved(e.target.value); e.target.value = '' }} className="w-44" aria-label="Filtros guardados">
                  <option value="">Filtros guardados…</option>
                  {savedFilters.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
              )}
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                <BookmarkPlus /> Guardar filtro
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="mb-3">
          <TabsTrigger value="list">Movimientos</TabsTrigger>
          <TabsTrigger value="categories">{isExpense ? 'Por categoría' : 'Por fuente'}</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="overflow-hidden">
            {all.length === 0 ? (
              <EmptyState
                icon={isExpense ? <TrendingDown /> : <TrendingUp />}
                title={isExpense ? 'Aún no registras gastos' : 'Aún no registras ingresos'}
                description={isExpense ? 'Anota tu primer gasto en pocos segundos con el registro rápido (Ctrl+N).' : 'Registra tu salario u otras fuentes para ver cuánto ahorras realmente.'}
                action={<Button onClick={() => ui.openTransaction({ type, quick: true })}><Plus /> Registrar ahora</Button>}
              />
            ) : filtered.length === 0 ? (
              <EmptyState icon={<Search />} title="Sin resultados" description="Ningún movimiento coincide con los filtros y el período seleccionados." action={<Button variant="outline" onClick={() => { clear(); setPeriod({ mode: 'all' }) }}>Ver todo el historial</Button>} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted">
                        <th className="px-4 py-2.5 font-medium">
                          <button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-foreground">Fecha {sort.key === 'date' && (sort.dir === 'desc' ? '↓' : '↑')}</button>
                        </th>
                        <th className="px-3 py-2.5 font-medium">Descripción</th>
                        <th className="px-3 py-2.5 font-medium">{isExpense ? 'Categoría' : 'Fuente'}</th>
                        <th className="px-3 py-2.5 font-medium">Cuenta</th>
                        <th className="px-3 py-2.5 text-right font-medium">
                          <button onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-foreground">Valor {sort.key === 'amount' && (sort.dir === 'desc' ? '↓' : '↑')}</button>
                        </th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.id} id={`tx-${t.id}`} className={cn('group border-b border-[var(--border)]/60 transition-colors last:border-0 hover:bg-surface-2/60', highlight === t.id && 'bg-primary/15 hover:bg-primary/15')}>
                          <td className="num whitespace-nowrap px-4 py-2.5 text-muted">{fmt(t.date)}</td>
                          <td className="max-w-[320px] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 truncate font-medium">
                              {t.description || <span className="text-muted">{l.categories.get(t.categoryId)?.name}</span>}
                              {(t.isRecurring || t.recurringRuleId) && <Repeat className="size-3 shrink-0 text-muted" aria-label="Recurrente" />}
                            </div>
                            {(t.merchant || t.tags.length > 0 || t.subcategoryId) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                {t.subcategoryId && <span>{l.subcategories.get(t.subcategoryId)?.name}</span>}
                                {t.merchant && <span>{t.subcategoryId ? '· ' : ''}{t.merchant}</span>}
                                {t.tags.map((x) => (
                                  <button key={x} onClick={() => { setTag(x); setAdvanced(true) }} className="rounded bg-primary/12 px-1.5 text-primary hover:bg-primary/20">{x}</button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5"><CategoryBadge category={l.categories.get(t.categoryId)} /></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted">{l.accounts.get(t.accountId)?.name}</td>
                          <td className="px-3 py-2.5 text-right font-medium"><Amount value={t.amount} tone={type} /></td>
                          <td className="px-2 py-2.5">
                            <Menu>
                              <MenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Acciones" className="opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100"><Ellipsis /></Button>
                              </MenuTrigger>
                              <MenuContent>
                                <MenuItem onSelect={() => ui.openTransaction({ type, editing: t })}><Pencil /> Editar</MenuItem>
                                <MenuItem onSelect={() => void act(async () => { await services.transactions.duplicate(t.id) }, { success: 'Movimiento duplicado con la fecha de hoy' })}><Copy /> Duplicar</MenuItem>
                                <MenuSeparator />
                                <MenuItem danger onSelect={() => void remove(t)}><Trash2 /> Eliminar</MenuItem>
                              </MenuContent>
                            </Menu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted">
                  <span>
                    {filtered.length} movimiento{filtered.length === 1 ? '' : 's'} · Total <Amount value={total} tone={type} className="font-semibold" />
                  </span>
                  {pageCount > 1 && (
                    <span className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                      Página {page + 1} de {pageCount}
                      <Button variant="ghost" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <div className={cn('grid gap-4', !isExpense && 'xl:grid-cols-2')}>
            <Card>
              <CardHeader title={isExpense ? 'Gasto por categoría' : 'Ingresos por fuente'} subtitle="Sobre los movimientos filtrados. Haz clic en una fila para filtrar." />
              <CardBody className="space-y-3">
                {byCat.length === 0 && <p className="py-6 text-center text-sm text-muted">No hay datos en este período.</p>}
                {byCat.map((c) => {
                  const cat = l.categories.get(c.categoryId)
                  return (
                    <button key={c.categoryId} className="block w-full rounded-lg p-2 text-left transition-colors hover:bg-surface-2" onClick={() => { setCategoryId(c.categoryId); setView('list') }}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <CategoryBadge category={cat} />
                        <span className="num text-sm">
                          <span className="font-semibold">{formatMoney(c.amount)}</span>
                          <span className="ml-2 text-xs text-muted">{(c.share * 100).toFixed(1).replace('.', ',')}% · {c.count}</span>
                        </span>
                      </div>
                      <Progress value={c.share} color={cat?.color} label={cat?.name} />
                    </button>
                  )
                })}
              </CardBody>
            </Card>
            {!isExpense && <SourceTrendChart />}
          </div>
        </TabsContent>
      </Tabs>

      <SaveFilterDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={async (name) => {
          const state: SavedState = { text, categoryId, accountId, tag, min, max, period }
          await act(() => services.settings.saveFilter(type, name, state), { success: 'Filtro guardado' })
        }}
      />
    </div>
  )
}

function SaveFilterDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const { data, services, act } = useApp()
  const [name, setName] = React.useState('')
  React.useEffect(() => { if (open) setName("") }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Guardar filtro" description="Guarda la combinación actual de búsqueda y filtros para reutilizarla." size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            await onSave(name)
            onOpenChange(false)
          }}
        >
          <div className="space-y-3 p-5">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Restaurantes del trimestre" aria-label="Nombre del filtro" maxLength={60} />
            {data.savedFilters.length > 0 && (
              <ul className="space-y-1 text-sm">
                {data.savedFilters.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-md bg-surface-2/60 px-2.5 py-1.5">
                    <span>{f.name}</span>
                    <button type="button" aria-label={`Eliminar filtro ${f.name}`} className="text-muted hover:text-expense" onClick={() => void act(() => services.settings.deleteFilter(f.id))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!name.trim()}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
