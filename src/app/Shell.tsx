import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight, BarChart3, CalendarDays, LayoutDashboard, Moon, PieChart, Plus, Repeat, Search, Settings, Sparkles, Sun, Target,
  TrendingDown, TrendingUp, Wallet, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/dropdown'
import { useApp } from './DataProvider'
import { useUI } from './UIProvider'
import { overdueRules } from '@/domain/recurring'

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown },
  { to: '/ingresos', label: 'Ingresos', icon: TrendingUp },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/presupuestos', label: 'Presupuestos', icon: PieChart },
  { to: '/metas', label: 'Metas de ahorro', icon: Target },
  { to: '/suscripciones', label: 'Suscripciones', icon: Repeat },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/insights', label: 'Insights', icon: Sparkles },
] as const

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#4338CA] text-[15px] font-bold text-white shadow-[0_4px_14px_-4px_#6366f1]', className)}>M</span>
  )
}

export function Shell() {
  const { data, services, act, today } = useApp()
  const ui = useUI()
  const nav = useNavigate()
  const loc = useLocation()
  const overdue = overdueRules(data.rules, today).length

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      const t = e.target as HTMLElement
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
      if (k === 'k') {
        e.preventDefault()
        ui.openSearch()
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault()
        ui.openTransaction({ type: 'expense', quick: true })
      } else if (k === 'i' && e.shiftKey) {
        e.preventDefault()
        ui.openTransaction({ type: 'income', quick: true })
      } else if (k === 't' && e.shiftKey) {
        e.preventDefault()
        ui.openTransfer()
      } else if (!typing && /^[1-9]$/.test(k)) {
        e.preventDefault()
        nav(['/', '/gastos', '/ingresos', '/cuentas', '/presupuestos', '/metas', '/suscripciones', '/calendario', '/reportes'][Number(k) - 1]!)
      } else if (k === ',') {
        e.preventDefault()
        nav('/configuracion')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui, nav])

  const dark = data.settings.theme === 'dark'
  return (
    <div className="flex h-full">
      <aside className="flex w-[72px] shrink-0 flex-col border-r bg-surface/60 py-4 backdrop-blur lg:w-60" aria-label="Navegación principal">
        <div className="flex items-center gap-3 px-4 lg:px-5">
          <Logo />
          <div className="hidden min-w-0 lg:block">
            <p className="text-[15px] font-semibold leading-4 tracking-tight">MONETA</p>
            <p className="truncate text-[11px] text-muted">{data.settings.profileName}</p>
          </div>
        </div>
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={'end' in n ? n.end : false}
              title={n.label}
              className={({ isActive }) =>
                cn('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground max-lg:justify-center', isActive && 'bg-primary/12 text-primary hover:bg-primary/12 hover:text-primary')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className="size-[18px] shrink-0" />
                  <span className="hidden lg:inline">{n.label}</span>
                  {n.to === '/suscripciones' && overdue > 0 && (
                    <span className="ml-auto hidden rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-warning lg:inline" title="Pagos vencidos sin registrar">
                      {overdue}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-0.5 px-2.5">
          <NavLink
            to="/configuracion"
            title="Configuración"
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground max-lg:justify-center', isActive && 'bg-primary/12 text-primary')}
          >
            <Settings className="size-[18px]" />
            <span className="hidden lg:inline">Configuración</span>
          </NavLink>
          <button
            onClick={() => void act(() => services.settings.update({ theme: dark ? 'light' : 'dark' }))}
            title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground max-lg:justify-center"
          >
            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            <span className="hidden lg:inline">{dark ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto" id="main-scroll">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/80 px-6 py-3 backdrop-blur-md">
          <button
            onClick={ui.openSearch}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-surface px-3 text-sm text-muted transition-colors hover:text-foreground"
            aria-label="Abrir búsqueda"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar movimientos…</span>
            <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => ui.openTransaction({ type: 'expense', quick: true })} title="Registro rápido (Ctrl+N)">
              <Zap /> Gasto rápido
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button aria-label="Nuevo movimiento">
                  <Plus /> Nuevo
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => ui.openTransaction({ type: 'expense' })}>
                  <TrendingDown /> Gasto
                </MenuItem>
                <MenuItem onSelect={() => ui.openTransaction({ type: 'income' })}>
                  <TrendingUp /> Ingreso
                </MenuItem>
                <MenuItem onSelect={() => ui.openTransfer()}>
                  <ArrowLeftRight /> Transferencia
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        <div key={loc.pathname} className="page-enter mx-auto w-full max-w-[1400px] px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
