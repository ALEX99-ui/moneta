/**
 * Implementación de `Db` sobre node:sqlite. SOLO para pruebas automatizadas y el puente de desarrollo.
 * Aplica las MISMAS migraciones SQL (db/migrations) que usa la app de producción en Rust.
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db, Row, SqlParam, Stmt } from './types'

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations')

const ALLOWED = /^\s*(select|insert|update|delete|with|replace)\b/i

function check(sql: string) {
  if (!ALLOWED.test(sql)) throw new Error('Sentencia SQL no permitida')
}

function bind(params: SqlParam[] = []) {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p))
}

export function migrate(raw: DatabaseSync) {
  raw.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;`)
  const cur = (raw.prepare('SELECT COALESCE(MAX(version),0) v FROM schema_migrations').get() as { v: number }).v
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const version = Number(f.slice(0, 4))
    if (version <= cur) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    raw.exec('BEGIN IMMEDIATE')
    try {
      raw.exec(sql)
      raw.prepare("INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(version, f)
      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }
  }
}

export interface NodeDb extends Db {
  raw: DatabaseSync
  close(): void
}

export function createNodeDb(file = ':memory:'): NodeDb {
  const raw = new DatabaseSync(file)
  raw.exec('PRAGMA foreign_keys = ON')
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL')
  migrate(raw)
  return {
    raw,
    close: () => raw.close(),
    async select<T = Row>(sql: string, params: SqlParam[] = []) {
      check(sql)
      return raw.prepare(sql).all(...bind(params)) as unknown as T[]
    },
    async execute(sql, params = []) {
      check(sql)
      const r = raw.prepare(sql).run(...bind(params))
      return { changes: Number(r.changes) }
    },
    async batch(stmts: Stmt[]) {
      raw.exec('BEGIN')
      try {
        for (const s of stmts) {
          check(s.sql)
          raw.prepare(s.sql).run(...bind(s.params))
        }
        raw.exec('COMMIT')
      } catch (e) {
        raw.exec('ROLLBACK')
        throw e
      }
    },
  }
}
