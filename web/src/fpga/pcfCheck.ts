/**
 * Cruce entre los puertos del módulo top y los `set_io` del `.pcf`, antes de
 * gastar una síntesis entera. nextpnr-ice40 corta con
 *   ERROR: IO 'LED7' is unconstrained in PCF
 * y con "unmatched constraint" cuando el `.pcf` nombra algo que no existe:
 * las dos cosas se ven acá sin tocar el WASM.
 */

export type PortDir = 'input' | 'output' | 'inout'

export type ModulePort = {
  name: string
  dir: PortDir
  /** Rango declarado. `null` cuando no es literal (parámetros, expresiones). */
  msb: number | null
  lsb: number | null
}

export type PcfConstraint = {
  /** Nombre tal cual aparece: `LED0` o `LED` con `index` 3 si era `LED[3]`. */
  port: string
  index: number | null
  pin: string
  /** 1-based, para saltar a la línea del editor. */
  line: number
  nowarn: boolean
}

export type PcfProblemCode =
  | 'unconstrained'
  | 'unmatched'
  | 'duplicate-pin'
  | 'duplicate-port'
  | 'no-top'

export type PcfProblem = {
  severity: 'error' | 'warning'
  code: PcfProblemCode
  message: string
  file: string
  line: number | null
}

const DIR_RE = /^(input|output|inout)$/

/** Saca `//` y `/* *\/` sin romper las posiciones de línea. */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (two === '/*') {
      i += 2
      while (i < src.length && src.slice(i, i + 2) !== '*/') {
        if (src[i] === '\n') out += '\n'
        i += 1
      }
      i += 2
      continue
    }
    out += src[i]
    i += 1
  }
  return out
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

function parseRange(text: string): { msb: number | null; lsb: number | null } {
  const m = /\[\s*([^\]:]+?)\s*:\s*([^\]]+?)\s*\]/.exec(text)
  if (!m) return { msb: null, lsb: null }
  const msb = Number(m[1])
  const lsb = Number(m[2])
  if (!Number.isInteger(msb) || !Number.isInteger(lsb)) return { msb: null, lsb: null }
  return { msb, lsb }
}

/** Busca `module <top> ... ( … );` y devuelve el texto del paréntesis. */
function findPortList(src: string, top: string): { list: string; rest: string } | null {
  const head = new RegExp(`\\bmodule\\s+${top}\\b`).exec(src)
  if (!head) return null
  let i = head.index + head[0].length
  // Saltea `#( … )` de parámetros.
  while (i < src.length && /\s/.test(src[i] ?? '')) i += 1
  if (src[i] === '#') {
    i += 1
    while (i < src.length && src[i] !== '(') i += 1
    let depth = 0
    for (; i < src.length; i += 1) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) {
          i += 1
          break
        }
      }
    }
  }
  while (i < src.length && src[i] !== '(' && src[i] !== ';') i += 1
  if (src[i] !== '(') return null
  let depth = 0
  const start = i
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1
    else if (src[i] === ')') {
      depth -= 1
      if (depth === 0) break
    }
  }
  const list = src.slice(start + 1, i)
  const endIdx = src.indexOf('endmodule', i)
  const rest = src.slice(i, endIdx > 0 ? endIdx : undefined)
  return { list, rest }
}

/** Declaraciones sueltas del cuerpo: `input clk;` / `output [7:0] led;`. */
function portsFromBody(body: string, names: string[]): ModulePort[] {
  const known = new Set(names)
  const found = new Map<string, ModulePort>()
  const re = /\b(input|output|inout)\b([^;]*);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) != null) {
    const dir = m[1] as PortDir
    const tail = (m[2] ?? '').replace(/\b(wire|reg|logic|signed|tri)\b/g, ' ')
    const range = parseRange(tail)
    const cleaned = tail.replace(/\[[^\]]*\]/g, ' ')
    for (const raw of cleaned.split(',')) {
      const name = raw.trim()
      if (!/^[A-Za-z_][\w$]*$/.test(name)) continue
      if (names.length > 0 && !known.has(name)) continue
      found.set(name, { name, dir, msb: range.msb, lsb: range.lsb })
    }
  }
  return [...found.values()]
}

/**
 * Puertos del módulo top: acepta el estilo ANSI (`module t(input wire clk);`)
 * y el viejo (`module t(clk); input clk;`). `null` = no encontré el módulo.
 */
export function parseModulePorts(source: string, top: string): ModulePort[] | null {
  if (!/^[A-Za-z_][\w$]*$/.test(top)) return null
  const src = stripComments(source)
  const found = findPortList(src, top)
  if (!found) return null

  const items = splitTopLevel(found.list)
  const ansi = items.some((item) => DIR_RE.test((item.trim().split(/\s+/)[0] ?? '').trim()))

  if (!ansi) {
    const names = items
      .map((item) => item.trim().replace(/\[[^\]]*\]/g, '').trim())
      .filter((name) => /^[A-Za-z_][\w$]*$/.test(name))
    if (names.length === 0) return []
    const declared = portsFromBody(found.rest, names)
    const byName = new Map(declared.map((p) => [p.name, p]))
    return names.map(
      (name) => byName.get(name) ?? { name, dir: 'inout' as PortDir, msb: null, lsb: null },
    )
  }

  const ports: ModulePort[] = []
  let dir: PortDir = 'input'
  for (const item of items) {
    const text = item.trim()
    if (!text) continue
    const words = text.split(/\s+/)
    const first = words[0] ?? ''
    if (DIR_RE.test(first)) dir = first as PortDir
    const range = parseRange(text)
    const cleaned = text
      .replace(/\b(input|output|inout|wire|reg|logic|signed|tri)\b/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/=.*$/, ' ')
      .trim()
    const name = cleaned.split(/\s+/).pop() ?? ''
    if (!/^[A-Za-z_][\w$]*$/.test(name)) continue
    ports.push({ name, dir, msb: range.msb, lsb: range.lsb })
  }
  return ports
}

/** Todos los módulos declarados en un archivo, en orden de aparición. */
export function listModuleNames(source: string): string[] {
  const src = stripComments(source)
  const out: string[] = []
  const re = /\bmodule\s+([A-Za-z_][\w$]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) != null) {
    const name = m[1]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

const PIN_INDEX_RE = /^([A-Za-z_][\w$]*)\[(\d+)\]$/

/** `set_io [-nowarn] [-pullup yes] nombre pin`. Ignora el resto de comandos. */
export function parsePcf(text: string): PcfConstraint[] {
  const out: PcfConstraint[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#')[0]?.trim() ?? ''
    if (!line) return
    const tokens = line.split(/\s+/)
    if ((tokens[0] ?? '').toLowerCase() !== 'set_io') return
    let nowarn = false
    const words: string[] = []
    for (let t = 1; t < tokens.length; t += 1) {
      const token = tokens[t] ?? ''
      if (token.startsWith('-')) {
        if (token === '-nowarn') nowarn = true
        // Las opciones con valor (-pullup yes) se comen el token siguiente.
        if (token === '-pullup' || token === '-pullup_resistor') t += 1
        continue
      }
      words.push(token)
    }
    if (words.length < 2) return
    const pin = words[words.length - 1] ?? ''
    const port = words[words.length - 2] ?? ''
    const indexed = PIN_INDEX_RE.exec(port)
    out.push({
      port: indexed ? (indexed[1] ?? port) : port,
      index: indexed ? Number(indexed[2]) : null,
      pin,
      line: i + 1,
      nowarn,
    })
  })
  return out
}

export type PcfFrequency = {
  /** Nombre de la red de reloj tal como la nombra el PCF. */
  net: string
  mhz: number
  line: number
}

/**
 * `set_frequency <red> <MHz>`: la restricción de timing que lee nextpnr-ice40.
 * Sin esto, nextpnr compara **todos** los relojes contra su default de 12 MHz.
 */
export function parsePcfFrequencies(text: string): PcfFrequency[] {
  const out: PcfFrequency[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#')[0]?.trim() ?? ''
    if (!line) return
    const tokens = line.split(/\s+/)
    if ((tokens[0] ?? '').toLowerCase() !== 'set_frequency') return
    const net = tokens[1] ?? ''
    const mhz = Number(tokens[2])
    if (!net || !Number.isFinite(mhz) || mhz <= 0) return
    out.push({ net, mhz, line: i + 1 })
  })
  return out
}

function bitsOf(port: ModulePort): number[] | null {
  if (port.msb == null || port.lsb == null) return null
  const hi = Math.max(port.msb, port.lsb)
  const lo = Math.min(port.msb, port.lsb)
  if (hi - lo > 1024) return null
  const out: number[] = []
  for (let i = lo; i <= hi; i += 1) out.push(i)
  return out
}

export type CheckPcfOptions = {
  ports: ModulePort[] | null
  constraints: PcfConstraint[]
  pcfName: string
  topName: string
  topFile?: string | null
  max?: number
}

/**
 * Los problemas que harían fallar (o sorprender) al compilar. Sale ordenado:
 * primero errores, después avisos, siempre por línea.
 */
export function checkPcf(opts: CheckPcfOptions): PcfProblem[] {
  const problems: PcfProblem[] = []
  const max = opts.max ?? 60

  if (opts.ports == null) {
    return [
      {
        severity: 'warning',
        code: 'no-top',
        message: `No encontré el módulo ${opts.topName} en los archivos .v del proyecto.`,
        file: opts.topFile ?? '',
        line: null,
      },
    ]
  }
  if (opts.ports.length === 0) return []

  const byPin = new Map<string, PcfConstraint>()
  const byPort = new Map<string, PcfConstraint>()
  const portByName = new Map(opts.ports.map((p) => [p.name, p]))

  for (const c of opts.constraints) {
    const key = c.index == null ? c.port : `${c.port}[${c.index}]`

    const dupPin = byPin.get(c.pin)
    if (dupPin) {
      problems.push({
        severity: 'error',
        code: 'duplicate-pin',
        message: `El pin ${c.pin} ya estaba asignado a ${dupPin.port} (línea ${dupPin.line}).`,
        file: opts.pcfName,
        line: c.line,
      })
    } else {
      byPin.set(c.pin, c)
    }

    const dupPort = byPort.get(key)
    if (dupPort) {
      problems.push({
        severity: 'error',
        code: 'duplicate-port',
        message: `${key} ya tenía pin en la línea ${dupPort.line}.`,
        file: opts.pcfName,
        line: c.line,
      })
    } else {
      byPort.set(key, c)
    }

    const port = portByName.get(c.port)
    const bits = port ? bitsOf(port) : null
    // Con índice pedimos que el bit exista; sin índice alcanza con el nombre.
    const known =
      port != null && (c.index == null || bits == null || bits.includes(c.index))
    // `-nowarn` es justamente "este pin puede no usarse": las plantillas de las
    // placas mapean el conector entero y el diseño usa cuatro señales. Un nombre
    // mal escrito igual salta más abajo, como puerto sin pin.
    if (!known && !c.nowarn) {
      problems.push({
        severity: 'error',
        code: 'unmatched',
        message: port
          ? `${key} está fuera del rango de ${port.name} [${port.msb}:${port.lsb}].`
          : `${key} no es un puerto de ${opts.topName}.`,
        file: opts.pcfName,
        line: c.line,
      })
    }
  }

  // Nombre base de cada set_io: alcanza para un puerto escalar o de ancho
  // desconocido (`[WIDTH-1:0]`), donde no sabemos qué bits pedir.
  const baseNames = new Set(opts.constraints.map((c) => c.port))

  for (const port of opts.ports) {
    const bits = bitsOf(port)
    if (bits == null || bits.length <= 1) {
      if (!baseNames.has(port.name)) {
        problems.push({
          severity: 'error',
          code: 'unconstrained',
          message: `${port.name} no tiene set_io en ${opts.pcfName}: nextpnr corta con "unconstrained in PCF".`,
          file: opts.pcfName,
          line: null,
        })
      }
      continue
    }
    const missing = bits.filter(
      (bit) => !byPort.has(`${port.name}[${bit}]`) && !byPort.has(port.name),
    )
    if (missing.length === bits.length) {
      problems.push({
        severity: 'error',
        code: 'unconstrained',
        message: `${port.name}[${port.msb}:${port.lsb}] no tiene set_io en ${opts.pcfName}: nextpnr corta con "unconstrained in PCF".`,
        file: opts.pcfName,
        line: null,
      })
    } else if (missing.length > 0) {
      problems.push({
        severity: 'error',
        code: 'unconstrained',
        message: `Faltan pines de ${port.name}: ${missing.map((b) => `${port.name}[${b}]`).join(', ')}.`,
        file: opts.pcfName,
        line: null,
      })
    }
  }

  problems.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
    return (a.line ?? 1e9) - (b.line ?? 1e9)
  })
  return problems.slice(0, max)
}

/** El módulo top puede estar en cualquiera de los `.v`: lo buscamos en todos. */
export function findTopPorts(
  files: { name: string; content: string }[],
  top: string,
): { ports: ModulePort[] | null; file: string | null } {
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.v')) continue
    const ports = parseModulePorts(file.content, top)
    if (ports) return { ports, file: file.name }
  }
  return { ports: null, file: null }
}
