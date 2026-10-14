import * as React from 'react'
import { AlertCircle, CheckCircle2, Copy, FileUp } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/app/DataProvider'
import { parseCsv } from '@/domain/csv'
import { autoMapping, buildPreview, rowsToImport, type ColumnMapping, type ImportOptions, type NumberStyle, type ImportDateFormat } from '@/domain/csvImport'
import { formatMoney } from '@/domain/money'
import { pickTextFile } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useDateFmt } from './common'

const FIELDS: { key: keyof ColumnMapping; label: string; required?: string }[] = [
  { key: 'date', label: 'Fecha', required: 'Obligatoria' }, { key: 'amount', label: 'Valor (con signo o con columna «Tipo»)' },
  { key: 'income', label: 'Valor de ingresos (alternativa)' }, { key: 'expense', label: 'Valor de gastos (alternativa)' }, { key: 'type', label: 'Tipo (Ingreso/Gasto)' },
  { key: 'description', label: 'Descripción' }, { key: 'category', label: 'Categoría' }, { key: 'account', label: 'Cuenta' }, { key: 'merchant', label: 'Comercio o destinatario' }, { key: 'notes', label: 'Notas' }, { key: 'tags', label: 'Etiquetas' },
]

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <DialogContent title="Importar movimientos desde CSV" description="Revisa la vista previa: nada se guarda hasta que confirmes." size="xl"><ImportBody onDone={() => onOpenChange(false)} /></DialogContent>}
    </Dialog>
  )
}

function ImportBody({ onDone }: { onDone: () => void }) {
  const { data, services, today, act } = useApp()
  const fmt = useDateFmt()
  const [file, setFile] = React.useState<{ name: string; rows: string[][] } | null>(null)
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null)
  const [error, setError] = React.useState('')
  const [opts, setOpts] = React.useState<ImportOptions>({ numberStyle: 'co', dateFormat: 'auto-dmy', defaultAccountId: data.accounts.find((a) => !a.archivedAt)?.id ?? '', includeDuplicates: false })
  const [saving, setSaving] = React.useState(false)
  const preview = React.useMemo(() => (file && mapping ? buildPreview(file.rows, mapping, opts, data, today) : []), [file, mapping, opts, data, today])
  const counts = { ok: preview.filter((p) => p.status === 'ok').length, dup: preview.filter((p) => p.status === 'duplicate').length, err: preview.filter((p) => p.status === 'error').length }
  const toImport = rowsToImport(preview, opts.includeDuplicates)

  const choose = async () => {
    setError('')
    try {
      const f = await pickTextFile([{ name: 'CSV', extensions: ['csv', 'txt'] }])
      if (!f) return
      const rows = parseCsv(f.text)
      if (rows.length < 2) return setError('El archivo está vacío o no tiene filas de datos.')
      setFile({ name: f.name, rows })
      setMapping(autoMapping(rows[0]!))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!file || !mapping) {
    return (
      <div className="p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><FileUp className="size-6" /></div>
        <p className="font-medium">Elige un archivo CSV</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Funciona con extractos o exportaciones con encabezados (Fecha, Descripción, Valor…). Detecta automáticamente el separador (, ; o tabulación) y te dejará mapear las columnas.</p>
        {error && <p role="alert" className="mt-3 text-sm text-expense">{error}</p>}
        <Button className="mt-5" onClick={choose}><FileUp /> Elegir archivo…</Button>
      </div>
    )
  }
  const headers = file.rows[0]!
  return (
    <div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{file.name}</strong> · {file.rows.length - 1} filas</span><Button variant="ghost" size="sm" onClick={() => { setFile(null); setMapping(null) }}>Cambiar archivo</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label + (f.required ? ` · ${f.required}` : '')}>
              <Select value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })} aria-label={f.label}>
                <option value="">— No usar —</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
              </Select>
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Formato de números"><Select value={opts.numberStyle} onChange={(e) => setOpts({ ...opts, numberStyle: e.target.value as NumberStyle })} aria-label="Formato de números"><option value="co">1.500.000,00 (Colombia)</option><option value="us">1,500,000.00 (EE. UU.)</option></Select></Field>
          <Field label="Formato de fechas"><Select value={opts.dateFormat} onChange={(e) => setOpts({ ...opts, dateFormat: e.target.value as ImportDateFormat })} aria-label="Formato de fechas"><option value="auto-dmy">Día/mes/año (o AAAA-MM-DD)</option><option value="mdy">Mes/día/año</option></Select></Field>
          <Field label="Cuenta por defecto"><Select value={opts.defaultAccountId} onChange={(e) => setOpts({ ...opts, defaultAccountId: e.target.value })} aria-label="Cuenta por defecto">{data.accounts.filter((a) => !a.archivedAt).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="income"><CheckCircle2 className="size-3" /> {counts.ok} listas</Badge>
          <Badge tone="warning"><Copy className="size-3" /> {counts.dup} repetidas</Badge>
          <Badge tone="expense"><AlertCircle className="size-3" /> {counts.err} con errores</Badge>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted"><Switch checked={opts.includeDuplicates} onCheckedChange={(v) => setOpts({ ...opts, includeDuplicates: v })} aria-label="Importar repetidas" />Importar también las repetidas</label>
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface"><tr className="border-b text-left text-muted"><th className="px-3 py-2 font-medium">Línea</th><th className="font-medium">Estado</th><th className="font-medium">Fecha</th><th className="font-medium">Tipo</th><th className="text-right font-medium">Valor</th><th className="px-3 font-medium">Descripción</th><th className="font-medium">Categoría</th><th className="font-medium">Observaciones</th></tr></thead>
            <tbody>
              {preview.slice(0, 200).map((r) => (
                <tr key={r.line} className={cn('border-b border-[var(--border)]/50', r.status === 'error' && 'bg-expense/5', r.status === 'duplicate' && !opts.includeDuplicates && 'bg-warning/5 opacity-70')}>
                  <td className="num px-3 py-1.5 text-muted">{r.line}</td>
                  <td>{r.status === 'ok' ? <span className="text-income">Lista</span> : r.status === 'duplicate' ? <span className="text-warning">Repetida</span> : <span className="text-expense">Error</span>}</td>
                  <td className="num">{r.input ? fmt(r.display.date) : r.display.date}</td><td>{r.display.type}</td><td className="num text-right">{r.display.amount ? formatMoney(r.display.amount) : '—'}</td>
                  <td className="max-w-40 truncate px-3">{r.display.description}</td><td>{r.display.category}</td><td className="max-w-64 truncate text-muted" title={r.messages.join(' · ')}>{r.messages.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 200 && <p className="px-3 py-2 text-center text-xs text-muted">Mostrando 200 de {preview.length} filas (se importarán todas las válidas).</p>}
        </div>
      </div>
      <DialogFooter>
        <span className="mr-auto text-xs text-muted">Se guardarán {toImport.length} movimientos en una sola operación.</span>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button disabled={saving || toImport.length === 0} onClick={async () => { setSaving(true); const r = await act(() => services.transactions.createMany(toImport), { success: `${toImport.length} movimientos importados` }); setSaving(false); if (r.ok) onDone() }}>Importar {toImport.length} movimientos</Button>
      </DialogFooter>
    </div>
  )
}
