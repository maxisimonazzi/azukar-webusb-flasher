export type FpgaFile = { name: string; content: string; open: boolean }

export const FPGA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*\.v$/
export const FPGA_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isFpgaFilename(name: string): boolean {
  return FPGA_NAME_RE.test(name)
}

export function normalizeFpgaFilename(raw: string): string | null {
  const trimmed = raw.trim()
  const withV = trimmed.toLowerCase().endsWith('.v') ? trimmed : `${trimmed}.v`
  return isFpgaFilename(withV) ? withV : null
}

export function binDownloadName(top: string): string {
  const stem = top.trim()
  if (FPGA_IDENT_RE.test(stem)) return `${stem}.bin`
  return 'top_module.bin'
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
): FpgaFile[] {
  const to = normalizeFpgaFilename(rawTo)
  if (!to || to === from) return files
  if (!files.some((f) => f.name === from)) return files
  if (files.some((f) => f.name === to)) return files
  return files.map((f) => (f.name === from ? { ...f, name: to } : f))
}

/** Basename only; skip junk and non-.v. */
export function zipPathToVerilogName(path: string): string | null {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  const base = parts.length ? parts[parts.length - 1] : ''
  if (parts.some((p: string) => p === '__MACOSX' || p.startsWith('.'))) return null
  if (!isFpgaFilename(base)) return null
  return base
}

export function uniquifyFpgaName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const stem = name.slice(0, -2)
  for (let i = 2; i < 100; i += 1) {
    const next = `${stem}_${i}.v`
    if (!taken.has(next) && isFpgaFilename(next)) return next
  }
  return `mod${Date.now()}.v`
}
