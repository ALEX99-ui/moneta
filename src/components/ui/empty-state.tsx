import { cn } from '@/lib/utils'

export function EmptyState({ icon, title, description, action, className }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-6">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
