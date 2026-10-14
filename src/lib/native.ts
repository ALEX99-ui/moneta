import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/db/tauriDb'

/** Puente con las funciones nativas (respaldos y archivos). Solo existe dentro de la app de escritorio. */

export interface AppStatus {
  ready: boolean
  error: string | null
  version: string
  data_dir: string
  db_path: string
  default_backup_dir: string
  schema_version: number
  health: string[]
}
export interface VerifyReport { ok: boolean; errors: string[]; schema_version: number; app_schema_version: number; counts: Record<string, number> }
export interface BackupInfo { path: string; size_bytes: number; counts: Record<string, number> }
export interface RestoreReport { pre_restore_backup: string; counts: Record<string, number> }

export const hasNative = isTauri

export const native = {
  status: () => invoke<AppStatus>('app_status'),
  backupCreate: (dest: string) => invoke<BackupInfo>('backup_create', { dest }),
  backupVerify: (path: string) => invoke<VerifyReport>('backup_verify', { path }),
  backupRestore: (path: string) => invoke<RestoreReport>('backup_restore', { path }),
  backupAuto: (dir: string | null, keep: number, intervalHours: number) => invoke<BackupInfo | null>('backup_auto', { dir, keep, intervalHours }),
}
