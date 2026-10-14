import * as React from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { TagInput } from './TagInput'
import { useApp } from '@/app/DataProvider'
import { transactionSchema, type TransactionInput } from '@/validation/schemas'
import { PAYMENT_METHODS, type Transaction, type TxType } from '@/domain/types'
import { accountBalances } from '@/domain/ledger'
import { findPossibleDuplicates } from '@/domain/filters'
import { formatMoney } from '@/domain/money'
import { uid } from '@/lib/utils'
import { Icon } from '@/lib/icons'

const LAST_ACCOUNT_KEY = 'moneta-last-account'

function lastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null
  }
}

export interface TransactionDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  type: TxType
  editing?: Transaction | null
  /** Registro rápido: solo lo esencial; el resto queda en "Más detalles". */
  quick?: boolean
  initial?: Partial<TransactionInput>
}

export function TransactionDialog({ open, onOpenChange, type, editing, quick, initial }: TransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={editing ? (type === 'expense' ? 'Editar gasto' : 'Editar ingreso') : quick ? (type === 'expense' ? 'Registro rápido de gasto' : 'Registro rápido de ingreso') : type === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso'}
          description={editing ? 'Los saldos se recalculan automáticamente.' : 'Se guarda al instante y actualiza tus saldos.'}
          size="md"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            document.getElementById('tx-amount')?.focus()
          }}
        >
          <TransactionForm type={type} editing={editing ?? null} initial={initial} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function TransactionForm({ type, editing, initial, onDone }: { type: TxType; editing: Transaction | null; initial?: Partial<TransactionInput>; onDone: () => void }) {
  const { data, services, today, act } = useApp()
  const schema = React.useMemo(() => transactionSchema(today), [today])
  const accounts = data.accounts.filter((a) => !a.archivedAt || a.id === editing?.accountId)
  const categories = data.categories.filter((c) => c.kind === type && (!c.archivedAt || c.id === editing?.categoryId))
  const [formId, setFormId] = React.useState(() => uid())
  const [saving, setSaving] = React.useState(false)
  const hasDetails = !!(editing && (editing.subcategoryId || editing.paymentMethod || editing.merchant || editing.notes || editing.tags.length || editing.isRecurring))
  const [showMore, setShowMore] = React.useState(hasDetails || !!initial?.merchant)

  const defaultAccount = React.useMemo(() => {
    const last = lastAccount()
    return accounts.find((a) => a.id === last)?.id ?? accounts.find((a) => !a.archivedAt)?.id ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const defaults = (): TransactionInput => ({
    type,
    amount: editing?.amount ?? (initial?.amount as number) ?? (undefined as unknown as number),
    date: editing?.date ?? initial?.date ?? today,
    accountId: editing?.accountId ?? initial?.accountId ?? defaultAccount,
    categoryId: editing?.categoryId ?? initial?.categoryId ?? '',
    subcategoryId: editing?.subcategoryId ?? initial?.subcategoryId ?? '',
    description: editing?.description ?? initial?.description ?? '',
    paymentMethod: editing?.paymentMethod ?? initial?.paymentMethod ?? '',
    merchant: editing?.merchant ?? initial?.merchant ?? '',
    notes: editing?.notes ?? initial?.notes ?? '',
    isRecurring: editing?.isRecurring ?? initial?.isRecurring ?? false,
    tags: editing?.tags ?? initial?.tags ?? [],
  })

  const form = useForm<TransactionInput>({
    resolver: zodResolver(schema) as unknown as Resolver<TransactionInput>,
    defaultValues: defaults(),
  })
  const { register, control, handleSubmit, setValue, reset, formState: { errors } } = form
  const w = useWatch({ control })

  // Categorías más usadas recientemente → atajos de un clic
  const frequent = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of data.transactions) if (t.type === type) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    return categories.filter((c) => !c.archivedAt).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transactions, type, categories.length])

  const subs = data.subcategories.filter((s) => s.categoryId === w.categoryId && (!s.archivedAt || s.id === w.subcategoryId))
  const balances = React.useMemo(() => accountBalances(data), [data])
  const accBalance = w.accountId ? balances.get(w.accountId) ?? 0 : 0
  // Al editar, el saldo ya incluye este movimiento: se descuenta para estimar el efecto.
  const effective = editing && editing.accountId === w.accountId ? accBalance + (editing.type === 'expense' ? editing.amount : -editing.amount) : accBalance
  const amount = typeof w.amount === 'number' ? w.amount : 0
  const goesNegative = type === 'expense' && amount > 0 && effective - amount < 0

  const dups = React.useMemo(() => {
    if (!amount || !w.date || !w.accountId) return []
    return findPossibleDuplicates(data.transactions, { id: editing?.id, type, date: w.date, amount, accountId: w.accountId, description: w.description ?? '', merchant: w.merchant ?? null })
  }, [data.transactions, editing?.id, type, amount, w.date, w.accountId, w.description, w.merchant])

  const submit = (another: boolean) =>
    handleSubmit(async (values) => {
      if (saving) return
      setSaving(true)
      try {
        const payload: TransactionInput = { ...values, type, id: formId }
        const ok = await act(async () => (editing ? services.transactions.update(editing.id, payload) : services.transactions.create(payload)), {
          success: editing ? 'Cambios guardados' : type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado',
        })
        if (!ok.ok) return
        try {
          localStorage.setItem(LAST_ACCOUNT_KEY, values.accountId)
        } catch {
          /* ignorar */
        }
        if (another && !editing) {
          setFormId(uid())
          reset({ ...defaults(), accountId: values.accountId, categoryId: values.categoryId, subcategoryId: values.subcategoryId, date: values.date, amount: undefined as unknown as number, description: '' })
          document.getElementById('tx-amount')?.focus()
        } else onDone()
      } finally {
        setSaving(false)
      }
    })()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(false)
      }}
      className="flex flex-col"
    >
      <div className="space-y-4 p-5">
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <Field label="Valor" error={errors.amount?.message}>
              <MoneyInput id="tx-amount" className="h-12 text-xl font-semibold" value={field.value as number | undefined} onChange={(v) => field.onChange(v ?? undefined)} aria-label="Valor" />
            </Field>
          )}
        />
        {!editing && frequent.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Categorías frecuentes">
            {frequent.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setValue('categoryId', c.id, { shouldValidate: true })
                  setValue('subcategoryId', '')
                }}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-surface-2"
                style={w.categoryId === c.id ? { borderColor: c.color, background: `${c.color}22`, color: c.color } : undefined}
              >
                <Icon name={c.icon} className="size-3" />
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría" error={errors.categoryId?.message}>
            <Select {...register('categoryId', { onChange: () => setValue('subcategoryId', '') })} aria-label="Categoría">
              <option value="">Elige…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archivedAt ? ' (archivada)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={type === 'expense' ? 'Pagado desde' : 'Cuenta de destino'} error={errors.accountId?.message}>
            <Select {...register('accountId')} aria-label="Cuenta">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" error={errors.date?.message}>
            <Input type="date" max={today} {...register('date')} aria-label="Fecha" />
          </Field>
          <Field label={type === 'expense' ? 'Descripción' : 'Descripción'} error={errors.description?.message}>
            <Input placeholder={type === 'expense' ? 'Ej. Almuerzo' : 'Ej. Pago de nómina'} {...register('description')} aria-label="Descripción" />
          </Field>
        </div>

        {goesNegative && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Esta cuenta tiene {formatMoney(effective)} y quedaría en {formatMoney(effective - amount)}.
          </p>
        )}
        {dups.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Posible duplicado: ya hay {dups.length === 1 ? 'un movimiento' : `${dups.length} movimientos`} con el mismo valor, cuenta y fecha
            {dups[0]?.description ? ` («${dups[0].description}»)` : ''}. Si es distinto, puedes guardarlo igual.
          </p>
        )}

        <button type="button" onClick={() => setShowMore((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
          <ChevronDown className={`size-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          Más detalles
        </button>
        {showMore && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subcategoría">
                <Select {...register('subcategoryId')} disabled={!subs.length} aria-label="Subcategoría">
                  <option value="">{subs.length ? 'Ninguna' : 'Sin subcategorías'}</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Método de pago">
                <Select {...register('paymentMethod')} aria-label="Método de pago">
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={type === 'expense' ? 'Comercio o destinatario' : 'Pagador o cliente'} error={errors.merchant?.message}>
              <Input {...register('merchant')} aria-label="Comercio o destinatario" />
            </Field>
            <Field label="Etiquetas">
              <Controller control={control} name="tags" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} suggestions={data.tags} />} />
            </Field>
            <Field label="Notas" error={errors.notes?.message}>
              <Textarea {...register('notes')} aria-label="Notas" />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">{type === 'expense' ? 'Gasto recurrente' : 'Ingreso recurrente'}</span>
                <span className="block text-xs text-muted">Solo lo marca como periódico. Para pagos futuros automáticos usa «Suscripciones».</span>
              </span>
              <Controller control={control} name="isRecurring" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} aria-label="Recurrente" />} />
            </label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        {!editing && (
          <Button variant="secondary" disabled={saving} onClick={() => void submit(true)}>
            Guardar y agregar otro
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {editing ? 'Guardar cambios' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
