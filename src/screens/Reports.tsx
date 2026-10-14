import * as React from 'react'
import { Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/app/DataProvider'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeriodPicker, StatCard, monthLabel } from '@/components/common'
import { BalanceChart, CategoryDonut, ComparisonChart, IncomeExpenseChart, SavingsTrendChart, useMonthSeries, type MonthDatum } from '@/components/charts'
import { monthKeyOf, monthRange, previousRange, resolvePeriod, type PeriodSelection } from '@/domain/dates'
import { totalsByCategory, lastMonths, monthlySeries } from '@/domain/ledger'
import { annualReport, cashFlowReport, categoryReport, comparisonReport, monthEndBalances, monthlyReport, trendReport, type ReportModel, type Section } from '@/domain/reports'
import { displayCell, reportToCsv, reportToPdf } from '@/domain/reportExport'
import { saveBinaryFile, saveTextFile } from '@/lib/files'
import { cn } from '@/lib/utils'
import { addMonthKey } from '@/domain/dates'

type Tab = 'mensual' | 'anual' | 'categorias' | 'comparacion' | 'tendencias' | 'flujo'
const TABS: { id: Tab; label: string }[] = [
  { id: 'mensual', label: 'Informe mensual' }, { id: 'anual', label: 'Informe anual' }, { id: 'categorias', label: 'Gastos por categoría' },
  { id: 'comparacion', label: 'Comparación de períodos' }, { id: 'tendencias', label: 'Tendencias y ahorro' }, { id: 'flujo', label: 'Flujo de efectivo' },
]

export function ReportsScreen() {
  const { data, today } = useApp()
  const sd = data.settings.monthStartDay
  const [tab, setTab] = React.useState<Tab>('mensual')
  const [month, setMonth] = React.useState<PeriodSelection>({ mode: 'month', month: monthKeyOf(today, sd) })
  const [year, setYear] = React.useState<PeriodSelection>({ mode: 'year', year: Number(today.slice(0, 4)) })
  const [range, setRange] = React.useState<PeriodSelection>({ mode: 'month', month: monthKeyOf(today, sd) })
  const [compareTo, setCompareTo] = React.useState<'prev' | 'yearago'>('prev')
  const [accountId, setAccountId] = React.useState('')

  const model: ReportModel = React.useMemo(() => {
    if (tab === 'mensual') return monthlyReport(data, month.mode === 'month' ? month.month : monthKeyOf(today, sd), today)
    if (tab === 'anual') return annualReport(data, year.mode === 'year' ? year.year : Number(today.slice(0, 4)), today)
    const r = resolvePeriod(range, sd)
    if (tab === 'categorias') return categoryReport(data, r)
    if (tab === 'comparacion') {
      let b = previousRange(r)
      if (compareTo === 'yearago' && range.mode === 'month') b = monthRange(`${Number(range.month.slice(0, 4)) - 1}${range.month.slice(4)}`, sd)
      else if (compareTo === 'yearago') b = { from: `${Number(r.from.slice(0, 4)) - 1}${r.from.slice(4)}`, to: `${Number(r.to.slice(0, 4)) - 1}${r.to.slice(4)}` }
      else if (range.mode === 'month') b = monthRange(addMonthKey(range.month, -1), sd)
      return comparisonReport(data, r, b)
    }
    if (tab === 'tendencias') return trendReport(data, range.mode === 'month' ? range.month : monthKeyOf(range.mode === 'custom' ? range.to : today, sd), 12)
    return cashFlowReport(data, r, accountId ? [accountId] : [])
  }, [tab, data, month, year, range, compareTo, accountId, today, sd])

  const exportCsv = async () => {
    const p = await saveTextFile(`moneta-${model.id}-${today}.csv`, reportToCsv(model), [{ name: 'CSV', extensions: ['csv'] }])
    if (p) toast.success('Reporte exportado a CSV', { description: p })
  }
  const exportPdf = async () => {
    try {
      const bytes = await reportToPdf(model, data.settings.dateFormat, data.settings.profileName)
      const p = await saveBinaryFile(`moneta-${model.id}-${today}.pdf`, bytes, [{ name: 'PDF', extensions: ['pdf'] }])
      if (p) toast.success('Reporte exportado a PDF', { description: p })
    } catch (e) {
      toast.error(`No se pudo crear el PDF: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Informes calculados con tus movimientos reales; el CSV y el PDF contienen exactamente estas cifras."
        actions={<><Button variant="outline" onClick={exportCsv}><Download /> CSV</Button><Button onClick={exportPdf}><FileText /> PDF</Button></>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">{TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {tab === 'mensual' && <PeriodPicker value={month} onChange={setMonth} modes={['month']} />}
        {tab === 'anual' && <PeriodPicker value={year} onChange={setYear} modes={['year']} />}
        {(tab === 'categorias' || tab === 'comparacion' || tab === 'flujo') && <PeriodPicker value={range} onChange={setRange} modes={tab === 'flujo' ? ['month', 'year', 'custom', 'all'] : ['month', 'year', 'custom']} />}
        {tab === 'tendencias' && <PeriodPicker value={range.mode === 'month' ? range : { mode: 'month', month: monthKeyOf(today, sd) }} onChange={setRange} modes={['month']} />}
        {tab === 'comparacion' && (
          <Select className="w-52" value={compareTo} onChange={(e) => setCompareTo(e.target.value as 'prev' | 'yearago')} aria-label="Comparar con">
            <option value="prev">Comparar con el período anterior</option><option value="yearago">Comparar con el mismo período del año pasado</option>
          </Select>
        )}
        {tab === 'flujo' && (
          <div className="w-52"><Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Filtrar por cuenta"><option value="">Todas las cuentas</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {model.kpis.map((k, i) => (
          <StatCard key={k.label} title={k.label} value={displayCell(k.value, k.kind, data.settings.dateFormat)} icon={<span className="text-xs font-bold">{i + 1}</span>} tone={k.label.startsWith('Ingreso') ? 'income' : k.label.startsWith('Gasto') ? 'expense' : 'primary'} delay={i * 30}
            valueClassName={typeof k.value === 'number' && k.kind === 'money' && k.value < 0 && !k.label.startsWith('Gasto') ? 'text-expense' : undefined} />
        ))}
      </div>

      <ReportCharts tab={tab} model={model} range={range} year={year} />

      <div className="mt-4 space-y-4">
        {model.sections.map((s) => <SectionTable key={s.title} section={s} df={data.settings.dateFormat} />)}
        {model.notes.length > 0 && <ul className="space-y-1 rounded-lg bg-surface-2/50 px-4 py-3 text-xs text-muted">{model.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
      </div>
    </div>
  )
}

function ReportCharts({ tab, model, range, year }: { tab: Tab; model: ReportModel; range: PeriodSelection; year: PeriodSelection }) {
  const { data, today } = useApp()
  const sd = data.settings.monthStartDay
  const endMonth = range.mode === 'month' ? range.month : monthKeyOf(today, sd)
  const series12 = useMonthSeries(endMonth, 12)
  const yearSeries: MonthDatum[] = React.useMemo(() => {
    const y = year.mode === 'year' ? year.year : Number(today.slice(0, 4))
    return monthlySeries(data.transactions, Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`), sd).map((p) => ({ month: p.month, label: monthLabel(p.month, false), income: p.income, expense: p.expense, net: p.net, rate: p.savingsRate }))
  }, [data.transactions, year, today, sd])
  const r = resolvePeriod(range, sd)
  const cats = React.useMemo(() => totalsByCategory(data.transactions, r, 'expense'), [data.transactions, r.from, r.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = cats.reduce((s, c) => s + c.amount, 0)
  const balance = React.useMemo(() => monthEndBalances(data, lastMonths(endMonth, 12).filter((m) => monthRange(m, sd).from <= today)).map((p) => ({ date: p.date, label: p.date.slice(0, 7), balance: p.balance })), [data, endMonth, today, sd])
  if (tab === 'anual') return <Card><CardHeader title="Ingresos y gastos por mes" /><CardBody><IncomeExpenseChart series={yearSeries} /></CardBody></Card>
  if (tab === 'categorias') return <Card><CardHeader title="Distribución del gasto" /><CardBody>{cats.length ? <CategoryDonut items={cats} total={total} maxItems={8} /> : <p className="py-10 text-center text-sm text-muted">No hay gastos en el período.</p>}</CardBody></Card>
  if (tab === 'tendencias') return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title="Tendencia de ingresos y gastos" subtitle="Últimos 12 meses" /><CardBody><IncomeExpenseChart series={series12} /></CardBody></Card>
      <Card><CardHeader title="Evolución del ahorro" subtitle="Ahorro neto mensual" /><CardBody><SavingsTrendChart series={series12} /></CardBody></Card>
      <Card className="lg:col-span-2"><CardHeader title="Dinero total al cierre de cada mes" /><CardBody><BalanceChart points={balance} /></CardBody></Card>
    </div>
  )
  if (tab === 'comparacion') {
    const sections = model.sections[1]?.rows.slice(0, 8) ?? []
    return (
      <Card><CardHeader title="Mayores cambios por categoría" subtitle="Período A (actual) frente al B" />
        <CardBody>
          <ComparisonChart currentLabel="Período A" previousLabel="Período B" rows={sections.map((row) => ({ name: String(row[0]), actual: Number(row[1]), anterior: Number(row[2]), color: 'var(--primary)' }))} />
          {sections.length === 0 && <p className="py-6 text-center text-sm text-muted">No hay gastos para comparar.</p>}
        </CardBody>
      </Card>
    )
  }
  return null
}

function SectionTable({ section, df }: { section: Section; df: Parameters<typeof displayCell>[2] }) {
  if (!section.rows.length && !section.totals) return null
  return (
    <Card className="overflow-hidden">
      <CardHeader title={section.title} subtitle={section.note} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-y text-xs text-muted">{section.columns.map((c, i) => <th key={i} className={cn('px-4 py-2 font-medium', c.kind === 'text' || c.kind === 'date' ? 'text-left' : 'text-right')}>{c.label}</th>)}</tr></thead>
          <tbody>
            {section.rows.length === 0 && <tr><td colSpan={section.columns.length} className="px-4 py-6 text-center text-muted">Sin datos en este período.</td></tr>}
            {section.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-surface-2/40">
                {row.map((c, i) => <td key={i} className={cn('px-4 py-2', section.columns[i]!.kind === 'text' || section.columns[i]!.kind === 'date' ? 'text-left' : 'num text-right', typeof c === 'number' && section.columns[i]!.kind === 'money' && c < 0 && 'text-expense')}>{displayCell(c, section.columns[i]!.kind, df)}</td>)}
              </tr>
            ))}
          </tbody>
          {section.totals && <tfoot><tr className="border-t bg-surface-2/60 font-semibold">{section.totals.map((c, i) => <td key={i} className={cn('px-4 py-2.5', section.columns[i]!.kind === 'text' || section.columns[i]!.kind === 'date' ? 'text-left' : 'num text-right')}>{displayCell(c, section.columns[i]!.kind, df)}</td>)}</tr></tfoot>}
        </table>
      </div>
    </Card>
  )
}
