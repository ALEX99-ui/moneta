import type { Db, Stmt } from '@/db/types'
import { DomainError } from '@/db/types'
import { todayISO, type ISODate } from '@/domain/dates'
import type { ZodType } from 'zod'

export interface ServiceContext {
  db: Db
  /** Fecha local de hoy (inyectable para pruebas). */
  today(): ISODate
  /** Marca de tiempo ISO. */
  now(): string
  newId(): string
}

export function defaultContext(db: Db, clock: () => Date = () => new Date()): ServiceContext {
  return {
    db,
    today: () => todayISO(clock),
    now: () => clock().toISOString(),
    newId: () => crypto.randomUUID(),
  }
}

/** Valida con zod y lanza un DomainError con el primer mensaje legible. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw new DomainError(issue?.message ?? 'Datos inválidos')
  }
  return r.data
}

export async function one<T = Record<string, any>>(ctx: ServiceContext, sql: string, params: (string | number | null)[] = []): Promise<T | null> {
  const rows = await ctx.db.select<T>(sql, params)
  return rows[0] ?? null
}

export function tagStatements(ctx: ServiceContext, txId: string, tags: readonly string[]): Stmt[] {
  const stmts: Stmt[] = [{ sql: 'DELETE FROM transaction_tags WHERE transaction_id = ?', params: [txId] }]
  const seen = new Set<string>()
  for (const raw of tags) {
    const name = raw.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    stmts.push({ sql: 'INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)', params: [ctx.newId(), name] })
    stmts.push({
      sql: 'INSERT INTO transaction_tags (transaction_id, tag_id) SELECT ?, id FROM tags WHERE lower(name) = lower(?)',
      params: [txId, name],
    })
  }
  return stmts
}
