/**
 * How iceprog walks a bitstream: 64 KiB erases, then 256-byte pages.
 * Ported from IceStorm iceprog.c. Copyright (C) 2015 Claire Xenia Wolf,
 * 2018 Piotr Esden-Tempski (ISC). Notice in web/public/THIRD_PARTY_NOTICES.md
 */

export const FLASH_PAGE = 256
export const FLASH_SECTOR = 65536

export type FlashPage = { addr: number; length: number }

export type FlashPlan = {
  eraseAddrs: number[]
  pages: FlashPage[]
}

export function ice40FlashPlan(binLength: number): FlashPlan {
  if (binLength <= 0) {
    return { eraseAddrs: [], pages: [] }
  }
  const last = binLength - 1
  const firstSector = 0
  const lastSector = Math.floor(last / FLASH_SECTOR) * FLASH_SECTOR
  const eraseAddrs: number[] = []
  for (let addr = firstSector; addr <= lastSector; addr += FLASH_SECTOR) {
    eraseAddrs.push(addr)
  }
  const pages: FlashPage[] = []
  for (let addr = 0; addr < binLength; addr += FLASH_PAGE) {
    pages.push({
      addr,
      length: Math.min(FLASH_PAGE, binLength - addr),
    })
  }
  return { eraseAddrs, pages }
}

/** Winbond JEDEC byte 3 is log2(capacity in bytes). EF 30 13 → 512 KiB. */
export function flashSizeFromJedec(id: Uint8Array): number {
  const density = id[2]
  if (density == null || density < 8 || density > 28) {
    throw new Error('unknown JEDEC density')
  }
  return 1 << density
}

const ICE40_WAKE = [0xff, 0x00, 0x00, 0xff, 0x7e, 0xaa, 0x99, 0x7e] as const

export function hasIce40Preamble(data: Uint8Array): boolean {
  if (data.length < ICE40_WAKE.length) return false
  return ICE40_WAKE.every((b, i) => data[i] === b)
}

export function isAllFf(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0xff) return false
  }
  return data.length > 0
}

export function trimTrailingFf(data: Uint8Array): Uint8Array {
  let end = data.length
  while (end > 0 && data[end - 1] === 0xff) {
    end -= 1
  }
  if (end === 0 || data.length - end < 4096) return data
  return data.subarray(0, end)
}

/**
 * Compact ice40 image: drop a 0xFF tail, or (chip-sized dump with noise at the
 * end) cut at the first 4 KiB run of 0xFF. Always returns a fresh buffer.
 */
export function trimIce40Image(data: Uint8Array): Uint8Array {
  if (data.length === 0 || isAllFf(data)) return new Uint8Array()
  const trailing = trimTrailingFf(data)
  if (trailing.length !== data.length) return new Uint8Array(trailing)
  if (data.length >= 256 * 1024 && hasIce40Preamble(data)) {
    let run = 0
    for (let i = 64; i < data.length; i++) {
      if (data[i] === 0xff) {
        run += 1
        if (run >= 4096) {
          let end = i - 4095
          while (end > 64 && data[end - 1] === 0xff) end -= 1
          return new Uint8Array(data.subarray(0, end))
        }
      } else {
        run = 0
      }
    }
  }
  return new Uint8Array(data)
}

export function hexBytes(data: Uint8Array, max = 8): string {
  const slice = data.subarray(0, max)
  return Array.from(slice)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
}
