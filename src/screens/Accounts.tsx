import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeftRight, Ellipsis, List, Pencil, Plus, Wallet } from 'lucide-react'
import { useApp, useLookups } from '@/app/DataProvider'
import { useUI } from '@/app/UIProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/dropdown'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm'
import { Amount, IconTile, StatCard, useDateFmt } from '@/components/common'
import { AccountDialog } from '@/components/forms/AccountDialog'
import { accountBalances, totalBalance, allocatedToGoals } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import { ACCOUNT_TYPE_LABEL, type Account } from '@/domain/types'
import { cn } from '@/lib/utils'

export function AccountsScreen() {
  const { data, services, act } = useApp()
  const ui = useUI()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = React.useState<Account | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [showArchived, setShowArchived] = React.useState(false)
  const balances = React.useMemo(() => accountBalances(data), [data])
  const active = data.accounts.filter((a) => !a.archivedAt)
  const archived = data.accounts.filter((a) => a.archivedAt)
  const total = totalBalance(data)
  const allocated = allocatedToGoals(data)
  const ledgerId = params.get('ledger')

  const archive = async (a: Account) => {
    const ok = await confirm({ title: `¿Archivar «${a.name}»?`, description: 'Se conserva todo su historial y se puede restaurar después. Solo es posible si su saldo es cero.', confirmLabel: 'Archivar' })
    if (ok) await act(() => services.accounts.archive(a.id), { success: 'Cuenta archivada' })
  }

  return (
    <div>
      <PageHeader
        title="Cuentas"
        subtitle="Cada cuenta tiene su propio saldo. Transferir entre ellas no cuenta como ingreso ni gasto."
        actions={
          <>
            <Button variant="outline" onClick={() => ui.openTransfer()}><ArrowLeftRight /> Transferir</Button>
            <Button onClick={() => setCreating(true)}><Plus /> Nueva cuenta</Button>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard title="Dinero total en cuentas" value={formatMoney(total)} icon={<Wallet />} tone="primary" sub={`${active.length} cuenta${active.length === 1 ? '' : 's'} activa${active.length === 1 ? '' : 's'}`} valueClassName={total < 0 ? 'text-expense' : undefined} />
        <StatCard title="Asignado a metas de ahorro" value={formatMoney(allocated)} icon={<Wallet />} tone="income" sub="Asignación virtual: sigue estando en tus cuentas" delay={40} />
        <StatCard title="Libre de asignaciones" value={formatMoney(total - allocated)} icon={<Wallet />} tone="saving" sub="Total − asignado a metas" delay={80} valueClassName={total - allocated < 0 ? 'text-expense' : undefined} />
      </div>

      {active.length === 0 ? (
        <Card><EmptyState icon={<Wallet />} title="Crea tu primera cuenta" description="Efectivo, cuenta bancaria, billetera digital o ahorros." action={<Button onClick={() => setCreating(true)}><Plus /> Nueva cuenta</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((a, i) => {
            const bal = balances.get(a.id) ?? 0
            return (
              <div key={a.id} className="surface page-enter group relative overflow-hidden p-5" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.12] blur-2xl" style={{ background: a.color }} />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <IconTile icon={a.icon} color={a.color} />
                    <div>
                      <p className="font-medium leading-5">{a.name}</p>
                      <p className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                    </div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${a.name}`}><Ellipsis /></Button></MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setParams({ ledger: a.id })}><List /> Ver movimientos</MenuItem>
                      <MenuItem onSelect={() => setEditing(a)}><Pencil /> Editar</MenuItem>
                      <MenuItem onSelect={() => ui.openTransfer({ initial: { fromAccountId: a.id } })}><ArrowLeftRight /> Transferir desde aquí</MenuItem>
                      <MenuItem danger onSelect={() => void archive(a)}><Archive /> Archivar</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <p className={cn('num mt-5 text-3xl font-semibold tracking-tight', bal < 0 && 'text-expense')}>{formatMoney(bal)}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>Saldo inicial {formatMoney(a.initialBalance)}</span>
                  {bal < 0 && <Badge tone="expense">Saldo negativo</Badge>}
                </div>
                <button onClick={() => setParams({ ledger: a.id })} className="mt-4 text-xs font-medium text-primary hover:underline">Ver movimientos →</button>
              </div>
            )
          })}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <button className="text-sm font-medium text-muted hover:text-foreground" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? 'Ocultar' : 'Mostrar'} cuentas archivadas ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {archived.map((a) => (
                <Card key={a.id} className="flex items-center justify-between p-4 opacity-75">
                  <div className="flex items-center gap-3">
                    <IconTile icon={a.icon} color={a.color} size="sm" />
                    <span className="text-sm">{a.name}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void act(() => services.accounts.unarchive(a.id), { success: 'Cuenta restaurada' })}><ArchiveRestore /> Restaurar</Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <AccountDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }} editing={editing} />
      <LedgerDialog accountId={ledgerId} onClose={() => setParams({}, { replace: true })} focus={params.get('focus')} />
    </div>
  )
}

/** Movimientos de una cuenta con saldo acumulado: permite verificar a mano cómo se llega al saldo. */
function LedgerDialog({ accountId, onClose, focus }: { accountId: string | null; onClose: () => void; focus: string | null }) {
  const { data } = useApp()
  const l = useLookups()
  const fmt = useDateFmt()
  const acc = accountId ? l.accounts.get(accountId) : undefined
  const rows = React.useMemo(() => {
    if (!acc) return []
    type Row = { id: string; date: string; created: string; title: string; sub: string; delta: number; kind: 'income' | 'expense' | 'in' | 'out' }
    const list: Row[] = []
    for (const t of data.transactions) {
      if (t.accountId !== acc.id) continue
      list.push({ id: t.id, date: t.date, created: t.createdAt, title: t.description || l.categories.get(t.categoryId)?.name || '', sub: l.categories.get(t.categoryId)?.name ?? '', delta: t.type === 'income' ? t.amount : -t.amount, kind: t.type })
    }
    for (const tr of data.transfers) {
      if (tr.fromAccountId === acc.id) list.push({ id: tr.id, date: tr.date, created: tr.createdAt, title: tr.description || 'Transferencia enviada', sub: `→ ${l.accounts.get(tr.toAccountId)?.name}`, delta: -tr.amount, kind: 'out' })
      if (tr.toAccountId === acc.id) list.push({ id: tr.id + ':in', date: tr.date, created: tr.createdAt, title: tr.description || 'Transferencia recibida', sub: `← ${l.accounts.get(tr.fromAccountId)?.name}`, delta: tr.amount, kind: 'in' })
    }
    list.sort((a, b) => (a.date === b.date ? (a.created < b.created ? -1 : 1) : a.date < b.date ? -1 : 1))
    let run = acc.initialBalance
    return list.map((r) => ({ ...r, balance: (run += r.delta) })).reverse()
  }, [acc, data.transactions, data.transfers, l])
  React.useEffect(() => {
    if (focus && rows.length) setTimeout(() => document.getElementById(`ld-${focus}`)?.scrollIntoView({ block: 'center' }), 100)
  }, [focus, rows.length])
  return (
    <Dialog open={!!acc} onOpenChange={(o) => !o && onClose()}>
      {acc && (
        <DialogContent title={`Movimientos · ${acc.name}`} description="Incluye transferencias. El saldo parte del saldo inicial." size="lg">
          <div className="p-5">
            <div className="mb-3 flex justify-between rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
              <span className="text-muted">Saldo inicial</span>
              <span className="num font-medium">{formatMoney(acc.initialBalance)}</span>
            </div>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Esta cuenta aún no tiene movimientos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted"><th className="py-2 font-medium">Fecha</th><th className="font-medium">Detalle</th><th className="text-right font-medium">Valor</th><th className="text-right font-medium">Saldo</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} id={`ld-${r.id.replace(':in', '')}`} className={cn('border-b border-[var(--border)]/60 last:border-0', focus && r.id.replace(':in', '') === focus && 'bg-primary/15')}>
                      <td className="num py-2 text-muted">{fmt(r.date)}</td>
                      <td><div className="truncate font-medium">{r.title}</div><div className="text-xs text-muted">{r.sub}</div></td>
                      <td className="text-right"><Amount value={r.delta} tone="auto" sign /></td>
                      <td className="num text-right text-muted">{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
