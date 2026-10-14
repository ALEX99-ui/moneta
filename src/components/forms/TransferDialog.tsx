import * as React from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeftRight } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useApp } from '@/app/DataProvider'
import { transferSchema, type TransferInput } from '@/validation/schemas'
import { accountBalances } from '@/domain/ledger'
import { formatMoney } from '@/domain/money'
import { uid } from '@/lib/utils'
import type { Transfer } from '@/domain/types'

export function TransferDialog({ open, onOpenChange, editing, initial }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Transfer | null; initial?: Partial<TransferInput> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={editing ? 'Editar transferencia' : 'Transferir entre cuentas'} description="Mover dinero entre tus propias cuentas no es un ingreso ni un gasto.">
          <TransferForm editing={editing ?? null} initial={initial} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function TransferForm({ editing, initial, onDone }: { editing: Transfer | null; initial?: Partial<TransferInput>; onDone: () => void }) {
  const { data, services, today, act } = useApp()
  const schema = React.useMemo(() => transferSchema(today), [today])
  const accounts = data.accounts.filter((a) => !a.archivedAt || a.id === editing?.fromAccountId || a.id === editing?.toAccountId)
  const active = accounts.filter((a) => !a.archivedAt)
  const [formId] = React.useState(() => uid())
  const [saving, setSaving] = React.useState(false)
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = useForm<TransferInput>({
    resolver: zodResolver(schema) as unknown as Resolver<TransferInput>,
    defaultValues: {
      fromAccountId: editing?.fromAccountId ?? initial?.fromAccountId ?? active[0]?.id ?? '',
      toAccountId: editing?.toAccountId ?? initial?.toAccountId ?? active[1]?.id ?? '',
      amount: editing?.amount ?? (initial?.amount as number) ?? (undefined as unknown as number),
      date: editing?.date ?? today,
      description: editing?.description ?? '',
    },
  })
  const w = useWatch({ control })
  const balances = React.useMemo(() => accountBalances(data), [data])
  const bal = (id?: string) => (id ? balances.get(id) ?? 0 : 0)

  if (active.length < 2 && !editing) {
    return (
      <div className="p-5 text-sm text-muted">
        Necesitas al menos dos cuentas activas para transferir. Crea otra cuenta en la sección <strong>Cuentas</strong>.
        <DialogFooter className="-mx-5 -mb-5 mt-5">
          <Button onClick={onDone}>Entendido</Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        if (saving) return
        setSaving(true)
        try {
          const ok = await act(async () => (editing ? services.transfers.update(editing.id, v) : services.transfers.create({ ...v, id: formId })), {
            success: editing ? 'Transferencia actualizada' : 'Transferencia registrada',
          })
          if (ok.ok) onDone()
        } finally {
          setSaving(false)
        }
      })}
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="Desde" error={errors.fromAccountId?.message} hint={`Saldo: ${formatMoney(bal(w.fromAccountId))}`}>
            <Select {...register('fromAccountId')} aria-label="Cuenta de origen">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Intercambiar cuentas"
            className="mb-5"
            onClick={() => {
              const [f, t] = [getValues('fromAccountId'), getValues('toAccountId')]
              setValue('fromAccountId', t)
              setValue('toAccountId', f)
            }}
          >
            <ArrowLeftRight />
          </Button>
          <Field label="Hacia" error={errors.toAccountId?.message} hint={`Saldo: ${formatMoney(bal(w.toAccountId))}`}>
            <Select {...register('toAccountId')} aria-label="Cuenta de destino">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <Field label="Valor" error={errors.amount?.message}>
              <MoneyInput className="h-11 text-lg font-semibold" value={field.value as number | undefined} onChange={(v) => field.onChange(v ?? undefined)} aria-label="Valor" autoFocus />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" error={errors.date?.message}>
            <Input type="date" max={today} {...register('date')} aria-label="Fecha" />
          </Field>
          <Field label="Nota (opcional)">
            <Input {...register('description')} aria-label="Nota" />
          </Field>
        </div>
        {typeof w.amount === 'number' && w.fromAccountId && w.amount > bal(w.fromAccountId) && !editing && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">La cuenta de origen quedaría en saldo negativo ({formatMoney(bal(w.fromAccountId) - w.amount)}).</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{editing ? 'Guardar cambios' : 'Transferir'}</Button>
      </DialogFooter>
    </form>
  )
}
