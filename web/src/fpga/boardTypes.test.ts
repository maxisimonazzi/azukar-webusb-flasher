import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  adbusHasDuplicates,
  EXAMPLE_CUSTOM_PCF,
  ICEPROG_ADBUS,
  pcfRowsToText,
  pcfTextToRows,
} from './boardTypes.ts'

test('default iceprog ADBUS has unique bits', () => {
  assert.equal(adbusHasDuplicates(ICEPROG_ADBUS), false)
})

test('duplicate ADBUS pins are rejected', () => {
  assert.equal(adbusHasDuplicates({ ...ICEPROG_ADBUS, cs: 0 }), true)
})

test('pcf text round-trips names, pins and direction comments', () => {
  const text = pcfRowsToText([
    { name: 'CLK', pin: '94', dir: 'input' },
    { name: 'LED0', pin: '1', dir: 'output' },
    { name: 'GPIO0', pin: '80', dir: 'inout' },
  ])
  assert.match(text, /set_io -nowarn CLK 94/)
  const rows = pcfTextToRows(text)
  assert.deepEqual(
    rows.map((r) => r.name),
    ['CLK', 'LED0', 'GPIO0'],
  )
  assert.equal(rows[0]?.dir, 'input')
  assert.equal(rows[1]?.dir, 'output')
  assert.equal(rows[2]?.dir, 'inout')
})

test('pcf parser accepts --warn-no-port from IceStudio files', () => {
  const rows = pcfTextToRows('set_io --warn-no-port BTN1 31 # input\n')
  assert.deepEqual(rows, [{ name: 'BTN1', pin: '31', dir: 'input' }])
})

test('example custom PCF hydrates form rows', () => {
  const rows = pcfTextToRows(EXAMPLE_CUSTOM_PCF)
  assert.equal(rows.length, 15)
  assert.deepEqual(rows[0], { name: 'BTN0_', pin: '20', dir: 'input' })
  assert.equal(rows.find((row) => row.name === 'LED0')?.pin, '30')
  assert.equal(rows.find((row) => row.name === 'CLK12')?.dir, 'input')
  assert.equal(rows.find((row) => row.name === 'TX')?.dir, 'output')
  assert.equal(rows.find((row) => row.name === 'GPIO0')?.dir, 'inout')
})
