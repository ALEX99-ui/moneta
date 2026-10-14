import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Search, TrendingDown, TrendingUp } from 'lucide-react'
import * as D from '@radix-ui/react-dialog'
import { useApp, useLookups } from '@/app/DataProvider'
import { searchAll } from '@/domain/search'
import { formatMoney } from '@/domain/money'
import { useDateFmt } from './common'
import { cn } from '@/lib/utils'

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useApp()
  const l = useLookups()
  const fmt = useDateFmt()
  const nav = useNavigate()
  const [q, setQ] = React.useState('')
  const [sel, setSel] = React.useState(0)
  React.useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])
  const results = React.useMemo(() => searchAll(data, q, l, 100), [data, q, l])
  const shown = results.slice(0, 8)
  const go = (to: string) => {
    onOpenChange(false)
    nav(to)
  }
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <D.Content
          className="dlg-content surface fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const r = shown[sel]
              if (r) go(r.to)
              else if (q.trim()) go(`/buscar?q=${encodeURIComponent(q.trim())}`)
            }
          }}
        >
          <D.Title className="sr-only">Búsqueda global</D.Title>
          <D.Description className="sr-only">Busca movimientos por descripción, categoría, importe, cuenta, fecha o comercio</D.Description>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setSel(0)
              }}
              placeholder="Buscar por descripción, categoría, importe, cuenta, fecha o comercio…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
              aria-label="Buscar"
            />
            <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-1.5">
            {!q.trim() && <p className="px-3 py-8 text-center text-sm text-muted">Escribe para buscar en todos tus movimientos y transferencias.</p>}
            {q.trim() && results.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Sin resultados para «{q}».</p>}
            {shown.map((r, i) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => go(r.to)}
                onMouseEnter={() => setSel(i)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === sel && 'bg-surface-2')}
              >
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', r.type === 'income' ? 'bg-income/15 text-income' : r.type === 'expense' ? 'bg-expense/15 text-expense' : 'bg-primary/15 text-primary')}>
                  {r.type === 'income' ? <TrendingUp className="size-4" /> : r.type === 'expense' ? <TrendingDown className="size-4" /> : <ArrowLeftRight className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {fmt(r.date)} · {r.subtitle}
                  </span>
                </span>
                <span className={cn('num text-sm font-medium', r.type === 'income' && 'text-income', r.type === 'expense' && 'text-expense')}>
                  {r.type === 'expense' ? '-' : r.type === 'income' ? '+' : ''}
                  {formatMoney(r.amount)}
                </span>
              </button>
            ))}
            {q.trim() && results.length > 0 && (
              <button onClick={() => go(`/buscar?q=${encodeURIComponent(q.trim())}`)} className="mt-1 w-full rounded-lg px-3 py-2 text-center text-xs font-medium text-primary hover:bg-surface-2">
                Ver los {results.length} resultados
              </button>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
