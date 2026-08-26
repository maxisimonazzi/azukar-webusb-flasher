/**
 * El proyecto del usuario (archivos, top y pestaña activa) en `localStorage`.
 * No hay servidor: si no queda acá, se pierde al recargar.
 */

import { readLocal, removeLocal, writeLocal } from '../lib/storage.ts'
import { isAllowedFilename, isFpgaFilename, type FpgaFile } from './files.ts'

export const PROJECT_KEY = 'project'

/** Tope defensivo: `localStorage` ronda los 5 MB por origen. */
export const MAX_PROJECT_CHARS = 1_000_000
export const MAX_PROJECT_FILES = 100

export type StoredProject = {
  top: string
  activeName: string
  files: FpgaFile[]
}

function validName(name: string): boolean {
  return isFpgaFilename(name) || isAllowedFilename(name)
}

function parseFile(raw: unknown, taken: Set<string>): FpgaFile | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<FpgaFile>
  if (typeof data.name !== 'string' || typeof data.content !== 'string') return null
  if (!validName(data.name) || taken.has(data.name)) return null
  return { name: data.name, content: data.content, open: data.open !== false }
}

export function parseProject(raw: unknown): StoredProject | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as { top?: unknown; activeName?: unknown; files?: unknown }
  if (!Array.isArray(data.files) || data.files.length === 0) return null
  if (data.files.length > MAX_PROJECT_FILES) return null

  const files: FpgaFile[] = []
  const taken = new Set<string>()
  let total = 0
  for (const item of data.files) {
    const file = parseFile(item, taken)
    if (!file) return null
    total += file.name.length + file.content.length
    if (total > MAX_PROJECT_CHARS) return null
    taken.add(file.name)
    files.push(file)
  }

  const top = typeof data.top === 'string' ? data.top : ''
  const wanted = typeof data.activeName === 'string' ? data.activeName : ''
  const open = files.filter((f) => f.open)
  const activeName = open.some((f) => f.name === wanted) ? wanted : (open[0]?.name ?? '')
  return { top, activeName, files }
}

export function loadProject(): StoredProject | null {
  const raw = readLocal(PROJECT_KEY)
  if (!raw) return null
  try {
    return parseProject(JSON.parse(raw))
  } catch {
    return null
  }
}

/** `false` si el proyecto no entra: el que llama avisa, no guardamos a medias. */
export function saveProject(project: StoredProject): boolean {
  const payload = JSON.stringify({
    top: project.top,
    activeName: project.activeName,
    files: project.files.map((f) => ({ name: f.name, content: f.content, open: f.open })),
  })
  if (payload.length > MAX_PROJECT_CHARS) return false
  writeLocal(PROJECT_KEY, payload)
  return true
}

export function clearProject(): void {
  removeLocal(PROJECT_KEY)
}
