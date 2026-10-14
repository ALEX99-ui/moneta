import * as React from 'react'
import { Input } from './input'
import { MAX_AMOUNT } from '@/domain/money'

/** Campo de dinero en pesos enteros: escribe solo dígitos y se muestra con separador de miles colombiano. */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  { value: number | null | undefined; onChange: (v: number | null) => void; allowNegative?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>
>(({ value, onChange, allowNegative, className, ...props }, ref) => {
  const text = value === null || value === undefined ? '' : (value < 0 ? '-' : '') + String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={`num pl-7 ${className ?? ''}`}
        value={text}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value
          const neg = allowNegative && raw.trim().startsWith('-')
          const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
          if (!digits) return onChange(neg ? -0 || null : null)
          const n = Math.min(Number(digits), MAX_AMOUNT)
          onChange(neg ? -n : n)
        }}
        {...props}
      />
    </div>
  )
})
MoneyInput.displayName = 'MoneyInput'
