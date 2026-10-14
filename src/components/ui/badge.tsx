import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-muted',
      primary: 'bg-primary/15 text-primary',
      income: 'bg-income/15 text-income',
      expense: 'bg-expense/15 text-expense',
      warning: 'bg-warning/15 text-warning',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}
