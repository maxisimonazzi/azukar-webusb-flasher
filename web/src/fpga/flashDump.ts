/** How much of a flash dump we print to the console (the rest is a download). */
export const FLASH_CONSOLE_BYTES = 4096

function hexByte(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0')
}

function intelHexRecord(addr: number, type: number, bytes: number[]): string {
  const len = bytes.length
  let sum = len + ((addr >> 8) & 0xff) + (addr & 0xff) + type
  let payload = ''
  for (const b of bytes) {
    sum += b
    payload += hexByte(b)
  }
  const checksum = (~sum + 1) & 0xff
  return `:${hexByte(len)}${addr.toString(16).toUpperCase().padStart(4, '0')}${hexByte(type)}${payload}${hexByte(checksum)}`
}

export function toIntelHex(data: Uint8Array): string {
  const lines: string[] = []
  let lastExt = -1
  for (let addr = 0; addr < data.length; addr += 16) {
    const ext = addr >>> 16
    if (ext !== lastExt) {
      lines.push(intelHexRecord(0, 0x04, [(ext >> 8) & 0xff, ext & 0xff]))
      lastExt = ext
    }
    const chunk = data.subarray(addr, Math.min(addr + 16, data.length))
    lines.push(intelHexRecord(addr & 0xffff, 0x00, Array.from(chunk)))
  }
  lines.push(':00000001FF')
  return `${lines.join('\n')}\n`
}

export function formatHexDump(data: Uint8Array, base = 0): string {
  const lines: string[] = []
  for (let i = 0; i < data.length; i += 16) {
    const chunk = data.subarray(i, Math.min(i + 16, data.length))
    let hex = ''
    for (let j = 0; j < 16; j++) {
      if (j === 8) hex += ' '
      if (j < chunk.length) hex += `${j === 0 ? '' : ' '}${hexByte(chunk[j]!)}`
      else hex += j === 0 ? '  ' : '   '
    }
    let ascii = ''
    for (const b of chunk) {
      ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : '.'
    }
    const addr = (base + i).toString(16).toUpperCase().padStart(8, '0')
    lines.push(`${addr}  ${hex}  |${ascii}|`)
  }
  return lines.join('\n')
}
