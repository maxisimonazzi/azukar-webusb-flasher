import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FLASH_PAGE,
  FLASH_SECTOR,
  flashSizeFromJedec,
  ice40FlashPlan,
  isAllFf,
  trimIce40Image,
  trimTrailingFf,
} from './flashPlan.ts'

test('empty bin has no erase or pages', () => {
  const plan = ice40FlashPlan(0)
  assert.deepEqual(plan.eraseAddrs, [])
  assert.deepEqual(plan.pages, [])
})

test('one page stays in sector 0', () => {
  const plan = ice40FlashPlan(100)
  assert.deepEqual(plan.eraseAddrs, [0])
  assert.equal(plan.pages.length, 1)
  assert.deepEqual(plan.pages[0], { addr: 0, length: 100 })
})

test('exactly one sector needs one erase and 256 pages', () => {
  const plan = ice40FlashPlan(FLASH_SECTOR)
  assert.deepEqual(plan.eraseAddrs, [0])
  assert.equal(plan.pages.length, FLASH_SECTOR / FLASH_PAGE)
  assert.equal(plan.pages[0]?.length, FLASH_PAGE)
  assert.equal(plan.pages.at(-1)?.addr, FLASH_SECTOR - FLASH_PAGE)
})

test('one byte into the next sector adds a second erase', () => {
  const plan = ice40FlashPlan(FLASH_SECTOR + 1)
  assert.deepEqual(plan.eraseAddrs, [0, FLASH_SECTOR])
  assert.equal(plan.pages.at(-1)?.length, 1)
})

test('JEDEC density byte is log2 of size in bytes', () => {
  assert.equal(flashSizeFromJedec(new Uint8Array([0xef, 0x30, 0x13])), 512 * 1024)
  assert.equal(flashSizeFromJedec(new Uint8Array([0xef, 0x40, 0x16])), 4 * 1024 * 1024)
})

test('JEDEC without density is unknown', () => {
  assert.throws(() => flashSizeFromJedec(new Uint8Array([0xef, 0x30])), /unknown JEDEC/)
})

test('trimTrailingFf drops a full-chip dump down to the bitstream', () => {
  const raw = new Uint8Array(512 * 1024)
  raw.fill(0xff)
  raw.set([0xff, 0x00, 0x00, 0xff, 0x7e, 0xaa, 0x99, 0x7e, 0x51, 0x00])
  raw[135_099] = 0x20
  const trimmed = trimTrailingFf(raw)
  assert.equal(trimmed.length, 135_100)
  assert.equal(trimmed[135_099], 0x20)
})

test('trimTrailingFf leaves a compiled icepack image alone', () => {
  const bin = new Uint8Array([0xff, 0x00, 0x00, 0xff, 0x7e, 0x01])
  assert.equal(trimTrailingFf(bin), bin)
})

test('trimTrailingFf ignores a short 0xFF tail (icepack padding)', () => {
  const bin = new Uint8Array(100)
  bin[50] = 0x20
  bin.fill(0xff, 51)
  assert.equal(trimTrailingFf(bin).length, 100)
})

test('trimIce40Image treats a blank chip dump as empty', () => {
  const raw = new Uint8Array(512 * 1024)
  raw.fill(0xff)
  assert.equal(trimIce40Image(raw).length, 0)
  assert.equal(isAllFf(raw), true)
})

test('trimIce40Image still cuts a dump that has noise after the 0xFF pad', () => {
  const raw = new Uint8Array(512 * 1024)
  raw.fill(0xff)
  raw.fill(0x11, 0, 135_100)
  raw.set([0xff, 0x00, 0x00, 0xff, 0x7e, 0xaa, 0x99, 0x7e, 0x51, 0x00])
  raw[135_099] = 0x20
  raw[512 * 1024 - 1] = 0x00
  const trimmed = trimIce40Image(raw)
  assert.equal(trimmed.length, 135_100)
  assert.equal(trimmed[135_099], 0x20)
})

test('trimIce40Image copies a compiled icepack into a fresh buffer', () => {
  const bin = new Uint8Array([0xff, 0x00, 0x00, 0xff, 0x7e, 0xaa, 0x99, 0x7e, 0x01])
  const next = trimIce40Image(bin)
  assert.equal(next.length, bin.length)
  assert.notEqual(next.buffer, bin.buffer)
})
