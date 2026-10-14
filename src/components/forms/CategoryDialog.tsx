import * as React from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { ColorPicker, IconPicker } from './Pickers'
import { useApp } from '@/app/DataProvider'
import { categorySchema, type CategoryInput } from '@/validation/schemas'
import { effectiveBudget } from '@/domain/budgets'
import type { Category, TxType } from '@/domain/types'
import { uid } from '@/lib/utils'

export function CategoryDialog({ open, onOpenChange, editing, kind }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Category | null; kind: TxType }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={editing ? 'Editar categoría' : kind === 'expense' ? 'Nueva categoría de gasto' : 'Nueva fuente de ingreso'} description="Archivar una categoría conserva todo su historial.">
          <CategoryForm editing={editing ?? null} kind={editing?.kind ?? kind} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function CategoryForm({ editing, kind, onDone }: { editing: Category | null; kind: TxType; onDone: () => void }) {
  const { data, services, act } = useApp()
  const [formId] = React.useState(() => uid())
  const current = editing ? data.budgets.find((b) => b.categoryId === editing.id && b.month === 'default')?.amount ?? effectiveBudget(data.budgets, editing.id, 'default')?.amount ?? null : null
  const [budget, setBudget] = React.useState<number | null>(current)
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema) as unknown as Resolver<CategoryInput>,
    defaultValues: { name: editing?.name ?? '', kind, icon: editing?.icon ?? 'tag', color: editing?.color ?? '#6366F1', essential: editing?.essential ?? false },
  })
  return (
    <form onSubmit={handleSubmit(async (v) => {
      const r = await act(async () => {
        const id = editing ? editing.id : await services.categories.create({ ...v, id: formId })
        if (editing) await services.categories.update(editing.id, v)
        if (kind === 'expense' && (budget !== current)) await services.budgets.set({ categoryId: id, month: 'default', amount: budget })
      }, { success: editing ? 'Categoría actualizada' : 'Categoría creada' })
      if (r.ok) onDone()
    })}>
      <div className="space-y-4 p-5">
        <Field label="Nombre" error={errors.name?.message}><Input autoFocus {...register('name')} aria-label="Nombre de la categoría" /></Field>
        {kind === 'expense' && (
          <>
            <Field label="Presupuesto mensual predeterminado (opcional)" hint="Se aplica a todos los meses; puedes ajustarlo por mes en Presupuestos."><MoneyInput value={budget} onChange={setBudget} aria-label="Presupuesto predeterminado" /></Field>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span><span className="block text-sm font-medium">Gasto esencial</span><span className="block text-xs text-muted">Se usa para comparar gastos esenciales y no esenciales y para las recomendaciones.</span></span>
              <Controller control={control} name="essential" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} aria-label="Gasto esencial" />} />
            </label>
          </>
        )}
        <Field label="Color"><Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value ?? '#6366F1'} onChange={field.onChange} />} /></Field>
        <Field label="Icono"><Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value ?? 'tag'} onChange={field.onChange} color={watch('color') ?? '#6366F1'} />} /></Field>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onDone}>Cancelar</Button><Button type="submit" disabled={isSubmitting}>{editing ? 'Guardar cambios' : 'Crear'}</Button></DialogFooter>
    </form>
  )
}
