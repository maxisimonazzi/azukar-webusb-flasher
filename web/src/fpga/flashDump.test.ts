import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatHexDump, toIntelHex } from './flashDump.ts'

test('Intel HEX wraps 16-byte data records and an EOF', () => {
  const hex = toIntelHex(new Uint8Array([0x01, 0x02]))
  assert.equal(hex, [':020000040000FA', ':020000000102FB', ':00000001FF', ''].join('\n'))
})

test('Intel HEX emits an extended address at each 64 KiB boundary', () => {
  const data = new Uint8Array(0x10001)
  data[0] = 0xaa
  data[0x10000] = 0xbb
  const lines = toIntelHex(data).trimEnd().split('\n')
  assert.equal(lines[0], ':020000040000FA')
  assert.ok(lines.includes(':020000040001F9'))
  assert.ok(lines.some((line) => line.startsWith(':01000000BB')))
  assert.equal(lines.at(-1), ':00000001FF')
})

test('hex dump shows address, hex, and ascii', () => {
  const text = formatHexDump(new Uint8Array([0x41, 0x00, 0x7e]), 0)
  assert.equal(
    text,
    '00000000  41 00 7E                                          |A.~|',
  )
})
