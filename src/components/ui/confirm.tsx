import * as React from 'react'
import * as A from '@radix-ui/react-alert-dialog'
import { Button } from './button'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
}

const ConfirmContext = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

/** `const confirm = useConfirm(); if (await confirm({...})) ...` */
export const useConfirm = () => React.useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = React.useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <A.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <A.Portal>
          <A.Overlay className="dlg-overlay fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]" />
          <A.Content className="dlg-content surface fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-5">
            <A.Title className="text-base font-semibold">{state?.title}</A.Title>
            <A.Description asChild>
              <div className="mt-2 text-sm text-muted">{state?.description}</div>
            </A.Description>
            <div className="mt-5 flex justify-end gap-2">
              <A.Cancel asChild>
                <Button variant="ghost">Cancelar</Button>
              </A.Cancel>
              <A.Action asChild>
                <Button variant={state?.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
                  {state?.confirmLabel ?? 'Confirmar'}
                </Button>
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext.Provider>
  )
}
