import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FTDI_PID,
  FTDI_VID,
  PIN_CDONE,
  PIN_CRESET,
  PIN_CS,
  formatAdbusPins,
  iceprogChipDeselect,
  iceprogChipSelect,
  iceprogReleaseBus,
  iceprogSramReleaseCs,
  iceprogSramSelect,
} from './iceprogPins.ts'

test('VID/PID is FT2232H 0x0403/0x6010 (Azukar / Alhambra)', () => {
  assert.equal(FTDI_VID, 0x0403)
  assert.equal(FTDI_PID, 0x6010)
})

test('chip select drives CS and CRESET low as outputs', () => {
  assert.deepEqual(iceprogChipSelect(), { value: 0, direction: 0x93 })
})

test('chip deselect high-Zs CS, keeps CRESET low', () => {
  assert.deepEqual(iceprogChipDeselect(), { value: 0, direction: 0x83 })
})

test('release bus only keeps SCK+MOSI as outputs', () => {
  assert.deepEqual(iceprogReleaseBus(), { value: 0, direction: 0x03 })
})

test('SRAM select drives CS low and CRESET high (slave edge, not pull-up)', () => {
  assert.deepEqual(iceprogSramSelect(), {
    value: PIN_CRESET,
    direction: 0x93,
  })
})

test('SRAM release CS keeps CRESET high so flash does not boot', () => {
  assert.deepEqual(iceprogSramReleaseCs(), {
    value: PIN_CRESET,
    direction: 0x83,
  })
})

test('formatAdbusPins names CS, CRESET and CDONE', () => {
  assert.equal(formatAdbusPins(0), 'CS=0 CRESET=0 CDONE=0 raw=0x00')
  assert.equal(
    formatAdbusPins(PIN_CS | PIN_CRESET | PIN_CDONE),
    'CS=1 CRESET=1 CDONE=1 raw=0xd0',
  )
  assert.equal(formatAdbusPins(PIN_CRESET), 'CS=0 CRESET=1 CDONE=0 raw=0x80')
})
