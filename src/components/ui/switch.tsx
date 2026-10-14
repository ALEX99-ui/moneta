import * as S from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof S.Root>) {
  return (
    <S.Root className={cn('relative h-5 w-9 shrink-0 rounded-full border bg-surface-2 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary', className)} {...props}>
      <S.Thumb className="block size-3.5 translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}
