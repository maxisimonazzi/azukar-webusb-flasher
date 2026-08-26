import assert from 'node:assert/strict'
import { test } from 'node:test'

import { elapsedLine, formatDuration, formatThroughput } from './elapsed.ts'

test('durations read like a stopwatch, not like a float', () => {
  assert.equal(formatDuration(0), '0 ms')
  assert.equal(formatDuration(819.6), '820 ms')
  assert.equal(formatDuration(1000), '1.00 s')
  assert.equal(formatDuration(3412), '3.41 s')
  assert.equal(formatDuration(42_300), '42.3 s')
  assert.equal(formatDuration(72_300), '1 min 12.3 s')
  assert.equal(formatDuration(-5), '0 ms')
})

test('throughput only shows up when bytes actually moved', () => {
  assert.equal(formatThroughput(0, 100), '')
  assert.equal(formatThroughput(100, 0), '')
  assert.equal(formatThroughput(1024, 1000), '1.0 KiB/s')
  assert.equal(formatThroughput(4 * 1024 * 1024, 1000), '4.00 MiB/s')
})

test('the closing line names the task, the time and (if any) the rate', () => {
  assert.equal(elapsedLine('Leer flash', 2000, { bytes: 524288 }), '[tiempo] Leer flash: 2.00 s (256.0 KiB/s)')
  assert.equal(elapsedLine('Compilar', 5400), '[tiempo] Compilar: 5.40 s')
  assert.equal(
    elapsedLine('Grabar flash', 1000, { failed: true }),
    '[tiempo] Grabar flash: 1.00 s — cortado por un error',
  )
})
