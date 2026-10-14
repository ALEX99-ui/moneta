import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react'
import { useApp, useLookups } from '@/app/DataProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { Amount, CategoryBadge, LegendDot, useDateFmt } from '@/components/common'
import { detectDuplicates, essentialSplit, financialHealth, generateInsights, projectMonthEnd, simulateReduction, type Severity } from '@/insights'
import { monthKeyOf, monthRange } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import { cn } from '@/lib/utils'

export const INSIGHT_COLOR: Record<Severity, string> = { alert: 'var(--expense)', warning: 'var(--warning)', info: 'var(--primary)', positive: 'var(--income)' }
const SEV_LABEL: Record<Severity, string> = { alert: 'Atención', warning: 'Revisar', info: 'Información', positive: 'Buen trabajo' }
const SEV_TONE: Record<Severity, 'expense' | 'warning' | 'primary' | 'income'> = { alert: 'expense', warning: 'warning', info: 'primary', positive: 'income' }
const SEV_ICON: Record<Severity, typeof Info> = { alert: AlertTriangle, warning: AlertTriangle, info: Lightbulb, positive: CheckCircle2 }

export function InsightsScreen() {
  const { data, today } = useApp()
  const l = useLookups()
  const fmt = useDateFmt()
  const sd = data.settings.monthStartDay
  const res = React.useMemo(() => generateInsights(data, today), [data, today])
  const health = React.useMemo(() => financialHealth(data, today), [data, today])
  const proj = React.useMemo(() => projectMonthEnd(data, today), [data, today])
  const dups = React.useMemo(() => detectDuplicates(data, today), [data, today])
  const month = monthKeyOf(today, sd)
  const split = React.useMemo(() => essentialSplit(data, monthRange(month, sd)), [data, month, sd])
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <div>
      <PageHeader title="Insights" subtitle="Recomendaciones calculadas en tu equipo con reglas visibles. Cada una explica de dónde sale cada cifra; sin datos suficientes, no concluye nada." />

      {res.limitedData && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>Hay {res.completeMonths} mes{res.completeMonths === 1 ? '' : 'es'} completo{res.completeMonths === 1 ? '' : 's'} de historial. Para comparar tendencias y calcular promedios confiables se necesitan al menos 2 meses completos registrados; mientras tanto solo verás avisos que no dependen de historial.</span>
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {res.insights.length === 0 && (
            <Card><CardBody className="py-14 text-center"><Sparkles className="mx-auto mb-3 size-8 text-primary" /><p className="font-medium">Por ahora no hay recomendaciones</p><p className="mx-auto mt-1 max-w-md text-sm text-muted">Registra tus ingresos y gastos durante un par de meses. Aquí aparecerán aumentos de gasto, potencial de ahorro, suscripciones y más, siempre basados en tus movimientos reales.</p></CardBody></Card>
          )}
          {res.insights.map((i) => {
            const Ic = SEV_ICON[i.severity]
            const expanded = open === i.id
            return (
              <Card key={i.id} className="overflow-hidden">
                <div className="flex gap-3 p-4">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${INSIGHT_COLOR[i.severity]} 16%, transparent)`, color: INSIGHT_COLOR[i.severity] }}><Ic className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2"><Badge tone={SEV_TONE[i.severity]}>{SEV_LABEL[i.severity]}</Badge></div>
                    <p className="text-[15px] font-medium leading-snug">{i.title}</p>
                    <p className="mt-1 text-sm text-muted">{i.detail}</p>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => setOpen(expanded ? null : i.id)} aria-expanded={expanded}><ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />¿Cómo se calculó?</button>
                      {i.link && <Link to={i.link} className="text-muted hover:text-foreground">Ver detalle →</Link>}
                    </div>
                    {expanded && <ol className="mt-3 list-decimal space-y-1 rounded-lg bg-surface-2/60 py-3 pl-8 pr-3 text-xs text-muted">{i.explanation.map((s, k) => <li key={k}>{s}</li>)}</ol>}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <div className="space-y-4">
          <HealthCard health={health} />
          <Simulator />
          <Card>
            <CardHeader title="Proyección de cierre de mes" subtitle="Cálculo sencillo, no una predicción exacta" />
            <CardBody className="pt-3">
              {!proj.enough ? <p className="text-sm text-muted">Aún no hay suficientes datos del mes en curso (se necesitan al menos 7 días y algún gasto).</p> : (
                <>
                  <p className="num text-2xl font-semibold">{formatMoney(proj.projectedExpense)}</p>
                  <p className="mt-0.5 text-xs text-muted">gasto proyectado al cierre · llevas {formatMoney(proj.spentSoFar)} en {proj.elapsedDays} de {proj.totalDays} días</p>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted">{proj.explanation.map((s, k) => <li key={k}>{s}</li>)}</ol>
                </>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Esenciales vs. no esenciales" subtitle="Mes en curso · según la marca de cada categoría" />
            <CardBody className="pt-3">
              {split.total === 0 ? <p className="text-sm text-muted">No hay gastos este mes.</p> : (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Proporción esencial y no esencial">
                    <div style={{ width: `${(split.essentialShare ?? 0) * 100}%`, background: 'var(--primary)' }} />
                    <div style={{ width: `${(1 - (split.essentialShare ?? 0)) * 100}%`, background: 'var(--warning)', marginLeft: 2 }} />
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between"><LegendDot color="var(--primary)">Esenciales</LegendDot><span className="num">{formatMoney(split.essential)} <span className="text-xs text-muted">({Math.round((split.essentialShare ?? 0) * 100)}%)</span></span></div>
                    <div className="flex items-center justify-between"><LegendDot color="var(--warning)">No esenciales</LegendDot><span className="num">{formatMoney(split.nonEssential)} <span className="text-xs text-muted">({Math.round((1 - (split.essentialShare ?? 0)) * 100)}%)</span></span></div>
                  </div>
                  {split.essentialOfIncome !== null && <p className="mt-3 text-xs text-muted">Los esenciales equivalen al {Math.round(split.essentialOfIncome * 100)}% de tus ingresos del mes.</p>}
                </>
              )}
            </CardBody>
          </Card>
          {dups.length > 0 && (
            <Card>
              <CardHeader title="Posibles duplicados" subtitle="Últimos 45 días" />
              <CardBody className="space-y-3 pt-3">
                {dups.slice(0, 5).map((g) => (
                  <Link key={g[0]!.id} to={`/${g[0]!.type === 'expense' ? 'gastos' : 'ingresos'}?focus=${g[0]!.id}`} className="block rounded-lg border p-3 text-sm hover:bg-surface-2/50">
                    <div className="flex items-center justify-between"><CategoryBadge category={l.categories.get(g[0]!.categoryId)} compact /><Amount value={g[0]!.amount} tone={g[0]!.type} className="font-medium" /></div>
                    <p className="mt-1 text-xs text-muted">{g.length} movimientos iguales el {fmt(g[0]!.date)} · «{g[0]!.description || 'sin descripción'}»</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function HealthCard({ health }: { health: ReturnType<typeof financialHealth> }) {
  const color = health.level === 'healthy' ? 'var(--income)' : health.level === 'ontrack' ? 'var(--warning)' : 'var(--expense)'
  const label = health.level === 'healthy' ? 'Saludable' : health.level === 'ontrack' ? 'En camino' : health.level === 'improve' ? 'Por mejorar' : 'Sin datos suficientes'
  return (
    <Card>
      <CardHeader title="Salud financiera" subtitle="Reglas transparentes, sin cajas negras" />
      <CardBody className="pt-3">
        <div className="mb-4 flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-full" style={{ background: health.score === null ? 'var(--surface-2)' : `conic-gradient(${color} ${health.score * 3.6}deg, var(--surface-2) 0)` }} role="img" aria-label={`Puntaje ${health.score ?? 'no disponible'}`}>
            <div className="grid size-[68px] place-items-center rounded-full bg-surface"><span className="num text-2xl font-semibold">{health.score ?? '—'}</span></div>
          </div>
          <div><p className="flex items-center gap-1.5 font-medium" style={{ color: health.score === null ? undefined : color }}><ShieldCheck className="size-4" />{label}</p><p className="mt-1 text-xs text-muted">{health.note}</p></div>
        </div>
        <ul className="space-y-3">
          {health.components.map((c) => (
            <li key={c.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{c.label}</span><span className="num text-xs text-muted">{c.value}</span></div>
              <Progress value={(c.score ?? 0) / 100} color={c.score === null ? 'transparent' : c.score >= 75 ? 'var(--income)' : c.score >= 50 ? 'var(--warning)' : 'var(--expense)'} label={c.label} />
              <p className="mt-1 text-[11px] leading-4 text-muted">{c.rule}{c.score !== null && ` · ${Math.round(c.score)} pts`}</p>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

function Simulator() {
  const { data, today } = useApp()
  const cats = data.categories.filter((c) => c.kind === 'expense' && !c.archivedAt)
  const [cat, setCat] = React.useState(cats.find((c) => !c.essential)?.id ?? cats[0]?.id ?? '')
  const [pct, setPct] = React.useState(15)
  const sim = React.useMemo(() => (cat ? simulateReduction(data, cat, pct, today) : null), [data, cat, pct, today])
  return (
    <Card>
      <CardHeader title="Simulador de ahorro" subtitle="¿Cuánto ahorraría si reduzco este gasto?" />
      <CardBody className="space-y-3 pt-3">
        <Field label="Categoría"><Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría a reducir">{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div>
          <label className="mb-1.5 flex justify-between text-xs font-medium text-muted" htmlFor="sim-pct"><span>Reducción</span><span className="num text-foreground">{pct}%</span></label>
          <input id="sim-pct" type="range" min={5} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
        </div>
        {sim ? (
          <div className="rounded-lg bg-surface-2/60 p-3 text-sm">
            <p>Ahorro mensual: <strong className="num text-income">{formatMoney(sim.monthlySaving)}</strong></p>
            <p>Ahorro anual: <strong className="num text-income">{formatMoney(sim.annualSaving)}</strong></p>
            <p className="mt-2 text-xs text-muted">Base: promedio de {formatMoney(sim.avgMonthly)} al mes en {sim.monthsUsed.length} mes{sim.monthsUsed.length === 1 ? '' : 'es'} completo{sim.monthsUsed.length === 1 ? '' : 's'} ({sim.monthsUsed.join(', ')}).{sim.currentSavingsRate !== null && sim.newSavingsRate !== null && ` Tu tasa de ahorro pasaría de ${(sim.currentSavingsRate * 100).toFixed(1).replace('.', ',')}% a ${(sim.newSavingsRate * 100).toFixed(1).replace('.', ',')}%.`}</p>
          </div>
        ) : <p className="rounded-lg bg-surface-2/60 p-3 text-xs text-muted">No hay gasto histórico en meses completos para esa categoría, así que no se puede simular sin inventar datos.</p>}
      </CardBody>
    </Card>
  )
}
