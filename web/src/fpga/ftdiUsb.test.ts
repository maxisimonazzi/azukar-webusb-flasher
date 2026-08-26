import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FLASH_DUMP_CHUNK,
  FLASH_READ_CMD_BYTES,
  FLASH_READ_MAX_DATA,
  FTDI_BULK_PACKET,
  FTDI_MAX_BULK_IN,
  FTDI_MAX_PAYLOAD,
  MPSSE_MAX_LEN,
  concatFtdiPayloads,
  ftdiBulkInRequestLength,
  ftdiPayloadFromBulkIn,
  ftdiUsbBytesFor,
  flashReadSliceSizes,
  spiReadChunkSizes,
} from './ftdiUsb.ts'

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

test('WinUSB on Windows 10 must never see a transferIn smaller than 64', () => {
  assert.equal(ftdiBulkInRequestLength(), 64)
  assert.equal(ftdiBulkInRequestLength(), FTDI_MAX_PAYLOAD + 2)
})

test('a 64-byte flash dump chunk does not fit in one FTDI packet; split it', () => {
  assert.equal(FLASH_READ_CMD_BYTES + FLASH_READ_MAX_DATA, FTDI_MAX_PAYLOAD)
  assert.deepEqual(flashReadSliceSizes(64), [58, 6])
  assert.deepEqual(flashReadSliceSizes(58), [58])
  assert.deepEqual(flashReadSliceSizes(0), [])
})

test('a streamed read asks for whole FTDI packets, never a stray 8', () => {
  assert.equal(ftdiUsbBytesFor(1), 64)
  assert.equal(ftdiUsbBytesFor(62), 64)
  assert.equal(ftdiUsbBytesFor(63), 128)
  assert.equal(ftdiUsbBytesFor(66), 128)
  assert.equal(ftdiBulkInRequestLength(6), 64)
  assert.equal(ftdiBulkInRequestLength(16384) % FTDI_BULK_PACKET, 0)
  assert.equal(ftdiBulkInRequestLength(1 << 20), FTDI_MAX_BULK_IN)
})

test('MPSSE 0x20 length is 16-bit, so a chunk never exceeds 65536', () => {
  assert.deepEqual(spiReadChunkSizes(0), [])
  assert.deepEqual(spiReadChunkSizes(100, 64), [64, 36])
  assert.deepEqual(spiReadChunkSizes(FLASH_DUMP_CHUNK), [FLASH_DUMP_CHUNK])
  const big = spiReadChunkSizes(200000, 1 << 20)
  assert.ok(big.every((n) => n <= MPSSE_MAX_LEN))
  assert.equal(
    big.reduce((a, b) => a + b, 0),
    200000,
  )
})

test('a 512 KiB dump costs orders of magnitude fewer USB round trips', () => {
  const size = 512 * 1024
  const perPacket = flashReadSliceSizes(size).length
  const streamed = spiReadChunkSizes(size, FLASH_DUMP_CHUNK).length
  assert.equal(perPacket, Math.ceil(size / FLASH_READ_MAX_DATA))
  assert.ok(streamed * 100 < perPacket, `${streamed} vs ${perPacket}`)
})
