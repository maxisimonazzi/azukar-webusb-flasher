import { ICEPROG_ADBUS, type AdbusBits, type BoardProfile } from './boardTypes.ts'

let current: BoardProfile | null = null
let adbus: AdbusBits = { ...ICEPROG_ADBUS }
let vid = 1027
let pid = 24592

export function getActiveBoard(): BoardProfile | null {
  return current
}

export function setActiveBoard(board: BoardProfile): void {
  current = board
  adbus = board.programmer.adbus
  vid = board.programmer.vid
  pid = board.programmer.pid
}

export function getActiveAdbus(): AdbusBits {
  return adbus
}

export function getActiveVid(): number {
  return vid
}

export function getActivePid(): number {
  return pid
}
