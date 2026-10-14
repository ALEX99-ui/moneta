import * as React from 'react'
import { Archive, ArchiveRestore, CheckCircle2, Moon, Pencil, Plus, Sun, XCircle } from 'lucide-react'
import { useApp } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { IconTile } from '@/components/common'
import { AccountDialog } from '@/components/forms/AccountDialog'
import { BackupPanel } from '@/components/BackupPanel'
import { CategoryManager } from '@/components/CategoryManager'
import { accountBalances, reconcile } from '@/domain/ledger'
import { formatDate } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import { ACCOUNT_TYPE_LABEL, type Account } from '@/domain/types'
import { hasNative } from '@/lib/native'

export function SettingsScreen() {
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Preferencias, categorías, cuentas, respaldos y datos de la aplicación." />
      <Tabs defaultValue="general">
        <TabsList className="mb-5">
          <TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="categorias">Categorías</TabsTrigger><TabsTrigger value="cuentas">Cuentas</TabsTrigger>
          <TabsTrigger value="datos">Datos y respaldos</TabsTrigger><TabsTrigger value="atajos">Atajos</TabsTrigger><TabsTrigger value="acerca">Acerca de</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="categorias"><CategoryManager /></TabsContent>
        <TabsContent value="cuentas"><AccountsSettings /></TabsContent>
        <TabsContent value="datos"><BackupPanel /></TabsContent>
        <TabsContent value="atajos"><Shortcuts /></TabsContent>
        <TabsContent value="acerca"><About /></TabsContent>
      </Tabs>
    </div>
  )
}

function General() {
  const { data, services, act, today } = useApp()
  const s = data.settings
  const [name, setName] = React.useState(s.profileName)
  React.useEffect(() => setName(s.profileName), [s.profileName])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Perfil y formato" />
        <CardBody className="space-y-4 pt-3">
          <Field label="Nombre del perfil local" hint="Solo se muestra en esta aplicación.">
            <div className="flex gap-2"><Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Nombre del perfil" /><Button disabled={!name.trim() || name === s.profileName} onClick={() => void act(() => services.settings.update({ profileName: name }), { success: 'Perfil actualizado' })}>Guardar</Button></div>
          </Field>
          <Field label="Moneda principal" hint="Moneda contable única. No hay conversiones de divisas: harían falta tipos de cambio verificados.">
            <Select value="COP" disabled aria-label="Moneda"><option value="COP">Peso colombiano (COP) · $ 1.500.000</option></Select>
          </Field>
          <Field label="Formato de fecha" hint={`Ejemplo: ${formatDate(today, s.dateFormat)}`}>
            <Select value={s.dateFormat} onChange={(e) => void act(() => services.settings.update({ dateFormat: e.target.value as typeof s.dateFormat }))} aria-label="Formato de fecha">
              <option value="dd/MM/yyyy">día/mes/año (31/12/2025)</option><option value="yyyy-MM-dd">año-mes-día (2025-12-31)</option><option value="MM/dd/yyyy">mes/día/año (12/31/2025)</option>
            </Select>
          </Field>
          <Field label="Primer día del mes financiero" hint="Si cobras el 15, elige 15: tus meses van del 15 al 14 y todos los reportes y presupuestos lo respetan. Entre 1 y 28.">
            <Select value={s.monthStartDay} onChange={(e) => void act(() => services.settings.update({ monthStartDay: Number(e.target.value) }), { success: 'Mes financiero actualizado' })} aria-label="Primer día del mes financiero">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Apariencia" />
        <CardBody className="pt-3">
          <div className="grid grid-cols-2 gap-3">
            {([['dark', 'Oscuro', Moon], ['light', 'Claro', Sun]] as const).map(([v, label, Ic]) => (
              <button key={v} onClick={() => void act(() => services.settings.update({ theme: v }))} aria-pressed={s.theme === v}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-surface-2 ${s.theme === v ? 'border-primary bg-primary/10' : ''}`}>
                <Ic className="size-5" /><span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted">{v === 'dark' ? 'Predeterminado' : 'Para ambientes luminosos'}</span></span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function AccountsSettings() {
  const { data, services, act } = useApp()
  const confirm = useConfirm()
  const [dialog, setDialog] = React.useState<{ editing?: Account | null } | null>(null)
  const bal = React.useMemo(() => accountBalances(data), [data])
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setDialog({})}><Plus /> Nueva cuenta</Button></div>
      <Card className="divide-y divide-[var(--border)]/60">
        {data.accounts.map((a) => (
          <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.archivedAt ? 'opacity-60' : ''}`}>
            <IconTile icon={a.icon} color={a.color} size="sm" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name}{a.archivedAt && <Badge className="ml-2">Archivada</Badge>}</p><p className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[a.type]} · saldo inicial {formatMoney(a.initialBalance)}</p></div>
            <span className="num text-sm font-medium">{formatMoney(bal.get(a.id) ?? 0)}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${a.name}`} onClick={() => setDialog({ editing: a })}><Pencil /></Button>
            {a.archivedAt ? <Button variant="ghost" size="icon-sm" aria-label={`Restaurar ${a.name}`} onClick={() => void act(() => services.accounts.unarchive(a.id), { success: 'Cuenta restaurada' })}><ArchiveRestore /></Button>
              : <Button variant="ghost" size="icon-sm" aria-label={`Archivar ${a.name}`} onClick={async () => { if (await confirm({ title: `¿Archivar «${a.name}»?`, description: 'Solo si su saldo es cero. Se conserva todo el historial.', confirmLabel: 'Archivar' })) await act(() => services.accounts.archive(a.id), { success: 'Cuenta archivada' }) }}><Archive /></Button>}
          </div>
        ))}
      </Card>
      <AccountDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} editing={dialog?.editing} />
    </div>
  )
}

function Shortcuts() {
  const rows: [string, string][] = [
    ['Ctrl + K', 'Búsqueda global'], ['Ctrl + N', 'Registro rápido de gasto'], ['Ctrl + Shift + I', 'Registro rápido de ingreso'], ['Ctrl + Shift + T', 'Nueva transferencia'],
    ['Ctrl + 1 … 9', 'Panel, Gastos, Ingresos, Cuentas, Presupuestos, Metas, Suscripciones, Calendario, Reportes'], ['Ctrl + ,', 'Configuración'],
    ['↑ ↓ Enter', 'Moverse y abrir resultados en la búsqueda'], ['Esc', 'Cerrar ventanas'],
  ]
  return (
    <Card><CardBody>
      <ul className="divide-y divide-[var(--border)]/60">{rows.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="text-muted">{d}</span><kbd className="shrink-0 rounded-md border bg-surface-2 px-2 py-1 text-xs font-medium">{k}</kbd></li>)}</ul>
    </CardBody></Card>
  )
}

function About() {
  const { data, status } = useApp()
  const rec = React.useMemo(() => reconcile(data), [data])
  const health = status?.health ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="MONETA — Personal Finance" subtitle="Finanzas personales privadas y sin conexión" />
        <CardBody className="space-y-2 pt-3 text-sm">
          <Row k="Versión" v={status?.version ?? '0.1.0 (desarrollo)'} />
          <Row k="Esquema de base de datos" v={status ? `v${status.schema_version}` : '—'} />
          <Row k="Moneda contable" v="COP · pesos enteros" />
          <Row k="Ubicación de los datos" v={status?.data_dir ?? 'Modo desarrollo en navegador'} mono />
          <Row k="Archivo de base de datos" v={status?.db_path ?? '—'} mono />
          <p className="pt-2 text-xs text-muted">Todo se guarda localmente en SQLite. La aplicación no usa Internet, cuentas, analíticas ni servicios externos.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Diagnóstico de integridad" subtitle="Comprobaciones que puedes verificar en cualquier momento" />
        <CardBody className="space-y-3 pt-3 text-sm">
          <Check ok={rec.ok} label="Conciliación de saldos" detail={`Suma de saldos ${formatMoney(rec.actual)} = saldos iniciales + ingresos − gastos ${formatMoney(rec.expected)}. Las transferencias se anulan entre sí.`} />
          <Check ok={hasNative() ? health.length === 1 && health[0] === 'ok' : true} label="Integridad de la base de datos" detail={hasNative() ? (health.join(', ') || 'sin información') : 'Solo verificable en la aplicación de escritorio.'} />
          <Check ok label="Datos cargados" detail={`${data.transactions.length} movimientos · ${data.transfers.length} transferencias · ${data.accounts.length} cuentas · ${data.goals.length} metas`} />
        </CardBody>
      </Card>
    </div>
  )
}
const Row = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => <div className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className={mono ? 'break-all text-right text-xs' : 'text-right font-medium'}>{v}</span></div>
const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
  <div className="flex items-start gap-2.5">{ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-expense" />}<div><p className="font-medium">{label}</p><p className="text-xs text-muted">{detail}</p></div></div>
)
