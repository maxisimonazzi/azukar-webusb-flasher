import assert from 'node:assert/strict'
import { test } from 'node:test'

import { concatFtdiPayloads, ftdiPayloadFromBulkIn } from './ftdiUsb.ts'

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

test('coalesced 70-byte IN leaked 0x31 0x60 at dump offset 0x3A; splitting packets does not', () => {
  const p1 = new Uint8Array(64)
  p1[0] = 0x31
  p1[1] = 0x60
  p1.fill(0xff, 2)
  const p2 = new Uint8Array([0x31, 0x60, 0xff, 0xff, 0xff, 0xff])
  const coalesced = new Uint8Array(70)
  coalesced.set(p1)
  coalesced.set(p2, 64)
  const buggy = coalesced.subarray(2)
  assert.equal(buggy[62], 0x31)
  assert.equal(buggy.subarray(4)[0x3a], 0x31)
  const payload = ftdiPayloadFromBulkIn(coalesced)
  assert.equal(payload.length, 66)
  assert.ok(payload.every((b) => b === 0xff))
})
