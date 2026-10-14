import { cn } from '@/lib/utils'

/** Barra de progreso. `value` es una fracción (0-1); puede superar 1 (se recorta visualmente). */
export function Progress({ value, color, className, label }: { value: number; color?: string; className?: string; label?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="bar-grow h-full rounded-full" style={{ width: `${w}%`, background: color ?? 'var(--primary)' }} />
    </div>
  )
}
