export type FpgaFile = { name: string; content: string; open: boolean }

export const FPGA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*\.v$/
export const FPGA_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
export const DEFAULT_ALLOWED_IMPORT_EXTENSIONS = ['v', 'pcf', 'txt']

export function getAllowedImportExtensions(): string[] {
  const envVal =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_ALLOWED_IMPORT_EXTENSIONS
      : undefined
  if (typeof envVal === 'string' && envVal.trim()) {
    const list = envVal
      .split(/[,;\s]+/)
      .map((ext) => ext.replace(/^\.+/, '').trim().toLowerCase())
      .filter(Boolean)
    if (list.length > 0) return Array.from(new Set(list))
  }
  return [...DEFAULT_ALLOWED_IMPORT_EXTENSIONS]
}

export function isFpgaFilename(name: string): boolean {
  return FPGA_NAME_RE.test(name)
}

export function isAllowedFilename(
  name: string,
  allowedExts: string[] = getAllowedImportExtensions(),
): boolean {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return false
  const stem = name.slice(0, dotIndex)
  const ext = name.slice(dotIndex + 1).toLowerCase()
  if (!ext || !allowedExts.includes(ext)) return false
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(stem)
}

export function normalizeFpgaFilename(
  raw: string,
  _allowedExts: string[] = getAllowedImportExtensions(),
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) return null

  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex > 0) {
    const stem = trimmed.slice(0, dotIndex)
    const ext = trimmed.slice(dotIndex + 1).toLowerCase()
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(stem)) return null
    if (!/^[A-Za-z0-9]+$/.test(ext)) return null
    return `${stem}.${ext}`
  }

  // If no extension is specified, add .v by default
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(trimmed)) {
    return `${trimmed}.v`
  }
  return null
}

export function binDownloadName(top: string): string {
  const stem = top.trim()
  if (FPGA_IDENT_RE.test(stem)) return `${stem}.bin`
  return 'top_module.bin'
}

export function projectZipDownloadName(name: string): string {
  const trimmed = name.trim()
  const stem = trimmed.replace(/\.zip$/i, '').trim()
  if (FPGA_IDENT_RE.test(stem)) return `${stem}.zip`
  if (/^[A-Za-z0-9_.-]+$/.test(stem)) return `${stem}.zip`
  return 'top_module.zip'
}

export function nextFpgaFilename(existing: string[]): string {
  const set = new Set(existing)
  for (let i = 1; i < 100; i += 1) {
    const name = i === 1 ? 'mod.v' : `mod${i}.v`
    if (!set.has(name)) return name
  }
  return `mod${Date.now()}.v`
}

export function visibleFpgaTabs(files: FpgaFile[]): FpgaFile[] {
  return files.filter((f) => f.open)
}

export function closeFpgaTab(files: FpgaFile[], name: string): FpgaFile[] {
  return files.map((f) => (f.name === name ? { ...f, open: false } : f))
}

export function openFpgaTab(files: FpgaFile[], name: string): FpgaFile[] {
  return files.map((f) => (f.name === name ? { ...f, open: true } : f))
}

export function deleteFpgaFile(files: FpgaFile[], name: string): FpgaFile[] {
  if (files.length <= 1) return files
  if (!files.some((f) => f.name === name)) return files
  return files.filter((f) => f.name !== name)
}

export function addFpgaFile(files: FpgaFile[], content = ''): FpgaFile[] {
  const name = nextFpgaFilename(files.map((f) => f.name))
  return [...files, { name, content, open: true }]
}

export function renameFpgaFile(
  files: FpgaFile[],
  from: string,
  rawTo: string,
  allowedExts: string[] = getAllowedImportExtensions(),
): FpgaFile[] {
  const to = normalizeFpgaFilename(rawTo, allowedExts)
  if (!to || to === from) return files
  if (!files.some((f) => f.name === from)) return files
  if (files.some((f) => f.name === to)) return files
  return files.map((f) => (f.name === from ? { ...f, name: to } : f))
}

/** Basename only; skip junk and non-allowed extensions. */
export function zipPathToVerilogName(
  path: string,
  allowedExts: string[] = getAllowedImportExtensions(),
): string | null {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  const base = parts.length ? parts[parts.length - 1] : ''
  if (!base) return null
  if (parts.some((p: string) => p === '__MACOSX' || p.startsWith('.'))) return null
  if (!isAllowedFilename(base, allowedExts)) return null
  return base
}

export function uniquifyFpgaName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const dotIndex = name.lastIndexOf('.')
  const stem = dotIndex >= 0 ? name.slice(0, dotIndex) : name
  const ext = dotIndex >= 0 ? name.slice(dotIndex) : ''
  for (let i = 2; i < 100; i += 1) {
    const next = `${stem}_${i}${ext}`
    if (!taken.has(next)) return next
  }
  return `${stem}_${Date.now()}${ext}`
}
