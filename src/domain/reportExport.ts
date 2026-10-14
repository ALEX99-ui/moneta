import { toCsv, type Delimiter } from './csv'
import { formatMoney } from './money'
import { formatDate, type DateFormat } from './dates'
import type { Cell, ColKind, ReportModel } from './reports'

/** Texto de una celda tal como se muestra en pantalla y PDF. */
export function displayCell(v: Cell, kind: ColKind, df: DateFormat = 'dd/MM/yyyy'): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return kind === 'date' ? formatDate(v, df) : v
  switch (kind) {
    case 'money': return formatMoney(v)
    case 'percent': return `${(v * 100).toFixed(1).replace('.', ',')}%`
    case 'int': return String(v)
    default: return String(v)
  }
}

/** CSV con valores crudos (pesos enteros y fracciones), listo para analizar en una hoja de cálculo. */
export function reportToCsv(r: ReportModel, delim: Delimiter = ';'): string {
  const rows: (string | number | null)[][] = [[r.title], [r.subtitle], []]
  for (const k of r.kpis) rows.push([k.label, k.value])
  for (const s of r.sections) {
    rows.push([], [s.title], s.columns.map((c) => c.label))
    for (const row of s.rows) rows.push(row.map((c) => (c === null ? '' : c)))
    if (s.totals) rows.push(s.totals.map((c) => (c === null ? '' : c)))
  }
  if (r.notes.length) rows.push([], ...r.notes.map((n) => [n]))
  return toCsv(rows, delim)
}

/** PDF generado localmente (jsPDF + autoTable). Devuelve los bytes del archivo. */
export async function reportToPdf(r: ReportModel, df: DateFormat, profile: string): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold').setFontSize(18).text(r.title, margin, 54)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(100).text(r.subtitle, margin, 72)
  doc.text(`MONETA · ${profile} · generado el ${formatDate(new Date().toISOString().slice(0, 10), df)}`, margin, 86)
  doc.setTextColor(0)
  let y = 104
  if (r.kpis.length) {
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin }, theme: 'grid',
      head: [r.kpis.map((k) => k.label)], body: [r.kpis.map((k) => displayCell(k.value, k.kind, df))],
      styles: { fontSize: 9, halign: 'center' }, headStyles: { fillColor: [79, 70, 229] },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18
  }
  for (const s of r.sections) {
    if (!s.rows.length && !s.totals) continue
    doc.setFont('helvetica', 'bold').setFontSize(12).text(s.title, margin, y + 8)
    autoTable(doc, {
      startY: y + 16, margin: { left: margin, right: margin }, theme: 'striped',
      head: [s.columns.map((c) => c.label)],
      body: s.rows.map((row) => row.map((c, i) => displayCell(c, s.columns[i]!.kind, df))),
      foot: s.totals ? [s.totals.map((c, i) => displayCell(c, s.columns[i]!.kind, df))] : undefined,
      styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [235, 236, 250], textColor: 20, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, { halign: c.kind === 'text' || c.kind === 'date' ? 'left' : 'right' }])),
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18
  }
  if (r.notes.length) {
    doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(90)
    const lines = doc.splitTextToSize(r.notes.join('\n'), pageW - margin * 2)
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage()
      y = 54
    }
    doc.text(lines, margin, y)
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFont('helvetica', 'normal').setFontSize(8).setTextColor(130)
    doc.text(`Página ${i} de ${pages}`, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
