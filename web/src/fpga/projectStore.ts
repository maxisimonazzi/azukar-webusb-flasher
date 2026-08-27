/**
 * Los proyectos del usuario en `localStorage`. No hay servidor: si no queda
 * acá, se pierde al recargar.
 *
 * Claves:
 *   lattice.projects           índice `[{id, name, updatedAt}]`
 *   lattice.projectCurrent     id del proyecto abierto
 *   lattice.project.<id>       archivos, top y pestaña activa de ese proyecto
 *   lattice.project            versión vieja (un solo proyecto): se migra sola
 */

import { readLocal, removeLocal, writeLocal } from '../lib/storage.ts'
import { isAllowedFilename, isFpgaFilename, type FpgaFile } from './files.ts'

/** Clave de la versión de un solo proyecto. Se lee una vez y se migra. */
export const PROJECT_KEY = 'project'
export const PROJECT_INDEX_KEY = 'projects'
export const PROJECT_CURRENT_KEY = 'projectCurrent'
export const PROJECT_PREFIX = 'project.'

/** Tope defensivo por proyecto: `localStorage` ronda los 5 MB por origen. */
export const MAX_PROJECT_CHARS = 1_000_000
export const MAX_PROJECT_FILES = 100
export const MAX_PROJECTS = 40
export const MAX_PROJECT_NAME = 40

export type StoredProject = {
  top: string
  activeName: string
  files: FpgaFile[]
}

export type ProjectMeta = {
  id: string
  name: string
  updatedAt: number
}

const ID_RE = /^p[0-9]{1,6}$/

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

function payloadKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`
}

// ---- Índice ---------------------------------------------------------------

export function sanitizeProjectName(raw: string, fallback = 'Proyecto'): string {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME)
  return clean || fallback
}

export function uniqueProjectName(name: string, taken: string[]): string {
  const base = sanitizeProjectName(name)
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let i = 2; i < 999; i += 1) {
    const next = sanitizeProjectName(`${base} ${i}`)
    if (!used.has(next)) return next
  }
  return sanitizeProjectName(`${base} ${taken.length + 1}`)
}

export function nextProjectName(existing: ProjectMeta[]): string {
  return uniqueProjectName(
    `Proyecto ${existing.length + 1}`,
    existing.map((p) => p.name),
  )
}

export function nextProjectId(existing: ProjectMeta[]): string {
  let max = 0
  for (const project of existing) {
    const n = Number(project.id.slice(1))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `p${max + 1}`
}

function parseMeta(raw: unknown): ProjectMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ProjectMeta>
  if (typeof data.id !== 'string' || !ID_RE.test(data.id)) return null
  if (typeof data.name !== 'string' || !data.name.trim()) return null
  return {
    id: data.id,
    name: sanitizeProjectName(data.name),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  }
}

export function loadProjectIndex(): ProjectMeta[] {
  const raw = readLocal(PROJECT_INDEX_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: ProjectMeta[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      const meta = parseMeta(item)
      if (!meta || seen.has(meta.id)) continue
      seen.add(meta.id)
      out.push(meta)
      if (out.length >= MAX_PROJECTS) break
    }
    return out
  } catch {
    return []
  }
}

export function saveProjectIndex(list: ProjectMeta[]): void {
  writeLocal(PROJECT_INDEX_KEY, JSON.stringify(list.slice(0, MAX_PROJECTS)))
}

export function loadCurrentProjectId(): string | null {
  const id = readLocal(PROJECT_CURRENT_KEY)
  return id && ID_RE.test(id) ? id : null
}

export function saveCurrentProjectId(id: string): void {
  if (!ID_RE.test(id)) return
  writeLocal(PROJECT_CURRENT_KEY, id)
}

// ---- Proyectos ------------------------------------------------------------

export function loadProjectById(id: string): StoredProject | null {
  if (!ID_RE.test(id)) return null
  const raw = readLocal(payloadKey(id))
  if (!raw) return null
  try {
    return parseProject(JSON.parse(raw))
  } catch {
    return null
  }
}

/** `false` si el proyecto no entra: el que llama avisa, no guardamos a medias. */
export function saveProjectById(id: string, project: StoredProject): boolean {
  if (!ID_RE.test(id)) return false
  const payload = JSON.stringify({
    top: project.top,
    activeName: project.activeName,
    files: project.files.map((f) => ({ name: f.name, content: f.content, open: f.open })),
  })
  if (payload.length > MAX_PROJECT_CHARS) return false
  writeLocal(payloadKey(id), payload)
  return true
}

export function deleteProjectById(id: string): ProjectMeta[] {
  removeLocal(payloadKey(id))
  const next = loadProjectIndex().filter((p) => p.id !== id)
  saveProjectIndex(next)
  if (loadCurrentProjectId() === id) {
    const first = next[0]
    if (first) saveCurrentProjectId(first.id)
    else removeLocal(PROJECT_CURRENT_KEY)
  }
  return next
}

/** Crea la entrada del índice. El contenido lo escribe el primer guardado. */
export function createProject(name?: string, at = 0): ProjectMeta {
  const index = loadProjectIndex()
  const meta: ProjectMeta = {
    id: nextProjectId(index),
    name: name
      ? uniqueProjectName(
          name,
          index.map((p) => p.name),
        )
      : nextProjectName(index),
    updatedAt: at,
  }
  saveProjectIndex([...index, meta])
  return meta
}

export function renameProject(id: string, name: string): ProjectMeta[] {
  const index = loadProjectIndex()
  const others = index.filter((p) => p.id !== id).map((p) => p.name)
  const next = index.map((p) =>
    p.id === id ? { ...p, name: uniqueProjectName(name, others) } : p,
  )
  saveProjectIndex(next)
  return next
}

export function touchProject(id: string, at: number): ProjectMeta[] {
  const next = loadProjectIndex().map((p) => (p.id === id ? { ...p, updatedAt: at } : p))
  saveProjectIndex(next)
  return next
}

/**
 * La versión vieja guardaba un único proyecto en `lattice.project`. Se copia al
 * primer proyecto del índice y se borra la clave vieja.
 */
export function migrateLegacyProject(name = 'Mi proyecto'): ProjectMeta | null {
  const raw = readLocal(PROJECT_KEY)
  if (!raw) return null
  let project: StoredProject | null = null
  try {
    project = parseProject(JSON.parse(raw))
  } catch {
    project = null
  }
  removeLocal(PROJECT_KEY)
  if (!project) return null
  const meta = createProject(name)
  saveProjectById(meta.id, project)
  saveCurrentProjectId(meta.id)
  return meta
}

// ---- El proyecto abierto --------------------------------------------------

export function loadProject(): StoredProject | null {
  const id = loadCurrentProjectId()
  return id ? loadProjectById(id) : null
}

export function saveProject(project: StoredProject): boolean {
  const id = loadCurrentProjectId()
  return id ? saveProjectById(id, project) : false
}

/** Vacía el contenido del proyecto abierto, sin sacarlo del índice. */
export function clearProject(): void {
  const id = loadCurrentProjectId()
  if (id) removeLocal(payloadKey(id))
}
