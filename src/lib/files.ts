import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/db/tauriDb'

export interface FileFilter { name: string; extensions: string[] }

/** Guardar archivos: diálogo nativo en la app de escritorio; descarga del navegador en desarrollo. */
export async function saveTextFile(defaultName: string, contents: string, filters: FileFilter[]): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: defaultName, filters })
    if (!path) return null
    await invoke('write_text_file', { path, contents })
    return path
  }
  download(new Blob([contents], { type: 'text/plain;charset=utf-8' }), defaultName)
  return defaultName
}

export async function saveBinaryFile(defaultName: string, bytes: Uint8Array, filters: FileFilter[]): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: defaultName, filters })
    if (!path) return null
    await invoke('write_binary_file', { path, data: Array.from(bytes) })
    return path
  }
  download(new Blob([bytes as BlobPart]), defaultName)
  return defaultName
}

export async function pickSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null> {
  if (!isTauri()) return null
  const { save } = await import('@tauri-apps/plugin-dialog')
  return (await save({ defaultPath: defaultName, filters })) ?? null
}

export async function pickOpenPath(filters: FileFilter[]): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const r = await open({ multiple: false, directory: false, filters })
  return typeof r === 'string' ? r : null
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const r = await open({ multiple: false, directory: true })
  return typeof r === 'string' ? r : null
}

/** Lee un archivo de texto elegido por el usuario (diálogo nativo o <input type=file> en el navegador). */
export async function pickTextFile(filters: FileFilter[]): Promise<{ name: string; text: string } | null> {
  if (isTauri()) {
    const path = await pickOpenPath(filters)
    if (!path) return null
    const text = await invoke<string>('read_text_file', { path })
    return { name: path.split(/[\\/]/).pop() ?? path, text }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, text: await f.text() } : null)
    }
    input.click()
  })
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
