/** Limits and argv for the YoWASP browser worker (Yosys → nextpnr-ice40 → icepack). */

import {
  FPGA_IDENT_RE,
  FPGA_NAME_RE,
  isAllowedFilename,
  isPcfFilename,
  pickPcfFile,
} from './files.ts'

export const MAX_FILES = 100
export const MAX_CHARS = 80_000
export const MAX_FILE_CHARS = 20_000
export const MAX_PCF_CHARS = 40_000

export const TOKEN_RE = /^[A-Za-z0-9_.:-]+$/

export type CompileFile = { name: string; content: string }

/** La placa aporta el part de nextpnr. El PCF es un archivo del proyecto. */
export type CompileBoard = {
  device: string
  package: string
}

export type CompileJob = {
  yosysArgs: string[]
  nextpnrArgs: string[]
  icepackArgs: string[]
  files: Record<string, string>
}

export type CompileTree = { [name: string]: CompileTree | string | Uint8Array }

function fail(
  code: 'COMPILE_TOO_LARGE' | 'COMPILE_BAD_INPUT' | 'COMPILE_NO_PCF' | 'COMPILE_MANY_PCF',
): never {
  throw new Error(code)
}

export function buildCompileJob(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
): CompileJob {
  const topName = top.trim()
  if (!FPGA_IDENT_RE.test(topName)) fail('COMPILE_BAD_INPUT')
  if (!TOKEN_RE.test(board.device) || !TOKEN_RE.test(board.package)) fail('COMPILE_BAD_INPUT')
  if (!files.length || files.length > MAX_FILES) fail('COMPILE_TOO_LARGE')

  const pick = pickPcfFile(files)
  if (pick.kind === 'many') fail('COMPILE_MANY_PCF')
  if (pick.kind === 'none' || !pick.file.content.trim()) fail('COMPILE_NO_PCF')
  const pcfFile = pick.file

  const names: string[] = []
  const tree: Record<string, string> = {}
  let total = 0
  const seen = new Set<string>()
  for (const file of files) {
    const pcf = isPcfFilename(file.name)
    if (!FPGA_NAME_RE.test(file.name) && !pcf && !isAllowedFilename(file.name)) {
      fail('COMPILE_BAD_INPUT')
    }
    if (file.content.length > (pcf ? MAX_PCF_CHARS : MAX_FILE_CHARS)) fail('COMPILE_TOO_LARGE')
    if (seen.has(file.name)) fail('COMPILE_BAD_INPUT')
    seen.add(file.name)
    total += file.content.length
    if (total > MAX_CHARS) fail('COMPILE_TOO_LARGE')
    if (file.name.toLowerCase().endsWith('.v')) {
      names.push(file.name)
    }
    tree[file.name] = file.content
  }
  if (!names.length) fail('COMPILE_BAD_INPUT')

  return {
    yosysArgs: ['-Q', '-p', `synth_ice40 -top ${topName} -json out.json`, ...names],
    nextpnrArgs: [
      `--${board.device}`,
      '--package',
      board.package,
      '--json',
      'out.json',
      '--asc',
      'out.asc',
      '--pcf',
      pcfFile.name,
      '--report',
      'out.pnr',
    ],
    icepackArgs: ['out.asc', 'out.bin'],
    files: tree,
  }
}

export function extractTreeFile(tree: CompileTree, name: string): Uint8Array | null {
  const value = tree[name]
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') {
    const out = new Uint8Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff
    return out
  }
  return null
}

export function extractTreeText(tree: CompileTree, name: string): string | null {
  const value = tree[name]
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  return null
}
