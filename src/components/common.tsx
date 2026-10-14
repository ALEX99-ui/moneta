import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Icon } from '@/lib/icons'
import { formatMoney } from '@/domain/money'
import { addMonthKey, monthRange, type ISODate, type MonthKey, type PeriodSelection, formatDate } from '@/domain/dates'
import type { Category } from '@/domain/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useApp } from '@/app/DataProvider'

/** Importe con color semántico: ingreso (verde), gasto (rojo), neutro. */
export function Amount({ value, tone, sign, className }: { value: number; tone?: 'income' | 'expense' | 'auto' | 'none'; sign?: boolean; className?: string }) {
  const t = tone ?? 'none'
  const color = t === 'income' ? 'text-income' : t === 'expense' ? 'text-expense' : t === 'auto' ? (value > 0 ? 'text-income' : value < 0 ? 'text-expense' : '') : ''
  return <span className={cn('num whitespace-nowrap', color, className)}>{formatMoney(value, { sign })}</span>
}

export function CategoryBadge({ category, className, compact }: { category: Pick<Category, 'name' | 'icon' | 'color' | 'archivedAt'> | undefined; className?: string; compact?: boolean }) {
  if (!category) return <span className="text-muted">—</span>
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: `${category.color}26`, color: category.color }}>
        <Icon name={category.icon} className="size-3.5" />
      </span>
      {!compact && (
        <span className="truncate text-sm">
          {category.name}
          {category.archivedAt && <span className="ml-1 text-xs text-muted">(archivada)</span>}
        </span>
      )}
    </span>
  )
}

export function IconTile({ icon, color, size = 'md' }: { icon: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-7 rounded-lg [&_svg]:size-3.5', md: 'size-10 rounded-xl [&_svg]:size-5', lg: 'size-12 rounded-2xl [&_svg]:size-6' }[size]
  return (
    <span className={cn('grid shrink-0 place-items-center', s)} style={{ background: `${color}26`, color }}>
      <Icon name={icon} />
    </span>
  )
}

export function StatCard({
  title, value, sub, icon, tone = 'primary', delay = 0, valueClassName,
}: { title: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; tone?: 'primary' | 'income' | 'expense' | 'warning' | 'saving'; delay?: number; valueClassName?: string }) {
  const color = { primary: 'var(--primary)', income: 'var(--income)', expense: 'var(--expense)', warning: 'var(--warning)', saving: 'var(--saving)' }[tone]
  return (
    <div className="surface page-enter relative overflow-hidden p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{title}</p>
        <span className="grid size-8 place-items-center rounded-lg [&_svg]:size-4" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          {icon}
        </span>
      </div>
      <p className={cn('num mt-2 truncate text-[22px] font-semibold leading-7 tracking-tight', valueClassName)} title={typeof value === 'string' ? value : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

/** Variación porcentual con flecha; `goodWhenUp` define si subir es positivo (ingresos) o negativo (gastos). */
export function Delta({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  if (!previous) return <span className="text-muted">sin período anterior</span>
  const change = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(change) < 0.5) return <span className="text-muted">igual que el anterior</span>
  const up = change > 0
  const good = up === goodWhenUp
  return (
    <span className={good ? 'text-income' : 'text-expense'}>
      {up ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% <span className="text-muted">vs. anterior</span>
    </span>
  )
}

export function monthLabel(key: MonthKey, long = true): string {
  const s = format(parseISO(`${key}-01`), long ? 'MMMM yyyy' : 'MMM yy', { locale: es })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type Mode = PeriodSelection['mode']

/** Selector de período: mes, año, rango personalizado o todo. */
export function PeriodPicker({
  value, onChange, modes = ['month', 'year', 'custom'], compact,
}: { value: PeriodSelection; onChange: (v: PeriodSelection) => void; modes?: Mode[]; compact?: boolean }) {
  const { data, today } = useApp()
  const startDay = data.settings.monthStartDay
  const labels: Record<Mode, string> = { month: 'Mes', year: 'Año', custom: 'Rango', all: 'Todo' }
  const thisMonth = monthRange(today.slice(0, 7), 1).from.slice(0, 7)
  const setMode = (m: Mode) => {
    if (m === value.mode) return
    if (m === 'month') onChange({ mode: 'month', month: today.slice(0, 7) })
    else if (m === 'year') onChange({ mode: 'year', year: Number(today.slice(0, 4)) })
    else if (m === 'custom') onChange({ mode: 'custom', from: monthRange(thisMonth, startDay).from, to: today })
    else onChange({ mode: 'all' })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border bg-surface p-0.5" role="group" aria-label="Tipo de período">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', value.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground')}
          >
            {labels[m]}
          </button>
        ))}
      </div>
      {value.mode === 'month' && (
        <div className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Mes anterior" onClick={() => onChange({ mode: 'month', month: addMonthKey(value.month, -1) })}>
            <ChevronLeft />
          </Button>
          <div className={cn('min-w-32 text-center text-sm font-medium', compact && 'min-w-28')}>
            {monthLabel(value.month)}
            {startDay > 1 && (
              <div className="text-[10px] font-normal text-muted">
                {formatDate(monthRange(value.month, startDay).from, 'dd/MM/yyyy').slice(0, 5)} – {formatDate(monthRange(value.month, startDay).to, 'dd/MM/yyyy').slice(0, 5)}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Mes siguiente" onClick={() => onChange({ mode: 'month', month: addMonthKey(value.month, 1) })}>
            <ChevronRight />
          </Button>
        </div>
      )}
      {value.mode === 'year' && (
        <div className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Año anterior" onClick={() => onChange({ mode: 'year', year: value.year - 1 })}>
            <ChevronLeft />
          </Button>
          <div className="min-w-16 text-center text-sm font-medium">{value.year}</div>
          <Button variant="ghost" size="icon-sm" aria-label="Año siguiente" onClick={() => onChange({ mode: 'year', year: value.year + 1 })}>
            <ChevronRight />
          </Button>
        </div>
      )}
      {value.mode === 'custom' && (
        <div className="inline-flex items-center gap-2">
          <Input type="date" aria-label="Desde" className="h-8 w-36" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-xs text-muted">a</span>
          <Input type="date" aria-label="Hasta" className="h-8 w-36" value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  )
}

export function fmtDate(d: ISODate | null | undefined, f: Parameters<typeof formatDate>[1]): string {
  return d ? formatDate(d, f) : '—'
}

export function useDateFmt() {
  const { data } = useApp()
  return React.useCallback((d: ISODate | null | undefined) => fmtDate(d, data.settings.dateFormat), [data.settings.dateFormat])
}

/** Etiqueta con punto de color para leyendas. */
export function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}
