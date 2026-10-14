import * as React from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { ColorPicker, IconPicker } from './Pickers'
import { useApp } from '@/app/DataProvider'
import { contributionSchema, goalSchema, type ContributionInput, type GoalInput } from '@/validation/schemas'
import { goalSaved } from '@/domain/goals'
import { formatMoney } from '@/domain/money'
import type { Goal } from '@/domain/types'
import { uid } from '@/lib/utils'

export function GoalDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Goal | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={editing ? 'Editar meta' : 'Nueva meta de ahorro'} description="Apartar dinero para una meta no es un gasto: el dinero sigue en tus cuentas.">
          <GoalForm editing={editing ?? null} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function GoalForm({ editing, onDone }: { editing: Goal | null; onDone: () => void }) {
  const { data, services, act } = useApp()
  const [formId] = React.useState(() => uid())
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<GoalInput>({
    resolver: zodResolver(goalSchema) as unknown as Resolver<GoalInput>,
    defaultValues: { name: editing?.name ?? '', description: editing?.description ?? '', targetAmount: editing?.targetAmount ?? (undefined as unknown as number), targetDate: editing?.targetDate ?? '', accountId: editing?.accountId ?? '', color: editing?.color ?? '#10B981', icon: editing?.icon ?? 'target' },
  })
  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        const r = await act(async () => { if (editing) await services.goals.update(editing.id, v); else await services.goals.create({ ...v, id: formId }) }, { success: editing ? 'Meta actualizada' : 'Meta creada' })
        if (r.ok) onDone()
      })}
    >
      <div className="space-y-4 p-5">
        <Field label="Nombre" error={errors.name?.message}><Input autoFocus placeholder="Ej. Computador nuevo" {...register('name')} aria-label="Nombre de la meta" /></Field>
        <Field label="Descripción (opcional)" error={errors.description?.message}><Textarea rows={2} {...register('description')} aria-label="Descripción" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Controller control={control} name="targetAmount" render={({ field }) => (
            <Field label="Valor objetivo" error={errors.targetAmount?.message}><MoneyInput value={field.value as number | undefined} onChange={(v) => field.onChange(v ?? undefined)} aria-label="Valor objetivo" /></Field>
          )} />
          <Field label="Fecha objetivo (opcional)" error={errors.targetDate?.message}><Input type="date" {...register('targetDate')} aria-label="Fecha objetivo" /></Field>
        </div>
        <Field label="Cuenta o fondo asociado (opcional)" hint="Informativo: indica dónde guardas este dinero. No mueve saldos.">
          <Select {...register('accountId')} aria-label="Cuenta asociada">
            <option value="">Ninguna</option>
            {data.accounts.filter((a) => !a.archivedAt || a.id === editing?.accountId).map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </Select>
        </Field>
        <Field label="Color"><Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value ?? '#10B981'} onChange={field.onChange} />} /></Field>
        <Field label="Icono"><Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value ?? 'target'} onChange={field.onChange} color={watch('color') ?? '#10B981'} />} /></Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>{editing ? 'Guardar cambios' : 'Crear meta'}</Button>
      </DialogFooter>
    </form>
  )
}

export function ContributionDialog({ goal, kind, onClose }: { goal: Goal | null; kind: 'deposit' | 'withdrawal'; onClose: () => void }) {
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      {goal && (
        <DialogContent title={kind === 'deposit' ? `Aportar a «${goal.name}»` : `Retirar de «${goal.name}»`} description="Es una asignación de dinero que ya tienes: no crea ingresos ni gastos." size="sm">
          <ContributionForm goal={goal} kind={kind} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function ContributionForm({ goal, kind, onDone }: { goal: Goal; kind: 'deposit' | 'withdrawal'; onDone: () => void }) {
  const { data, services, today, act } = useApp()
  const saved = goalSaved(data.contributions, goal.id)
  const schema = React.useMemo(() => contributionSchema(today), [today])
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ContributionInput>({
    resolver: zodResolver(schema) as unknown as Resolver<ContributionInput>,
    defaultValues: { goalId: goal.id, kind, amount: undefined as unknown as number, date: today, note: '' },
  })
  const amount = watch('amount')
  const after = typeof amount === 'number' ? (kind === 'deposit' ? saved + amount : saved - amount) : saved
  return (
    <form onSubmit={handleSubmit(async (v) => { const r = await act(() => services.goals.contribute(v), { success: kind === 'deposit' ? 'Aporte registrado' : 'Retiro registrado' }); if (r.ok) onDone() })}>
      <div className="space-y-4 p-5">
        <div className="flex justify-between rounded-lg bg-surface-2/60 px-3 py-2 text-sm"><span className="text-muted">Ahorrado en la meta</span><span className="num font-medium">{formatMoney(saved)}</span></div>
        <Controller control={control} name="amount" render={({ field }) => (
          <Field label="Valor" error={errors.amount?.message}><MoneyInput className="h-11 text-lg font-semibold" value={field.value as number | undefined} onChange={(v) => field.onChange(v ?? undefined)} autoFocus aria-label="Valor" /></Field>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" error={errors.date?.message}><Input type="date" max={today} {...register('date')} aria-label="Fecha" /></Field>
          <Field label="Nota (opcional)"><Input {...register('note')} aria-label="Nota" /></Field>
        </div>
        {typeof amount === 'number' && (
          <p className={`text-xs ${after < 0 ? 'text-expense' : 'text-muted'}`}>{after < 0 ? 'El retiro supera lo ahorrado en la meta.' : `Quedará en ${formatMoney(after)} (${Math.round(Math.min(100, (after / goal.targetAmount) * 100))}% de la meta).`}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting} variant={kind === 'deposit' ? 'success' : 'default'}>{kind === 'deposit' ? 'Aportar' : 'Retirar'}</Button>
      </DialogFooter>
    </form>
  )
}
