import * as React from 'react'
import { TransactionDialog } from '@/components/forms/TransactionDialog'
import { TransferDialog } from '@/components/forms/TransferDialog'
import { SearchDialog } from '@/components/SearchDialog'
import type { Transaction, Transfer, TxType } from '@/domain/types'
import type { TransactionInput, TransferInput } from '@/validation/schemas'

interface UI {
  openTransaction: (o: { type: TxType; editing?: Transaction | null; quick?: boolean; initial?: Partial<TransactionInput> }) => void
  openTransfer: (o?: { editing?: Transfer | null; initial?: Partial<TransferInput> }) => void
  openSearch: () => void
}

const Ctx = React.createContext<UI | null>(null)
export function useUI(): UI {
  const c = React.useContext(Ctx)
  if (!c) throw new Error('UIProvider ausente')
  return c
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [tx, setTx] = React.useState<{ type: TxType; editing?: Transaction | null; quick?: boolean; initial?: Partial<TransactionInput> } | null>(null)
  const [tr, setTr] = React.useState<{ editing?: Transfer | null; initial?: Partial<TransferInput> } | null>(null)
  const [search, setSearch] = React.useState(false)
  const ui = React.useMemo<UI>(() => ({ openTransaction: setTx, openTransfer: (o) => setTr(o ?? {}), openSearch: () => setSearch(true) }), [])
  return (
    <Ctx.Provider value={ui}>
      {children}
      <TransactionDialog open={!!tx} onOpenChange={(o) => !o && setTx(null)} type={tx?.type ?? 'expense'} editing={tx?.editing} quick={tx?.quick} initial={tx?.initial} />
      <TransferDialog open={!!tr} onOpenChange={(o) => !o && setTr(null)} editing={tr?.editing} initial={tr?.initial} />
      <SearchDialog open={search} onOpenChange={setSearch} />
    </Ctx.Provider>
  )
}
