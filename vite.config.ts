import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { devDbBridge } from './dev-db-bridge.ts'

// Vite sirve la UI. En desarrollo en navegador (sin Tauri) un puente de SOLO desarrollo
// expone la misma API de base de datos usando node:sqlite y las mismas migraciones.
export default defineConfig({
  plugins: [react(), tailwindcss(), devDbBridge()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    pool: 'forks',
  },
})
