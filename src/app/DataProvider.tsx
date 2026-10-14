import * as React from 'react'
import { toast } from 'sonner'
import { loadAll } from '@/db/repositories'
import { tauriDb, isTauri } from '@/db/tauriDb'
import { devHttpDb } from '@/db/devHttpDb'
import { friendlyError, type Db } from '@/db/types'
import { createServices, type Services } from '@/services'
import { emptyData, type FinanceData } from '@/domain/types'
import { todayISO, type ISODate } from '@/domain/dates'
import { accountMap, categoryMap } from '@/domain/ledger'
import { native, type AppStatus } from '@/lib/native'

export type ActResult<T> = { ok: true; value: T } | { ok: false }

interface Ctx {
  data: FinanceData
  services: Services
  db: Db
  today: ISODate
  status: AppStatus | null
  reload: () => Promise<void>
  /** Ejecuta una operación, muestra errores legibles y recarga los datos. */
  act: <T>(fn: () => Promise<T>, opts?: { success?: string }) => Promise<ActResult<T>>
}

const DataCtx = React.createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const c = React.useContext(DataCtx)
  if (!c) throw new Error('DataProvider ausente')
  return c
}
export const useData = () => useApp().data
export const useServices = () => useApp().services
export const useToday = () => useApp().today

export function useLookups() {
  const { data } = useApp()
  return React.useMemo(
    () => ({
      categories: categoryMap(data.categories),
      accounts: accountMap(data.accounts),
      subcategories: new Map(data.subcategories.map((s) => [s.id, s])),
    }),
    [data.categories, data.accounts, data.subcategories],
  )
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('moneta-theme', theme)
  } catch {
    /* sin almacenamiento disponible */
  }
}

function FatalScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="surface max-w-lg p-6">
        <h1 className="text-lg font-semibold text-expense">{title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{message}</p>
      </div>
    </div>
  )
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = React.useState<Db | null>(null)
  const [data, setData] = React.useState<FinanceData | null>(null)
  const [status, setStatus] = React.useState<AppStatus | null>(null)
  const [fatal, setFatal] = React.useState<string | null>(null)
  const [today, setToday] = React.useState<ISODate>(() => todayISO())

  // Tema inicial sin parpadeo
  React.useEffect(() => {
    try {
      const t = localStorage.getItem('moneta-theme')
      if (t === 'light' || t === 'dark') applyTheme(t)
    } catch {
      /* ignorar */
    }
  }, [])

  // La fecha de "hoy" se refresca si la app queda abierta pasada la medianoche.
  React.useEffect(() => {
    const id = setInterval(() => setToday((t) => (todayISO() !== t ? todayISO() : t)), 60_000)
    return () => clearInterval(id)
  }, [])

  const services = React.useMemo(() => (db ? createServices(db) : null), [db])

  const reload = React.useCallback(async () => {
    if (!db) return
    setData(await loadAll(db))
  }, [db])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let chosen: Db
        if (isTauri()) {
          const st = await native.status()
          if (cancelled) return
          setStatus(st)
          if (!st.ready) throw new Error(st.error ?? 'La base de datos no está disponible')
          chosen = tauriDb
        } else if (import.meta.env.DEV) {
          chosen = devHttpDb
        } else {
          throw new Error('MONETA debe ejecutarse como aplicación de escritorio.')
        }
        const svc = createServices(chosen)
        await svc.transactions.purgeDeleted(30)
        const loaded = await loadAll(chosen)
        if (cancelled) return
        applyTheme(loaded.settings.theme)
        setDb(chosen)
        setData(loaded)
        // Respaldo automático local (no bloquea el arranque)
        if (isTauri() && loaded.settings.autoBackup) {
          native
            .backupAuto(loaded.settings.backupDir || null, loaded.settings.autoBackupKeep, 20)
            .then((b) => b && toast.success('Respaldo automático creado'))
            .catch((e) => toast.warning(`No se pudo crear el respaldo automático: ${friendlyError(e)}`))
        }
      } catch (e) {
        if (!cancelled) setFatal(friendlyError(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (data) applyTheme(data.settings.theme)
  }, [data?.settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = React.useCallback(
    async <T,>(fn: () => Promise<T>, opts?: { success?: string }): Promise<ActResult<T>> => {
      try {
        const r = await fn()
        await reload()
        if (opts?.success) toast.success(opts.success)
        return { ok: true, value: r }
      } catch (e) {
        toast.error(friendlyError(e))
        await reload().catch(() => undefined)
        return { ok: false }
      }
    },
    [reload],
  )

  if (fatal) return <FatalScreen title="No se pudo iniciar MONETA" message={fatal} />
  if (!db || !data || !services) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">
        <div className="flex items-center gap-3">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Abriendo tus finanzas…
        </div>
      </div>
    )
  }
  return <DataCtx.Provider value={{ data: data ?? emptyData(), services, db, today, status, reload, act }}>{children}</DataCtx.Provider>
}
export type { Services }
