/**
 * Del log de Yosys / nextpnr / icepack a una lista de problemas con archivo y
 * línea. Es lo que hace clicable el error y lo que subraya el editor.
 *
 * Formatos que emiten las herramientas (log.cc de Yosys, pcf.cc de nextpnr):
 *   top.v:12: ERROR: syntax error, unexpected ','
 *   top.v:8: Warning: Wire \foo is used but has no driver.
 *   ERROR: Module `\uart_tx' referenced in module `\top' is not part of the design.
 *   ERROR: unmatched constraint 'LED9' (on line 14)
 */

export type DiagSeverity = 'error' | 'warning'

export type DiagSource = 'yosys' | 'nextpnr' | 'icepack' | 'pcf' | 'tool'

export type ToolDiagnostic = {
  /** Nombre del archivo del proyecto, o `null` si el mensaje no lo dice. */
  file: string | null
  /** 1-based, como lo cuenta el editor. */
  line: number | null
  severity: DiagSeverity
  message: string
  source: DiagSource
  /** Índice de la línea en el log: sirve para saltar a la consola. */
  logIndex: number
}

export const MAX_DIAGNOSTICS = 200

const FILE_LINE_RE =
  /^\s*(?<file>[^\s:]+\.(?:v|sv|vh|pcf|hex|txt)):(?<line>\d+):(?:\d+:)?\s*(?<sev>ERROR|Error|WARNING|Warning|error|warning)\b:?\s*(?<msg>.*)$/
const BARE_RE = /^\s*(?<sev>ERROR|Error|WARNING|Warning)\b:?\s*(?<msg>.*)$/
const INLINE_FILE_RE = /(?<file>[A-Za-z_][\w.-]*\.(?:v|sv|vh|pcf|hex|txt)):(?<line>\d+)/
const ON_LINE_RE = /\(?\bon line (?<line>\d+)\)?/i
const IN_LINE_RE = /\bin line (?<line>\d+)/i

/** Los banners que escribe el worker entre etapa y etapa. */
function bannerSource(line: string): DiagSource | null {
  if (!line.includes('========')) return null
  const low = line.toLowerCase()
  if (low.includes('yosys')) return 'yosys'
  if (low.includes('nextpnr')) return 'nextpnr'
  if (low.includes('icepack')) return 'icepack'
  return null
}

function severityOf(raw: string): DiagSeverity {
  return raw.toLowerCase().startsWith('e') ? 'error' : 'warning'
}

/** Solo saltamos a archivos que existen en el proyecto (el basename alcanza). */
function matchKnown(name: string, known: string[]): string | null {
  const base = name.split('/').pop() ?? name
  const hit = known.find((f) => f.toLowerCase() === base.toLowerCase())
  return hit ?? null
}

function toLineNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export type ParseLogOptions = {
  /** Archivos del proyecto: filtra rutas internas de las herramientas. */
  files: string[]
  /** El `.pcf` que se le pasó a nextpnr, para los "(on line N)" sin archivo. */
  pcfName?: string
  max?: number
}

export function parseToolLog(
  lines: string[],
  opts: ParseLogOptions,
): ToolDiagnostic[] {
  const known = opts.files
  const max = opts.max ?? MAX_DIAGNOSTICS
  const out: ToolDiagnostic[] = []
  const seen = new Set<string>()
  let source: DiagSource = 'tool'

  const push = (d: ToolDiagnostic) => {
    const key = `${d.file ?? ''}:${d.line ?? 0}:${d.severity}:${d.message}`
    if (seen.has(key)) return
    seen.add(key)
    if (out.length < max) out.push(d)
  }

  lines.forEach((raw, logIndex) => {
    const banner = bannerSource(raw)
    if (banner) {
      source = banner
      return
    }

    const direct = FILE_LINE_RE.exec(raw)
    if (direct?.groups) {
      const file = matchKnown(direct.groups.file ?? '', known)
      push({
        file,
        line: toLineNumber(direct.groups.line),
        severity: severityOf(direct.groups.sev ?? ''),
        message: (direct.groups.msg ?? '').trim(),
        source: file && file.toLowerCase().endsWith('.pcf') ? 'pcf' : source,
        logIndex,
      })
      return
    }

    const bare = BARE_RE.exec(raw)
    if (!bare?.groups) return
    const message = (bare.groups.msg ?? '').trim()
    if (!message) return

    // "…tal archivo.v:12…" dentro del texto del mensaje.
    const inline = INLINE_FILE_RE.exec(message)
    if (inline?.groups) {
      const file = matchKnown(inline.groups.file ?? '', known)
      push({
        file,
        line: toLineNumber(inline.groups.line),
        severity: severityOf(bare.groups.sev ?? ''),
        message,
        source: file && file.toLowerCase().endsWith('.pcf') ? 'pcf' : source,
        logIndex,
      })
      return
    }

    // nextpnr habla del PCF con "(on line N)"; Yosys con "in line N".
    const onLine = ON_LINE_RE.exec(message) ?? IN_LINE_RE.exec(message)
    const line = toLineNumber(onLine?.groups?.line)
    const pcf = opts.pcfName && matchKnown(opts.pcfName, known)
    if (line != null && source === 'nextpnr' && pcf) {
      push({
        file: pcf,
        line,
        severity: severityOf(bare.groups.sev ?? ''),
        message,
        source: 'pcf',
        logIndex,
      })
      return
    }

    push({
      file: null,
      line,
      severity: severityOf(bare.groups.sev ?? ''),
      message,
      source,
      logIndex,
    })
  })

  return out
}

export function countBySeverity(diags: ToolDiagnostic[]): {
  errors: number
  warnings: number
} {
  let errors = 0
  let warnings = 0
  for (const d of diags) {
    if (d.severity === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings }
}

/** Orden de lectura: primero errores, después por archivo y línea. */
export function sortDiagnostics(diags: ToolDiagnostic[]): ToolDiagnostic[] {
  return [...diags].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
    const fa = a.file ?? ''
    const fb = b.file ?? ''
    if (fa !== fb) return fa < fb ? -1 : 1
    return (a.line ?? 0) - (b.line ?? 0)
  })
}
