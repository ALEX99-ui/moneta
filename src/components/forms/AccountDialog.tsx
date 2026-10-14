import * as React from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { ColorPicker, IconPicker } from './Pickers'
import { useApp } from '@/app/DataProvider'
import { accountSchema, type AccountInput } from '@/validation/schemas'
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from '@/domain/types'
import { uid } from '@/lib/utils'

const DEFAULT_ICON: Record<AccountType, string> = { cash: 'banknote', bank: 'landmark', wallet: 'smartphone', savings: 'piggy-bank' }

export function AccountDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Account | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={editing ? 'Editar cuenta' : 'Nueva cuenta'} description="El saldo actual se calcula a partir del saldo inicial y los movimientos.">
          <AccountForm editing={editing ?? null} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function AccountForm({ editing, onDone }: { editing: Account | null; onDone: () => void }) {
  const { services, act } = useApp()
  const [formId] = React.useState(() => uid())
  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<AccountInput>({
    resolver: zodResolver(accountSchema) as unknown as Resolver<AccountInput>,
    defaultValues: {
      name: editing?.name ?? '', type: editing?.type ?? 'bank', initialBalance: editing?.initialBalance ?? 0,
      color: editing?.color ?? '#6366F1', icon: editing?.icon ?? 'landmark',
    },
  })
  const type = watch('type')
  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        const r = await act(async () => { if (editing) await services.accounts.update(editing.id, v); else await services.accounts.create({ ...v, id: formId }) }, { success: editing ? 'Cuenta actualizada' : 'Cuenta creada' })
        if (r.ok) onDone()
      })}
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={errors.name?.message}>
            <Input autoFocus placeholder="Ej. Bancolombia" {...register('name')} aria-label="Nombre de la cuenta" />
          </Field>
          <Field label="Tipo">
            <Select
              {...register('type', { onChange: (e) => !editing && setValue('icon', DEFAULT_ICON[e.target.value as AccountType]) })}
              aria-label="Tipo de cuenta"
            >
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Controller
          control={control}
          name="initialBalance"
          render={({ field }) => (
            <Field label="Saldo inicial" error={errors.initialBalance?.message} hint={editing ? 'Cambiarlo recalcula el saldo actual; los movimientos no se modifican.' : `Lo que tiene hoy esta cuenta (${ACCOUNT_TYPE_LABEL[type].toLowerCase()}). Puede ser negativo si hay sobregiro.`}>
              <MoneyInput allowNegative value={field.value as number} onChange={(v) => field.onChange(v ?? 0)} aria-label="Saldo inicial" />
            </Field>
          )}
        />
        <Field label="Color"><Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value ?? '#6366F1'} onChange={field.onChange} />} /></Field>
        <Field label="Icono"><Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value ?? 'wallet'} onChange={field.onChange} color={watch('color') ?? '#6366F1'} />} /></Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>{editing ? 'Guardar cambios' : 'Crear cuenta'}</Button>
      </DialogFooter>
    </form>
  )
}
