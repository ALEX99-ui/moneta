import * as React from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/app/DataProvider'
import { ruleSchema, type RuleInput } from '@/validation/schemas'
import { FREQUENCY_LABEL, type Frequency, type RecurringRule } from '@/domain/types'
import { annualCost, monthlyEquivalent } from '@/domain/recurring'
import { formatMoney } from '@/domain/money'
import { uid } from '@/lib/utils'
import { useDateFmt } from '@/components/common'

export function RuleDialog({ open, onOpenChange, editing, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: RecurringRule | null; defaults?: Partial<RuleInput> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={editing ? 'Editar pago periódico' : 'Nueva suscripción o pago periódico'} description="Los pagos futuros son previstos: no afectan tus saldos hasta que los registres.">
          <RuleForm editing={editing ?? null} defaults={defaults} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function RuleForm({ editing, defaults, onDone }: { editing: RecurringRule | null; defaults?: Partial<RuleInput>; onDone: () => void }) {
  const { data, services, today, act } = useApp()
  const [formId] = React.useState(() => uid())
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<RuleInput>({
    resolver: zodResolver(ruleSchema) as unknown as Resolver<RuleInput>,
    defaultValues: {
      name: editing?.name ?? defaults?.name ?? '', kind: editing?.kind ?? defaults?.kind ?? 'expense', isSubscription: editing?.isSubscription ?? defaults?.isSubscription ?? true,
      amount: editing?.amount ?? (defaults?.amount as number) ?? (undefined as unknown as number), frequency: editing?.frequency ?? defaults?.frequency ?? 'monthly',
      nextDueDate: editing?.nextDueDate ?? defaults?.nextDueDate ?? today, categoryId: editing?.categoryId ?? defaults?.categoryId ?? (data.categories.find((c) => c.id === 'cat_suscripciones')?.id ?? ''),
      accountId: editing?.accountId ?? defaults?.accountId ?? data.accounts.find((a) => !a.archivedAt)?.id ?? '', notes: editing?.notes ?? '',
    },
  })
  const w = useWatch({ control })
  const cats = data.categories.filter((c) => c.kind === (w.kind ?? 'expense') && (!c.archivedAt || c.id === editing?.categoryId))
  const accounts = data.accounts.filter((a) => !a.archivedAt || a.id === editing?.accountId)
  const amount = typeof w.amount === 'number' ? w.amount : 0
  const freq = (w.frequency ?? 'monthly') as Frequency
  return (
    <form onSubmit={handleSubmit(async (v) => {
      const r = await act(async () => { if (editing) await services.recurring.update(editing.id, v); else await services.recurring.create({ ...v, id: formId }) }, { success: editing ? 'Cambios guardados' : 'Pago periódico creado' })
      if (r.ok) onDone()
    })}>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={errors.name?.message}><Input autoFocus placeholder="Ej. Netflix" {...register('name')} aria-label="Nombre" /></Field>
          <Field label="Tipo">
            <Select {...register('kind', { onChange: (e) => { setValue('categoryId', data.categories.find((c) => c.kind === e.target.value && !c.archivedAt)?.id ?? ''); if (e.target.value === 'income') setValue('isSubscription', false) } })} aria-label="Tipo">
              <option value="expense">Gasto</option><option value="income">Ingreso</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller control={control} name="amount" render={({ field }) => (
            <Field label="Valor" error={errors.amount?.message}><MoneyInput value={field.value as number | undefined} onChange={(v) => field.onChange(v ?? undefined)} aria-label="Valor" /></Field>
          )} />
          <Field label="Frecuencia">
            <Select {...register('frequency')} aria-label="Frecuencia">
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (<option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>))}
            </Select>
          </Field>
        </div>
        {amount > 0 && <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">Equivale a <strong className="num text-foreground">{formatMoney(monthlyEquivalent(amount, freq))}</strong> al mes y <strong className="num text-foreground">{formatMoney(annualCost(amount, freq))}</strong> al año.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Próxima fecha de pago" error={errors.nextDueDate?.message} hint="Puede ser futura o vencida."><Input type="date" {...register('nextDueDate')} aria-label="Próxima fecha de pago" /></Field>
          <Field label="Cuenta" error={errors.accountId?.message}>
            <Select {...register('accountId')} aria-label="Cuenta">{accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}</Select>
          </Field>
        </div>
        <Field label="Categoría" error={errors.categoryId?.message}>
          <Select {...register('categoryId')} aria-label="Categoría">{cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</Select>
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span><span className="block text-sm font-medium">Es una suscripción</span><span className="block text-xs text-muted">Aparece en el total de suscripciones (si no, va en «Otros pagos periódicos»).</span></span>
          <Controller control={control} name="isSubscription" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} aria-label="Es suscripción" />} />
        </label>
        <Field label="Notas (opcional)"><Textarea rows={2} {...register('notes')} aria-label="Notas" /></Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>{editing ? 'Guardar cambios' : 'Crear'}</Button>
      </DialogFooter>
    </form>
  )
}

export function RegisterPaymentDialog({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const { services, today, act } = useApp()
  const fmt = useDateFmt()
  const [date, setDate] = React.useState(today)
  const [amount, setAmount] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (rule) {
      setDate(today)
      setAmount(rule.amount)
    }
  }, [rule, today])
  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      {rule && (
        <DialogContent title={rule.kind === 'expense' ? `Registrar pago de «${rule.name}»` : `Registrar cobro de «${rule.name}»`} description={`Corresponde a la ocurrencia prevista del ${fmt(rule.nextDueDate)}. Se convertirá en un movimiento confirmado.`} size="sm">
          <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); const r = await act(() => services.recurring.registerPayment(rule.id, { date, amount: amount ?? undefined }), { success: 'Registrado: ya afecta tu saldo' }); setSaving(false); if (r.ok) onClose() }}>
            <div className="space-y-4 p-5">
              <Field label="Valor real pagado" hint={`Valor previsto: ${formatMoney(rule.amount)}`}><MoneyInput value={amount} onChange={setAmount} autoFocus aria-label="Valor pagado" /></Field>
              <Field label="Fecha en que se hizo"><Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha del pago" /></Field>
              <p className="text-xs text-muted">Después de registrar, la próxima fecha prevista avanza automáticamente. No se puede registrar dos veces la misma ocurrencia.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving || !amount || !date}>Registrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
