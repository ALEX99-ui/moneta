import * as React from 'react'
import { AlertTriangle, DatabaseBackup, Download, FolderOpen, History, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/app/DataProvider'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { friendlyError } from '@/db/types'
import { transfersToRows, toCsv, transactionsToRows } from '@/domain/csv'
import { hasNative, native, type VerifyReport } from '@/lib/native'
import { pickFolder, pickOpenPath, pickSavePath, saveTextFile } from '@/lib/files'
import { ImportDialog } from './ImportDialog'

const DB_FILTER = [{ name: 'Respaldo MONETA', extensions: ['db'] }]
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
const LABELS: Record<string, string> = { accounts: 'cuentas', categories: 'categorías', transactions: 'movimientos', transfers: 'transferencias', savings_goals: 'metas', goal_contributions: 'aportes a metas', budgets: 'presupuestos', recurring_rules: 'pagos periódicos' }

export function BackupPanel() {
  const { data, services, act, status, reload, today } = useApp()
  const native_ = hasNative()
  const [busy, setBusy] = React.useState(false)
  const [restore, setRestore] = React.useState<{ path: string; report: VerifyReport } | null>(null)
  const [done, setDone] = React.useState<{ pre: string; counts: Record<string, number> } | null>(null)
  const [importing, setImporting] = React.useState(false)
  const s = data.settings

  const backupNow = async () => {
    setBusy(true)
    try {
      const dest = await pickSavePath(`moneta-respaldo-${stamp()}.db`, DB_FILTER)
      if (!dest) return
      const info = await native.backupCreate(dest)
      toast.success('Respaldo creado y verificado', { description: `${info.path} · ${Object.entries(info.counts).filter(([k]) => LABELS[k]).map(([k, v]) => `${v} ${LABELS[k]}`).join(', ')}` })
    } catch (e) {
      toast.error(`No se pudo crear el respaldo: ${friendlyError(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const chooseRestore = async () => {
    setBusy(true)
    try {
      const path = await pickOpenPath(DB_FILTER)
      if (!path) return
      const report = await native.backupVerify(path)
      setRestore({ path, report })
    } catch (e) {
      toast.error(`No se pudo leer el respaldo: ${friendlyError(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async () => {
    if (!restore) return
    setBusy(true)
    try {
      const rep = await native.backupRestore(restore.path)
      await reload()
      setRestore(null)
      setDone({ pre: rep.pre_restore_backup, counts: rep.counts })
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const exportAll = async () => {
    const csv = toCsv(transactionsToRows(data, data.transactions), ';')
    const p = await saveTextFile(`moneta-transacciones-${today}.csv`, csv, [{ name: 'CSV', extensions: ['csv'] }])
    if (p) toast.success(`Exportados ${data.transactions.length} movimientos`, { description: p })
  }
  const exportTransfers = async () => {
    const p = await saveTextFile(`moneta-transferencias-${today}.csv`, toCsv(transfersToRows(data), ';'), [{ name: 'CSV', extensions: ['csv'] }])
    if (p) toast.success(`Exportadas ${data.transfers.length} transferencias`, { description: p })
  }

  return (
    <div className="space-y-4">
      {!native_ && <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Los respaldos de la base de datos solo están disponibles en la aplicación de escritorio (estás en el modo de desarrollo del navegador). La exportación e importación de CSV sí funciona.</p>}

      <Card>
        <CardHeader title="Respaldo manual" subtitle="Una copia completa y verificada de todos tus datos en un solo archivo" />
        <CardBody className="flex flex-wrap items-center gap-3 pt-3">
          <Button onClick={backupNow} disabled={!native_ || busy}><DatabaseBackup /> Crear respaldo…</Button>
          <Button variant="outline" onClick={chooseRestore} disabled={!native_ || busy}><RotateCcw /> Restaurar desde un respaldo…</Button>
          <p className="basis-full text-xs text-muted">Elige dónde guardarlo (disco externo, nube sincronizada, etc.). Antes de restaurar se verifica la integridad del archivo, se te pide confirmación y se crea automáticamente una copia de seguridad de tus datos actuales.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Respaldos automáticos locales" subtitle="Una copia al abrir MONETA si pasaron más de 20 horas desde la última" />
        <CardBody className="space-y-4 pt-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Crear respaldos automáticos</span>
            <Switch checked={s.autoBackup} onCheckedChange={(v) => void act(() => services.settings.update({ autoBackup: v }))} disabled={!native_} aria-label="Respaldos automáticos" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Carpeta de respaldos</p>
              <div className="flex gap-2"><Input readOnly value={s.backupDir || status?.default_backup_dir || '(carpeta predeterminada de la aplicación)'} aria-label="Carpeta de respaldos" />
                <Button variant="outline" disabled={!native_} onClick={async () => { const f = await pickFolder(); if (f) await act(() => services.settings.update({ backupDir: f }), { success: 'Carpeta de respaldos actualizada' }) }}><FolderOpen /> Cambiar</Button>
                {s.backupDir && <Button variant="ghost" onClick={() => void act(() => services.settings.update({ backupDir: '' }))}>Predeterminada</Button>}</div>
            </div>
            <div><p className="mb-1.5 text-xs font-medium text-muted">Conservar los últimos</p>
              <Select className="w-32" value={s.autoBackupKeep} onChange={(e) => void act(() => services.settings.update({ autoBackupKeep: Number(e.target.value) }))} aria-label="Cantidad de respaldos">{[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} respaldos</option>)}</Select></div>
          </div>
          <Button variant="outline" size="sm" disabled={!native_ || busy} onClick={async () => { try { const b = await native.backupAuto(s.backupDir || null, s.autoBackupKeep, 0); toast.success('Respaldo creado', { description: b?.path }) } catch (e) { toast.error(friendlyError(e)) } }}><History /> Crear un respaldo automático ahora</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exportar e importar" subtitle="Tus datos son tuyos: sácalos en formatos abiertos" />
        <CardBody className="flex flex-wrap gap-3 pt-3">
          <Button variant="outline" onClick={exportAll}><Download /> Exportar todas las transacciones (CSV)</Button>
          <Button variant="outline" onClick={exportTransfers}><Download /> Exportar transferencias (CSV)</Button>
          <Button variant="outline" onClick={() => setImporting(true)}><Download className="rotate-180" /> Importar movimientos desde CSV…</Button>
        </CardBody>
      </Card>

      <Dialog open={!!restore} onOpenChange={(o) => !o && setRestore(null)}>
        {restore && (
          <DialogContent title="Restaurar respaldo" description={restore.path} size="md">
            <div className="space-y-3 p-5 text-sm">
              {restore.report.ok ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-income"><ShieldCheck className="size-4" /> El archivo pasó la verificación de integridad.</p>
                  <ul className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2/60 p-3 text-xs">{Object.entries(restore.report.counts).filter(([k]) => LABELS[k]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{LABELS[k]}</span><span className="num font-medium">{v}</span></li>)}</ul>
                  <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><strong>Se reemplazarán todos tus datos actuales</strong> por los del respaldo. Antes se guardará automáticamente una copia de tus datos actuales para poder volver atrás.</span></p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 font-medium text-expense"><AlertTriangle className="size-4" /> Este archivo no se puede restaurar.</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted">{restore.report.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  <p className="text-xs text-muted">Tus datos actuales no fueron modificados.</p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRestore(null)}>Cancelar</Button>
              {restore.report.ok && <Button variant="destructive" disabled={busy} onClick={doRestore}>Reemplazar mis datos y restaurar</Button>}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!done} onOpenChange={(o) => !o && setDone(null)}>
        {done && (
          <DialogContent title="Restauración completada" size="sm">
            <div className="space-y-2 p-5 text-sm"><p className="flex items-center gap-2 font-medium text-income"><ShieldCheck className="size-4" /> Tus datos fueron restaurados.</p><p className="text-muted">Copia de tus datos anteriores guardada en:</p><p className="break-all rounded-lg bg-surface-2/60 p-2 text-xs">{done.pre}</p></div>
            <DialogFooter><Button onClick={() => setDone(null)}>Entendido</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  )
}
