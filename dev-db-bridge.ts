/**
 * Puente SOLO PARA DESARROLLO: durante `vite dev` en un navegador normal (sin Tauri) expone la API de base
 * de datos sobre HTTP local, respaldada por node:sqlite con las mismas migraciones. No forma parte del build.
 */
import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

export function devDbBridge(): Plugin {
  return {
    name: 'moneta-dev-db-bridge',
    apply: (_config, env) => env.command === 'serve' && !process.env.VITEST,
    async configureServer(server) {
      const file = process.env.MONETA_DEV_DB ?? path.resolve(process.cwd(), '.dev-data/dev.db')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const { createNodeDb } = await server.ssrLoadModule('/src/db/nodeSqliteDb.ts')
      const db = createNodeDb(file)
      server.middlewares.use('/__db', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          const op = (req.url ?? '').replace(/^\//, '')
          try {
            const input = JSON.parse(body || '{}')
            let result: unknown
            if (op === 'select') result = await db.select(input.sql, input.params)
            else if (op === 'execute') result = await db.execute(input.sql, input.params)
            else if (op === 'batch') result = await db.batch(input.statements)
            else throw new Error(`Operación desconocida: ${op}`)
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, result }))
          } catch (e) {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
          }
        })
      })
    },
  }
}
