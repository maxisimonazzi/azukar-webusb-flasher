/** Read .v sources out of a ZIP (store or deflate). No extra dependency. */

import { uniquifyFpgaName, zipPathToVerilogName } from './files.ts'

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const METHOD_STORE = 0
const METHOD_DEFLATE = 8

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function findEocd(view: DataView): number {
  const maxComment = 0xffff
  const start = Math.max(0, view.byteLength - 22 - maxComment)
  for (let i = view.byteLength - 22; i >= start; i -= 1) {
    if (u32(view, i) === SIG_EOCD) return i
  }
  throw new Error('zip: no encontré el directorio central')
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('zip: este browser no infla deflate')
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function verilogFilesFromZip(
  buf: ArrayBuffer,
  allowedExtensions?: string[],
): Promise<{ name: string; content: string }[]> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const eocd = findEocd(view)
  const count = u16(view, eocd + 10)
  let offset = u32(view, eocd + 16)
  const decoder = new TextDecoder()
  const out: { name: string; content: string }[] = []
  const taken = new Set<string>()

  for (let i = 0; i < count; i += 1) {
    if (u32(view, offset) !== SIG_CENTRAL) {
      throw new Error('zip: entrada central rota')
    }
    const method = u16(view, offset + 10)
    const compSize = u32(view, offset + 20)
    const nameLen = u16(view, offset + 28)
    const extraLen = u16(view, offset + 30)
    const commentLen = u16(view, offset + 32)
    const localOff = u32(view, offset + 42)
    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    offset += 46 + nameLen + extraLen + commentLen

    if (rawName.endsWith('/')) continue
    const base = zipPathToVerilogName(rawName, allowedExtensions)
    if (!base) continue

    if (u32(view, localOff) !== SIG_LOCAL) {
      throw new Error(`zip: header local roto (${rawName})`)
    }
    const localNameLen = u16(view, localOff + 26)
    const localExtra = u16(view, localOff + 28)
    const dataOff = localOff + 30 + localNameLen + localExtra
    const compressed = bytes.subarray(dataOff, dataOff + compSize)
    let raw: Uint8Array
    if (method === METHOD_STORE) {
      raw = compressed
    } else if (method === METHOD_DEFLATE) {
      raw = await inflateRaw(compressed)
    } else {
      throw new Error(`zip: método ${method} no soportado (${rawName})`)
    }
    const name = uniquifyFpgaName(base, taken)
    taken.add(name)
    out.push({ name, content: decoder.decode(raw) })
  }
  return out
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) {
    c ^= b
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function putLocal(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const out = new Uint8Array(30 + name.length + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, SIG_LOCAL, true)
  view.setUint16(4, 20, true)
  view.setUint32(14, crc, true)
  view.setUint32(18, data.length, true)
  view.setUint32(22, data.length, true)
  view.setUint16(26, name.length, true)
  out.set(name, 30)
  out.set(data, 30 + name.length)
  return out
}

function putCentral(name: Uint8Array, data: Uint8Array, crc: number, localOff: number): Uint8Array {
  const out = new Uint8Array(46 + name.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, SIG_CENTRAL, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint32(16, crc, true)
  view.setUint32(20, data.length, true)
  view.setUint32(24, data.length, true)
  view.setUint16(28, name.length, true)
  view.setUint32(42, localOff, true)
  out.set(name, 46)
  return out
}

/** Stored ZIP of the open project tabs. No extra dependency. */
export function verilogFilesToZip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = enc.encode(file.name)
    const data = enc.encode(file.content)
    const crc = crc32(data)
    const local = putLocal(name, data, crc)
    locals.push(local)
    centrals.push(putCentral(name, data, crc, offset))
    offset += local.length
  }
  const centralSize = centrals.reduce((n, part) => n + part.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIG_EOCD, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const part of locals) {
    out.set(part, p)
    p += part.length
  }
  for (const part of centrals) {
    out.set(part, p)
    p += part.length
  }
  out.set(eocd, p)
  return out
}
