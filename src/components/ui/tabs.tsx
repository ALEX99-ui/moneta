import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = T.Root
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List className={cn('inline-flex flex-wrap items-center gap-1 rounded-xl border bg-surface p-1', className)} {...props} />
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm', className)}
      {...props}
    />
  )
}
export const TabsContent = T.Content
