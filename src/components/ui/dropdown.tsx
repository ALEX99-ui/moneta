import * as M from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export function MenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align="end" sideOffset={6} className={cn('menu-content surface z-50 min-w-44 p-1', className)} {...props} />
    </M.Portal>
  )
}
export function MenuItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted', danger && 'text-expense [&_svg]:text-expense', className)}
      {...props}
    />
  )
}
export const MenuSeparator = (p: React.ComponentPropsWithoutRef<typeof M.Separator>) => <M.Separator className="my-1 h-px bg-[var(--border)]" {...p} />
