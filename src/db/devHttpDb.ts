import type { Db, Row, SqlParam, Stmt } from './types'

/**
 * SOLO DESARROLLO EN NAVEGADOR (vite dev). Habla con el puente local `dev-db-bridge.ts`
 * que usa node:sqlite con las mismas migraciones. No se incluye en el build de producción.
 */
async function call<T>(op: string, body: unknown): Promise<T> {
  const res = await fetch(`/__db/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json()) as { ok: boolean; result?: T; error?: string }
  if (!json.ok) throw new Error(json.error ?? 'Error de base de datos')
  return json.result as T
}

export const devHttpDb: Db = {
  select: <T = Row>(sql: string, params: SqlParam[] = []) => call<T[]>('select', { sql, params }),
  execute: (sql, params = []) => call<{ changes: number }>('execute', { sql, params }),
  async batch(stmts: Stmt[]) {
    await call('batch', { statements: stmts })
  },
}
