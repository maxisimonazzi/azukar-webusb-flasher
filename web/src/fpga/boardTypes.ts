/** Shared board types and PCF helpers. No Vite glob — Node tests can import this. */

import { readLocal, removeLocal, writeLocal } from '@/lib/storage'

export const CUSTOM_BOARD_ID = 'custom'
export const DEFAULT_BOARD_ID = 'azukar-v2'
export const BOARD_ID_KEY = 'boardId'
export const CUSTOM_BOARD_KEY = 'customBoard'
export const CUSTOM_BOARDS_KEY = 'customBoards'

export const EXAMPLE_CUSTOM_PCF = `# Ejemplo de como mapear los pines de tu placa con su variable.
# Modifica con los valores adecuados para tu placa.

# ------------ Buttons (active low)
set_io -nowarn BTN0_ 20  # input
set_io -nowarn BTN1_ 21  # input

# ------------ User LEDs
set_io -nowarn LED0 30  #-- output
set_io -nowarn LED1 31  #-- output

# ------------ SYSTEM CLOCK
set_io -nowarn CLK12 40    # input
set_io -nowarn CLK100 41  # input

# ------------ FTDI (Virtual Serial port)
set_io -nowarn RX  64  # input
set_io -nowarn TX  63  # output
set_io -nowarn RTS 62  # input
set_io -nowarn CTS 61  # output
set_io -nowarn DTR 60  # input
set_io -nowarn DSR 56  # output
set_io -nowarn DCD 55  # output

# ------------ GPIO
set_io -nowarn GPIO0 50  # input/output
set_io -nowarn GPIO1 51  # input/output
`

export const ADBUS_SIGNALS = ['sck', 'mosi', 'cs', 'cdone', 'creset'] as const
export type AdbusSignal = (typeof ADBUS_SIGNALS)[number]

export type AdbusBits = {
  sck: number
  mosi: number
  cs: number
  cdone: number
  creset: number
}

/** Iceprog / Alhambra / Azukar / EDU-CIAA default. */
export const ICEPROG_ADBUS: AdbusBits = {
  sck: 0,
  mosi: 1,
  cs: 4,
  cdone: 6,
  creset: 7,
}

export const FTDI_VID_DEFAULT = 1027
export const FTDI_PID_DEFAULT = 24592

export const NEXTPRN_DEVICES = [
  'hx1k',
  'hx8k',
  'lp384',
  'lp1k',
  'lp8k',
  'lm4k',
  'up5k',
  'u4k',
] as const

export const NEXTPRN_PACKAGES = [
  'tq144',
  'tq144:4k',
  'ct256',
  'sg48',
  'cm81',
  'cm36',
  'cb132',
  'vq100',
  'swg16tr',
  'uwg30',
] as const

export type PcfDir = 'input' | 'output' | 'inout'

export type PcfRow = {
  name: string
  pin: string
  dir: PcfDir
}

export type BoardHelp = {
  fpgaLabel?: string
  pinoutUrl?: string
  repoUrl?: string
  siteUrl?: string
  clock?: string
  uart?: string
}

export type BoardKind = 'listed' | 'custom'

export type BoardProfile = {
  id: string
  title: string
  kind: BoardKind
  fpga: {
    arch: string
    nextpnr_device: string
    nextpnr_package: string
    pcf: string
  }
  programmer: {
    chip: string
    vid: number
    pid: number
    channel: string
    adbus: AdbusBits
  }
  help?: BoardHelp
  pcfText: string
}

export type CustomBoardDraft = {
  title: string
  device: string
  package: string
  vid: number
  pid: number
  adbus: AdbusBits
  pcf: string
}

const PCF_IO_RE =
  /^\s*set_io(?:\s+(?:-nowarn|--warn-no-port))?\s+(\S+)\s+(\S+)/i

export const TOKEN_RE = /^[A-Za-z0-9_.:-]+$/

export function isAdbusBits(raw: unknown): raw is AdbusBits {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return ADBUS_SIGNALS.every((key) => {
    const n = o[key]
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 7
  })
}

export function adbusHasDuplicates(adbus: AdbusBits): boolean {
  const pins = ADBUS_SIGNALS.map((key) => adbus[key])
  return new Set(pins).size !== pins.length
}

function dirComment(dir: PcfDir): string {
  switch (dir) {
    case 'input':
      return 'input'
    case 'output':
      return 'output'
    case 'inout':
      return 'input/output'
    default: {
      const _exhaustive: never = dir
      return _exhaustive
    }
  }
}

function commentToDir(comment: string): PcfDir {
  const c = comment.toLowerCase()
  if (c.includes('input/output') || c.includes('inout')) return 'inout'
  if (c.includes('output')) return 'output'
  if (c.includes('input')) return 'input'
  return 'inout'
}

export function pcfRowsToText(rows: PcfRow[]): string {
  const lines = [
    '# Custom board constraints (.pcf)',
    '# Clock: define CLK (or CLK12). UART: define TX and RX if you use the serial console.',
    '',
  ]
  for (const row of rows) {
    const name = row.name.trim()
    const pin = row.pin.trim()
    if (!name || !pin) continue
    lines.push(`set_io -nowarn ${name} ${pin}  # ${dirComment(row.dir)}`)
  }
  return `${lines.join('\n')}\n`
}

export function pcfTextToRows(text: string): PcfRow[] {
  const rows: PcfRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(PCF_IO_RE)
    if (!match) continue
    const comment = line.includes('#') ? line.slice(line.indexOf('#') + 1) : ''
    rows.push({
      name: match[1] ?? '',
      pin: match[2] ?? '',
      dir: commentToDir(comment),
    })
  }
  return rows
}

export function isCustomBoardId(id: string): boolean {
  return id === CUSTOM_BOARD_ID || id.startsWith('custom-')
}

export function emptyCustomDraft(examplePcf = EXAMPLE_CUSTOM_PCF): CustomBoardDraft {
  return {
    title: '',
    device: 'hx8k',
    package: 'tq144:4k',
    vid: FTDI_VID_DEFAULT,
    pid: FTDI_PID_DEFAULT,
    adbus: { ...ICEPROG_ADBUS },
    pcf: examplePcf,
  }
}

export type StoredCustomBoard = CustomBoardDraft & { id: string }

export function customDraftToProfile(
  draft: CustomBoardDraft,
  id = CUSTOM_BOARD_ID,
): BoardProfile {
  return {
    id,
    title: draft.title.trim() || 'Custom',
    kind: 'custom',
    fpga: {
      arch: 'ice40',
      nextpnr_device: draft.device,
      nextpnr_package: draft.package,
      pcf: 'pins.pcf',
    },
    programmer: {
      chip: 'FT2232H',
      vid: draft.vid,
      pid: draft.pid,
      channel: 'A',
      adbus: { ...draft.adbus },
    },
    help: {
      fpgaLabel: `${draft.device} / ${draft.package}`,
      clock: 'Define CLK (or CLK12) in the PCF',
      uart: 'Define TX and RX in the PCF to use the UART console',
    },
    pcfText: draft.pcf,
  }
}

function readStore(key: string): string | null {
  return readLocal(key)
}

function writeStore(key: string, value: string): void {
  writeLocal(key, value)
}

function parseCustomDraft(raw: unknown): CustomBoardDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<CustomBoardDraft>
  if (typeof data.pcf !== 'string' || !isAdbusBits(data.adbus)) return null
  if (typeof data.device !== 'string' || typeof data.package !== 'string') return null
  if (!TOKEN_RE.test(data.device) || !TOKEN_RE.test(data.package)) return null
  return {
    title: typeof data.title === 'string' ? data.title : 'Custom',
    device: data.device,
    package: data.package,
    vid: typeof data.vid === 'number' ? data.vid : FTDI_VID_DEFAULT,
    pid: typeof data.pid === 'number' ? data.pid : FTDI_PID_DEFAULT,
    adbus: data.adbus,
    pcf: data.pcf,
  }
}

export function loadCustomDraft(): CustomBoardDraft | null {
  const raw = readStore(CUSTOM_BOARD_KEY)
  if (!raw) return null
  try {
    return parseCustomDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

function nextCustomId(existing: StoredCustomBoard[]): string {
  let max = 0
  for (const board of existing) {
    const n = Number(board.id.slice('custom-'.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `custom-${max + 1}`
}

export function loadCustomBoards(): StoredCustomBoard[] {
  const raw = readStore(CUSTOM_BOARDS_KEY)
  const out: StoredCustomBoard[] = []
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue
          const id = (item as { id?: unknown }).id
          if (typeof id !== 'string' || !isCustomBoardId(id) || id === CUSTOM_BOARD_ID) {
            continue
          }
          const draft = parseCustomDraft(item)
          if (draft) out.push({ ...draft, id })
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (out.length === 0) {
    const legacy = loadCustomDraft()
    if (legacy) {
      const migrated: StoredCustomBoard = { ...legacy, id: 'custom-1' }
      writeStore(CUSTOM_BOARDS_KEY, JSON.stringify([migrated]))
      removeLocal(CUSTOM_BOARD_KEY)
      return [migrated]
    }
  }
  return out
}

export function saveCustomBoards(boards: StoredCustomBoard[]): void {
  writeStore(CUSTOM_BOARDS_KEY, JSON.stringify(boards))
}

export function addCustomBoard(draft: CustomBoardDraft): StoredCustomBoard {
  const list = loadCustomBoards()
  const stored: StoredCustomBoard = {
    ...draft,
    title: draft.title.trim() || `Custom ${list.length + 1}`,
    id: nextCustomId(list),
  }
  list.push(stored)
  saveCustomBoards(list)
  return stored
}

export function loadSavedBoardId(): string | null {
  return readStore(BOARD_ID_KEY)
}

export function saveBoardId(id: string): void {
  writeStore(BOARD_ID_KEY, id)
}
