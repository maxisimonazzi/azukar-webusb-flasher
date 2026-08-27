/**
 * Abrir una carpeta del disco como proyecto y guardar ahí mismo, con la File
 * System Access API (Chrome/Edge, que ya es el piso por WebUSB). Sin servidor:
 * el navegador pide permiso una vez y escribe donde diga el usuario.
 *
 * Los tipos van a mano, como en `webusb.d.ts`: no todas las versiones de
 * TypeScript traen `showDirectoryPicker`.
 */

export type FsFileHandle = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: string | BufferSource | Blob): Promise<void>
    close(): Promise<void>
  }>
}

export type FsDirectoryHandle = {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<FsFileHandle | FsDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

type PickerWindow = {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    id?: string
  }) => Promise<FsDirectoryHandle>
}

export type FolderFile = { name: string; content: string }

export const MAX_FOLDER_FILES = 100
export const MAX_FOLDER_FILE_BYTES = 400_000

export function hasFsAccess(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function'
}

/** `null` cuando el usuario cancela el diálogo: no es un error. */
export async function pickProjectFolder(): Promise<FsDirectoryHandle | null> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker
  if (!picker) throw new Error('FS_UNSUPPORTED')
  try {
    return await picker({ mode: 'readwrite', id: 'lattice-project' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort/i.test(msg) || (err as { name?: string })?.name === 'AbortError') return null
    throw err
  }
}

function isFileHandle(handle: FsFileHandle | FsDirectoryHandle): handle is FsFileHandle {
  return handle.kind === 'file'
}

/**
 * Lee la carpeta (plana, sin subdirectorios: el proyecto de la app también es
 * plano). `normalize` decide el nombre con el que entra cada archivo, o `null`
 * para dejarlo afuera.
 */
export async function readFolderFiles(
  dir: FsDirectoryHandle,
  normalize: (name: string) => string | null,
): Promise<FolderFile[]> {
  const out: FolderFile[] = []
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FOLDER_FILES) break
    if (!isFileHandle(entry)) continue
    const name = normalize(entry.name)
    if (!name) continue
    const file = await entry.getFile()
    if (file.size > MAX_FOLDER_FILE_BYTES) continue
    out.push({ name, content: await file.text() })
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}

export async function ensureWritePermission(dir: FsDirectoryHandle): Promise<boolean> {
  const query = dir.queryPermission?.bind(dir)
  const request = dir.requestPermission?.bind(dir)
  if (!query || !request) return true
  if ((await query({ mode: 'readwrite' })) === 'granted') return true
  return (await request({ mode: 'readwrite' })) === 'granted'
}

export async function writeFolderFiles(
  dir: FsDirectoryHandle,
  files: FolderFile[],
): Promise<number> {
  let written = 0
  for (const file of files) {
    const handle = await dir.getFileHandle(file.name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(file.content)
    await writable.close()
    written += 1
  }
  return written
}
