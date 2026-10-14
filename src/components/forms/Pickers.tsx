import { Check } from 'lucide-react'
import { COLOR_CHOICES, ICON_NAMES, Icon } from '@/lib/icons'
import { cn } from '@/lib/utils'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {COLOR_CHOICES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={c} onClick={() => onChange(c)} className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-[var(--surface)] transition-transform hover:scale-110" style={{ background: c, boxShadow: value.toLowerCase() === c.toLowerCase() ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }}>
          {value.toLowerCase() === c.toLowerCase() && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  )
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (i: string) => void; color: string }) {
  return (
    <div className="grid max-h-36 grid-cols-9 gap-1.5 overflow-y-auto rounded-lg border p-2" role="radiogroup" aria-label="Icono">
      {ICON_NAMES.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={n} onClick={() => onChange(n)} className={cn('grid size-8 place-items-center rounded-md transition-colors hover:bg-surface-2', value === n && 'bg-surface-2')} style={value === n ? { color } : undefined}>
          <Icon name={n} className="size-4" />
        </button>
      ))}
    </div>
  )
}
