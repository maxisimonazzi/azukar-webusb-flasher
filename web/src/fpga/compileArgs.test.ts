import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCompileJob,
  extractTreeFile,
  MAX_FILE_CHARS,
} from './compileArgs.ts'

const board = {
  device: 'hx8k',
  package: 'tq144:4k',
  pcf: 'set_io LED0 37\n',
}

test('buildCompileJob writes Verilog, PCF and the same argv as the container', () => {
  const job = buildCompileJob(
    [
      { name: 'top_module.v', content: 'module top_module; endmodule' },
      { name: 'uart_tx.v', content: 'module uart_tx; endmodule' },
    ],
    'top_module',
    board,
  )
  assert.deepEqual(job.yosysArgs, [
    '-Q',
    '-p',
    'synth_ice40 -top top_module -json out.json',
    'top_module.v',
    'uart_tx.v',
  ])
  assert.deepEqual(job.nextpnrArgs, [
    '--hx8k',
    '--package',
    'tq144:4k',
    '--json',
    'out.json',
    '--asc',
    'out.asc',
    '--pcf',
    'pins.pcf',
    '--report',
    'out.pnr',
  ])
  assert.deepEqual(job.icepackArgs, ['out.asc', 'out.bin'])
  assert.equal(job.files['pins.pcf'], board.pcf)
  assert.match(job.files['top_module.v'] ?? '', /module top_module/)
})

test('buildCompileJob rejects a missing PCF', () => {
  assert.throws(
    () => buildCompileJob([{ name: 'top.v', content: 'module top; endmodule' }], 'top', {
      ...board,
      pcf: '   \n',
    }),
    { message: 'COMPILE_BAD_INPUT' },
  )
})

test('buildCompileJob rejects a top that is not a Verilog identifier', () => {
  assert.throws(
    () =>
      buildCompileJob([{ name: 'top.v', content: 'module top; endmodule' }], 'top-module', board),
    { message: 'COMPILE_BAD_INPUT' },
  )
})

test('buildCompileJob rejects a file that is too large', () => {
  assert.throws(
    () =>
      buildCompileJob(
        [{ name: 'top.v', content: 'm'.repeat(MAX_FILE_CHARS + 1) }],
        'top',
        board,
      ),
    { message: 'COMPILE_TOO_LARGE' },
  )
})

test('extractTreeFile reads out.bin as bytes', () => {
  const bin = new Uint8Array([0x7e, 0xaa, 0x99])
  assert.deepEqual(extractTreeFile({ 'out.bin': bin, 'out.asc': 'x' }, 'out.bin'), bin)
  assert.equal(extractTreeFile({ 'out.bin': bin }, 'missing.bin'), null)
})
