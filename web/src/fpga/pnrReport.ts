/**
 * Los números que hoy pasan de largo en el log: celdas de Yosys, ocupación del
 * chip y Fmax de nextpnr. `out.pnr` (el `--report` de nextpnr) es JSON; el
 * `stat` de Yosys hay que leerlo del texto.
 */

export type Utilisation = {
  name: string
  used: number
  available: number
}

export type FmaxEntry = {
  clock: string
  achieved: number
  constraint: number
}

export type PnrReport = {
  utilisation: Utilisation[]
  fmax: FmaxEntry[]
  /** Suma de delays del peor camino, en ns. `null` si el reporte no lo trae. */
  criticalPathNs: number | null
}

export type CellCount = { name: string; count: number }

export type YosysStat = {
  module: string
  cells: CellCount[]
  totalCells: number
}

/** `CLK12$SB_IO_IN_$glb_clk` → `CLK12`. El nombre largo no le dice nada a nadie. */
export function prettyClockName(raw: string): string {
  const cut = raw.indexOf('$')
  const base = cut > 0 ? raw.slice(0, cut) : raw
  return base.replace(/^posedge /, '').trim() || raw
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readUtilisation(raw: unknown): Utilisation[] {
  if (!raw || typeof raw !== 'object') return []
  const out: Utilisation[] = []
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as { used?: unknown; available?: unknown }
    const used = numberOr(entry.used, -1)
    const available = numberOr(entry.available, -1)
    if (used < 0 || available < 0) continue
    out.push({ name, used, available })
  }
  return out
}

function readFmax(raw: unknown): FmaxEntry[] {
  if (!raw || typeof raw !== 'object') return []
  const out: FmaxEntry[] = []
  for (const [clock, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as { achieved?: unknown; constraint?: unknown }
    const achieved = numberOr(entry.achieved, -1)
    if (achieved < 0) continue
    out.push({
      clock: prettyClockName(clock),
      achieved,
      constraint: numberOr(entry.constraint, 0),
    })
  }
  return out
}

function readCriticalPath(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  let worst = 0
  for (const item of raw) {
    const path = (item as { path?: unknown })?.path
    if (!Array.isArray(path)) continue
    let total = 0
    for (const hop of path) {
      total += numberOr((hop as { delay?: unknown })?.delay, 0)
    }
    if (total > worst) worst = total
  }
  return worst > 0 ? worst : null
}

/** `out.pnr`: el JSON que escribe `nextpnr --report`. */
export function parsePnrReport(text: string | null | undefined): PnrReport | null {
  if (!text || !text.trim()) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const utilisation = readUtilisation(obj.utilization ?? obj.utilisation)
  const fmax = readFmax(obj.fmax)
  if (utilisation.length === 0 && fmax.length === 0) return null
  return {
    utilisation,
    fmax,
    criticalPathNs: readCriticalPath(obj.critical_paths),
  }
}

const STAT_HEADER_RE = /^===\s+(.+?)\s+===$/
const STAT_ROW_RE = /^\s*(\d+)(\s+)(\S.*?)\s*$/
const OLD_TOTAL_RE = /^\s*Number of cells:\s*(\d+)\s*$/
const OLD_CELL_RE = /^\s{4,}(\S+)\s+(\d+)\s*$/

/**
 * `$scopeinfo` y compañía son celdas internas de Yosys, no hardware: ensucian
 * la lista sin contar nada del diseño.
 */
function isCellName(name: string): boolean {
  if (name.startsWith('$')) return false
  return /^[A-Za-z_][\w$.:]*$/.test(name)
}

/**
 * El `stat` de Yosys. La 0.68 escribe "22   SB_CARRY" (el nombre de la celda va
 * con sangría extra); las versiones viejas escriben "SB_CARRY  22" debajo de
 * "Number of cells:". Leemos las dos.
 */
export function parseYosysStat(log: string, top?: string): YosysStat | null {
  const lines = log.split(/\r?\n/)
  const blocks: { module: string; rows: string[] }[] = []
  let current: { module: string; rows: string[] } | null = null

  for (const line of lines) {
    const header = STAT_HEADER_RE.exec(line.trim())
    if (header) {
      current = { module: header[1] ?? '', rows: [] }
      blocks.push(current)
      continue
    }
    if (current) current.rows.push(line)
  }

  const usable = blocks.filter(
    (b) => b.module && !b.module.startsWith('design hierarchy'),
  )
  if (usable.length === 0) return null
  const picked =
    (top ? usable.find((b) => b.module === top) : undefined) ??
    usable[usable.length - 1]!

  const cells: CellCount[] = []
  let totalCells = 0
  let oldStyleCells = false

  for (const row of picked.rows) {
    const oldTotal = OLD_TOTAL_RE.exec(row)
    if (oldTotal) {
      totalCells = Number(oldTotal[1])
      oldStyleCells = true
      continue
    }
    if (oldStyleCells) {
      const oldCell = OLD_CELL_RE.exec(row)
      if (oldCell && isCellName(oldCell[1] ?? '')) {
        cells.push({ name: oldCell[1]!, count: Number(oldCell[2]) })
        continue
      }
    }
    const match = STAT_ROW_RE.exec(row)
    if (!match) continue
    const count = Number(match[1])
    const gap = match[2] ?? ' '
    const label = match[3] ?? ''
    if (label === 'submodules') {
      if (!oldStyleCells) totalCells = count
      continue
    }
    // Sangría extra = es una celda, no un total del módulo.
    if (gap.length >= 2 && isCellName(label)) {
      cells.push({ name: label, count })
    }
  }

  if (cells.length === 0 && totalCells === 0) return null
  if (totalCells === 0) totalCells = cells.reduce((n, c) => n + c.count, 0)
  cells.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
  return { module: picked.module, cells, totalCells }
}

/** Una fila del historial de builds que muestra el panel de recursos. */
export type BuildRecord = {
  at: number
  top: string
  lcUsed: number | null
  lcAvailable: number | null
  fmax: number | null
  constraint: number | null
  bytes: number | null
}

export function utilisationPct(entry: Utilisation): number {
  if (entry.available <= 0) return 0
  return Math.min(100, (entry.used / entry.available) * 100)
}

/** `true` cuando nextpnr no llega al reloj pedido: es el aviso que importa. */
export function fmaxFails(entry: FmaxEntry): boolean {
  return entry.constraint > 0 && entry.achieved < entry.constraint
}
