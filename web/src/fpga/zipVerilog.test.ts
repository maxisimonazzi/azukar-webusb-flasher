import assert from 'node:assert/strict'
import { test } from 'node:test'

import { verilogFilesFromZip, verilogFilesToZip } from './zipVerilog.ts'

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) {
    c ^= b
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function storedZip(entries: { name: string; content: string }[]): ArrayBuffer {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = enc.encode(entry.name)
    const data = enc.encode(entry.content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
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
  return out.buffer
}

test('verilogFilesFromZip keeps only .v and uses basename', async () => {
  const buf = storedZip([
    { name: 'src/and2.v', content: 'module and2; endmodule\n' },
    { name: 'readme.md', content: 'no' },
    { name: 'top.v', content: 'module top; endmodule\n' },
  ])
  const files = await verilogFilesFromZip(buf)
  assert.deepEqual(
    files.map((f) => f.name),
    ['and2.v', 'top.v'],
  )
  assert.equal(files[0]?.content.includes('and2'), true)
})

test('verilogFilesToZip round-trips every tab', async () => {
  const tabs = [
    { name: 'azukar_lab.v', content: 'module azukar_lab; endmodule\n' },
    { name: 'and2.v', content: 'module and2; endmodule\n' },
  ]
  const zip = verilogFilesToZip(tabs)
  const back = await verilogFilesFromZip(zip.buffer.slice(0))
  assert.deepEqual(back, tabs)
})
