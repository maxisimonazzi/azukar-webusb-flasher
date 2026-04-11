import assert from 'node:assert/strict'
import { test } from 'node:test'

import { concatFtdiPayloads } from './ftdiUsb.ts'

test('each USB packet drops the 2-byte FTDI status header', () => {
  const out = concatFtdiPayloads([
    new Uint8Array([0x31, 0x60, 0xaa, 0xbb]),
    new Uint8Array([0x31, 0x60, 0xcc]),
  ])
  assert.deepEqual(Array.from(out), [0xaa, 0xbb, 0xcc])
})

test('a status-only packet (like the short read of 2) adds nothing', () => {
  const out = concatFtdiPayloads([new Uint8Array([0x31, 0x60])])
  assert.equal(out.length, 0)
})

test('the failing 8-byte packet still yields 6 data bytes', () => {
  const out = concatFtdiPayloads([
    new Uint8Array([0x31, 0x60, 1, 2, 3, 4, 5, 6]),
  ])
  assert.deepEqual(Array.from(out), [1, 2, 3, 4, 5, 6])
})
