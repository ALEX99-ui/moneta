export type SqlParam = string | number | boolean | null
export type Row = Record<string, string | number | null>

export interface Stmt {
  sql: string
  params?: SqlParam[]
}

/** Contrato de acceso a SQLite. Producción: comandos Tauri (Rust). Pruebas/desarrollo: node:sqlite. */
export interface Db {
  select<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>
  execute(sql: string, params?: SqlParam[]): Promise<{ changes: number }>
  /** Todas las sentencias en UNA transacción: o se aplican todas o ninguna. */
  batch(stmts: Stmt[]): Promise<void>
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Traduce errores de SQLite/Tauri a mensajes comprensibles. */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
  if (e instanceof DomainError) return raw
  if (/ux_tx_occurrence|transactions\.recurring_rule_id/i.test(raw)) return 'Este pago recurrente ya fue registrado para esa fecha.'
  if (/ux_accounts_name/i.test(raw)) return 'Ya existe una cuenta con ese nombre.'
  if (/ux_categories_name/i.test(raw)) return 'Ya existe una categoría con ese nombre.'
  if (/ux_subcategories_name/i.test(raw)) return 'Ya existe una subcategoría con ese nombre.'
  if (/ux_tags_name/i.test(raw)) return 'La etiqueta ya existe.'
  if (/UNIQUE constraint failed: (budgets)/i.test(raw)) return 'Ya existe un presupuesto para esa categoría y mes.'
  if (/UNIQUE constraint failed: \w+\.id|PRIMARY KEY/i.test(raw)) return 'Este registro ya se había guardado (se evitó un duplicado).'
  if (/FOREIGN KEY constraint failed/i.test(raw)) return 'La operación depende de datos que ya no existen o que están en uso.'
  if (/CHECK constraint failed/i.test(raw)) return 'Algún valor está fuera del rango permitido.'
  const abort = /(?:constraint failed|ABORT)[^:]*:\s*(.+)$/i.exec(raw)
  if (abort?.[1] && abort[1].includes(' ')) return abort[1]
  return raw
}

/** Envuelve un objeto de servicios para que todo error de base de datos llegue como DomainError legible. */
export function withFriendlyErrors<T extends object>(service: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(service)) {
    if (typeof v !== 'function') {
      out[k] = v
      continue
    }
    out[k] = async (...args: unknown[]) => {
      try {
        return await (v as (...a: unknown[]) => unknown).apply(out, args)
      } catch (e) {
        if (e instanceof DomainError) throw e
        throw new DomainError(friendlyError(e))
      }
    }
  }
  return out as T
}
