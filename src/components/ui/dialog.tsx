import * as React from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger

export function DialogContent({
  className, children, title, description, size = 'md', ...props
}: Omit<React.ComponentPropsWithoutRef<typeof D.Content>, 'title'> & { title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  return (
    <D.Portal>
      <D.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <D.Content
        className={cn('dlg-content surface fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden', width, className)}
        aria-describedby={description ? undefined : undefined}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Cerrar">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t px-5 py-3', className)} {...props} />
}
