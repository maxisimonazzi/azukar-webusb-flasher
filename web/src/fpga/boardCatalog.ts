import {
  CUSTOM_BOARD_ID,
  DEFAULT_BOARD_ID,
  ICEPROG_ADBUS,
  TOKEN_RE,
  customDraftToProfile,
  isAdbusBits,
  isCustomBoardId,
  loadCustomBoards,
  loadSavedBoardId,
  type BoardProfile,
} from '@/fpga/boardTypes'

type BoardJson = {
  id?: string
  title?: string
  fpga?: BoardProfile['fpga']
  programmer?: BoardProfile['programmer']
  help?: BoardProfile['help']
}

const BOARD_ID_RE = /^[a-z][a-z0-9-]{0,40}$/

const jsonModules = import.meta.glob<BoardJson>('../../../boards/*/board.json', {
  eager: true,
  import: 'default',
})
const pcfModules = import.meta.glob<string>('../../../boards/*/pins.pcf', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function dirFromFolder(path: string): string | null {
  const match = path.replace(/\\/g, '/').match(/boards\/([^/]+)\/[^/]+$/)
  return match?.[1] ?? null
}

function pcfForFolder(folder: string, name: string): string {
  const needle = `/boards/${folder}/${name}`
  for (const [path, text] of Object.entries(pcfModules)) {
    if (path.replace(/\\/g, '/').endsWith(needle)) return text
  }
  const fallback = `/boards/${folder}/pins.pcf`
  for (const [path, text] of Object.entries(pcfModules)) {
    if (path.replace(/\\/g, '/').endsWith(fallback)) return text
  }
  return ''
}

function parseListed(folder: string, json: BoardJson): BoardProfile | null {
  const id = json.id ?? folder
  if (!BOARD_ID_RE.test(id) || id === CUSTOM_BOARD_ID) return null
  const fpga = json.fpga
  const programmer = json.programmer
  if (!fpga || !programmer || !json.title) return null
  if (!TOKEN_RE.test(fpga.nextpnr_device) || !TOKEN_RE.test(fpga.nextpnr_package)) {
    return null
  }
  if (!isAdbusBits(programmer.adbus)) return null
  if (typeof programmer.vid !== 'number' || typeof programmer.pid !== 'number') {
    return null
  }
  return {
    id,
    title: json.title,
    kind: 'listed',
    fpga,
    programmer,
    help: json.help,
    pcfText: pcfForFolder(folder, fpga.pcf),
  }
}

function loadListedBoards(): BoardProfile[] {
  const out: BoardProfile[] = []
  for (const [path, json] of Object.entries(jsonModules)) {
    const folder = dirFromFolder(path)
    if (!folder) continue
    const board = parseListed(folder, json)
    if (board) out.push(board)
  }
  out.sort((a, b) => {
    if (a.id === DEFAULT_BOARD_ID) return -1
    if (b.id === DEFAULT_BOARD_ID) return 1
    return a.title.localeCompare(b.title)
  })
  return out
}

export const LISTED_BOARDS: BoardProfile[] = loadListedBoards()

export function listedBoard(id: string): BoardProfile | undefined {
  return LISTED_BOARDS.find((b) => b.id === id)
}

export function customBoardProfiles(): BoardProfile[] {
  return loadCustomBoards().map((board) => customDraftToProfile(board, board.id))
}

export function loadBoardId(): string {
  const id = loadSavedBoardId()
  if (id && listedBoard(id)) return id
  if (id && isCustomBoardId(id)) {
    const custom = loadCustomBoards().find((board) => board.id === id)
    if (custom) return custom.id
    const first = loadCustomBoards()[0]
    if (first) return first.id
  }
  return DEFAULT_BOARD_ID
}

export function resolveBoard(id: string): BoardProfile {
  const listed = listedBoard(id)
  if (listed) return listed
  if (isCustomBoardId(id)) {
    const custom = loadCustomBoards().find((board) => board.id === id)
    if (custom) return customDraftToProfile(custom, custom.id)
  }
  return listedBoard(DEFAULT_BOARD_ID) ?? {
    id: DEFAULT_BOARD_ID,
    title: 'Azukar v2',
    kind: 'listed',
    fpga: {
      arch: 'ice40',
      nextpnr_device: 'hx8k',
      nextpnr_package: 'tq144:4k',
      pcf: 'pins.pcf',
    },
    programmer: {
      chip: 'FT2232H',
      vid: 1027,
      pid: 24592,
      channel: 'A',
      adbus: { ...ICEPROG_ADBUS },
    },
    pcfText: '',
  }
}
