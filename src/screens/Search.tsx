import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp, useLookups } from '@/app/DataProvider'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Amount, useDateFmt } from '@/components/common'
import { searchAll } from '@/domain/search'
import { formatMoney } from '@/domain/money'

export function SearchScreen() {
  const { data } = useApp()
  const l = useLookups()
  const fmt = useDateFmt()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const results = React.useMemo(() => searchAll(data, q, l, 500), [data, q, l])
  const total = results.reduce((s, r) => s + (r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0)
  return (
    <div>
      <PageHeader title="Búsqueda" subtitle="Por descripción, categoría, importe, cuenta, fecha (dd/mm/aaaa) o comercio." />
      <div className="relative mb-4 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input autoFocus value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder="Buscar…" className="h-11 pl-9" aria-label="Buscar" />
      </div>
      <Card className="overflow-hidden">
        {!q.trim() ? <EmptyState icon={<Search />} title="Escribe para buscar" description="Encuentra cualquier movimiento o transferencia y salta directo a él." />
          : results.length === 0 ? <EmptyState icon={<Search />} title="Sin resultados" description={`No hay movimientos que coincidan con «${q}».`} />
          : (
            <>
              <ul className="divide-y divide-[var(--border)]/60">
                {results.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link to={r.to} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.type === 'income' ? 'bg-income/15 text-income' : r.type === 'expense' ? 'bg-expense/15 text-expense' : 'bg-primary/15 text-primary'}`}>{r.type === 'income' ? <TrendingUp className="size-4" /> : r.type === 'expense' ? <TrendingDown className="size-4" /> : <ArrowLeftRight className="size-4" />}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span><span className="block truncate text-xs text-muted">{fmt(r.date)} · {r.subtitle}</span></span>
                      {r.type === 'transfer' ? <span className="num text-sm text-muted">{formatMoney(r.amount)}</span> : <Amount value={r.type === 'expense' ? -r.amount : r.amount} tone="auto" sign className="text-sm font-semibold" />}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t px-4 py-2.5 text-xs text-muted"><span>{results.length} resultado{results.length === 1 ? '' : 's'}</span><span>Neto (sin transferencias): <Amount value={total} tone="auto" sign className="font-semibold" /></span></div>
            </>
          )}
      </Card>
    </div>
  )
}
