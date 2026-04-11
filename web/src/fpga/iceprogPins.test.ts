import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  iceprogChipDeselect,
  iceprogChipSelect,
  iceprogReleaseBus,
  iceprogSramSelect,
} from './iceprogPins.ts'

test('chip select drives CS and CRESET low as outputs', () => {
  assert.deepEqual(iceprogChipSelect(), { value: 0, direction: 0x93 })
})

test('chip deselect high-Zs CS, keeps CRESET low', () => {
  assert.deepEqual(iceprogChipDeselect(), { value: 0, direction: 0x83 })
})

test('release bus only keeps SCK+MOSI as outputs', () => {
  assert.deepEqual(iceprogReleaseBus(), { value: 0, direction: 0x03 })
})

test('SRAM select drives CS low and leaves CRESET high-Z', () => {
  assert.deepEqual(iceprogSramSelect(), { value: 0, direction: 0x13 })
})
