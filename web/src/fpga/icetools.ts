/**
 * Las otras herramientas de IceStorm que ya viajan en `@yowasp/nextpnr-ice40`:
 * `icepll` (asistente de PLL) e `icebram` (cambiar el contenido de una ROM sin
 * volver a sintetizar). Acá va lo que se puede probar sin WASM: armar el argv,
 * validar la entrada y leer la salida.
 */

import { FPGA_IDENT_RE } from './files.ts'

export type PllRequest = {
  inputMhz: number
  outputMhz: number
  moduleName: string
  fileName: string
  /** `SB_PLL40_PAD` en vez de `SB_PLL40_CORE` (reloj que entra por un pin PAD). */
  usePad: boolean
  /** El default de icepll es feedback SIMPLE; `-S` lo apaga. */
  simpleFeedback: boolean
}

export type PllFailCode =
  | 'PLL_BAD_INPUT'
  | 'PLL_BAD_OUTPUT'
  | 'PLL_BAD_NAME'
  | 'PLL_BAD_FILE'

/** Rangos del PLL del iCE40 (datasheet): PLLIN 10–133, PLLOUT 16–275 MHz. */
export const PLL_IN_MIN = 10
export const PLL_IN_MAX = 133
export const PLL_OUT_MIN = 16
export const PLL_OUT_MAX = 275

export function validatePllRequest(req: PllRequest): PllFailCode | null {
  if (!Number.isFinite(req.inputMhz) || req.inputMhz < PLL_IN_MIN || req.inputMhz > PLL_IN_MAX) {
    return 'PLL_BAD_INPUT'
  }
  if (
    !Number.isFinite(req.outputMhz) ||
    req.outputMhz < PLL_OUT_MIN ||
    req.outputMhz > PLL_OUT_MAX
  ) {
    return 'PLL_BAD_OUTPUT'
  }
  if (!FPGA_IDENT_RE.test(req.moduleName)) return 'PLL_BAD_NAME'
  if (!/^[A-Za-z_][A-Za-z0-9_-]*\.v$/.test(req.fileName)) return 'PLL_BAD_FILE'
  return null
}

function mhz(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

export function buildIcepllArgs(req: PllRequest): string[] {
  const args = ['-i', mhz(req.inputMhz), '-o', mhz(req.outputMhz)]
  if (req.usePad) args.push('-p')
  if (!req.simpleFeedback) args.push('-S')
  args.push('-m', '-f', req.fileName, '-n', req.moduleName)
  return args
}

export type PllSummary = {
  achievedMhz: number | null
  divr: number | null
  divf: number | null
  divq: number | null
  filterRange: number | null
  feedback: string | null
  vcoMhz: number | null
}

/**
 * La salida de icepll, tal cual la escribe:
 *   F_PLLOUT:   25.125 MHz (achieved)
 *   DIVR:  0 (4'b0000)
 */
export function parseIcepllOutput(text: string): PllSummary {
  const num = (re: RegExp): number | null => {
    const m = re.exec(text)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }
  const feedback = /FEEDBACK:\s*(\S+)/.exec(text)
  return {
    achievedMhz: num(/F_PLLOUT:\s*([\d.]+)\s*MHz\s*\(achieved\)/),
    divr: num(/DIVR:\s*(\d+)/),
    divf: num(/DIVF:\s*(\d+)/),
    divq: num(/DIVQ:\s*(\d+)/),
    filterRange: num(/FILTER_RANGE:\s*(\d+)/),
    feedback: feedback ? (feedback[1] ?? null) : null,
    vcoMhz: num(/F_VCO:\s*([\d.]+)\s*MHz/),
  }
}

export type HexFailCode = 'HEX_EMPTY' | 'HEX_BAD_CHAR' | 'HEX_RAGGED' | 'HEX_NOT_256'

export type HexInfo = {
  words: number
  widthBits: number
}

/**
 * icebram es exigente: todas las palabras del mismo ancho y una cantidad
 * múltiplo de 256. Mejor decirlo acá que en un log del WASM.
 */
export function inspectHexFile(text: string): { info: HexInfo } | { error: HexFailCode } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { error: 'HEX_EMPTY' }
  let width = 0
  for (const line of lines) {
    if (!/^[0-9a-fA-F]+$/.test(line)) return { error: 'HEX_BAD_CHAR' }
    if (width === 0) width = line.length
    else if (line.length !== width) return { error: 'HEX_RAGGED' }
  }
  if (lines.length % 256 !== 0) return { error: 'HEX_NOT_256' }
  return { info: { words: lines.length, widthBits: width * 4 } }
}

export function buildIcebramArgs(fromHex: string, toHex: string): string[] {
  return [fromHex, toHex]
}

export function buildIcebramGenerateArgs(widthBits: number, words: number): string[] {
  return ['-g', String(widthBits), String(words)]
}

/** Los dos .hex tienen que tener la misma forma o icebram no puede sustituir. */
export function hexPairMismatch(a: HexInfo, b: HexInfo): 'HEX_WIDTH' | 'HEX_DEPTH' | null {
  if (a.widthBits !== b.widthBits) return 'HEX_WIDTH'
  if (a.words !== b.words) return 'HEX_DEPTH'
  return null
}
