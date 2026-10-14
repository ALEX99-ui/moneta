import { invoke } from '@tauri-apps/api/core'
import type { Db, Row, SqlParam, Stmt } from './types'

/** Implementación de producción: todos los accesos pasan por los comandos Rust (SQLite local). */
export const tauriDb: Db = {
  async select<T = Row>(sql: string, params: SqlParam[] = []) {
    return (await invoke<T[]>('db_select', { sql, params })) as T[]
  },
  async execute(sql: string, params: SqlParam[] = []) {
    return await invoke<{ changes: number }>('db_execute', { sql, params })
  },
  async batch(stmts: Stmt[]) {
    await invoke('db_batch', { statements: stmts.map((s) => ({ sql: s.sql, params: s.params ?? [] })) })
  },
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
