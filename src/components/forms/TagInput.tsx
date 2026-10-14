import * as React from 'react'
import { X } from 'lucide-react'

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = React.useState('')
  const listId = React.useId()
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, '').trim()
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase()) || value.length >= 10) return setText('')
    onChange([...value, t.slice(0, 30)])
    setText('')
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-surface-2/60 px-2 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
          {t}
          <button type="button" aria-label={`Quitar ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        placeholder={value.length ? '' : 'Escribe y presiona Enter'}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
