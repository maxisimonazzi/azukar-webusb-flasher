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
}

const PCF = 'set_io LED0 37\n'
const pcfFile = { name: 'pins.pcf', content: PCF }

test('buildCompileJob writes Verilog, PCF and the same argv as the container', () => {
  const job = buildCompileJob(
    [
      { name: 'top_module.v', content: 'module top_module; endmodule' },
      { name: 'uart_tx.v', content: 'module uart_tx; endmodule' },
      pcfFile,
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
  assert.equal(job.files['pins.pcf'], PCF)
  assert.match(job.files['top_module.v'] ?? '', /module top_module/)
})

test('buildCompileJob rejects a project without a .pcf', () => {
  assert.throws(
    () => buildCompileJob([{ name: 'top.v', content: 'module top; endmodule' }], 'top', board),
    { message: 'COMPILE_NO_PCF' },
  )
})

test('buildCompileJob rejects an empty .pcf', () => {
  assert.throws(
    () =>
      buildCompileJob(
        [
          { name: 'top.v', content: 'module top; endmodule' },
          { name: 'pins.pcf', content: '   \n' },
        ],
        'top',
        board,
      ),
    { message: 'COMPILE_NO_PCF' },
  )
})

test('a single .pcf under another name is the constraint file', () => {
  const job = buildCompileJob(
    [
      { name: 'top.v', content: 'module top; endmodule' },
      { name: 'azukar.pcf', content: PCF },
    ],
    'top',
    board,
  )
  assert.equal(job.nextpnrArgs[job.nextpnrArgs.indexOf('--pcf') + 1], 'azukar.pcf')
})

test('more than one .pcf is an error, even if one is pins.pcf', () => {
  assert.throws(
    () =>
      buildCompileJob(
        [
          { name: 'top.v', content: 'module top; endmodule' },
          { name: 'old.pcf', content: 'set_io LED0 1\n' },
          pcfFile,
        ],
        'top',
        board,
      ),
    { message: 'COMPILE_MANY_PCF' },
  )
})

test('buildCompileJob rejects a top that is not a Verilog identifier', () => {
  assert.throws(
    () =>
      buildCompileJob(
        [{ name: 'top.v', content: 'module top; endmodule' }, pcfFile],
        'top-module',
        board,
      ),
    { message: 'COMPILE_BAD_INPUT' },
  )
})

test('buildCompileJob rejects a file that is too large', () => {
  assert.throws(
    () =>
      buildCompileJob(
        [{ name: 'top.v', content: 'm'.repeat(MAX_FILE_CHARS + 1) }, pcfFile],
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

test('buildCompileJob includes .txt files in tree but only passes .v to yosysArgs', () => {
  const job = buildCompileJob(
    [
      { name: 'top_module.v', content: 'module top_module; endmodule' },
      { name: 'rom.txt', content: 'DEADBEEF\n' },
      pcfFile,
    ],
    'top_module',
    board,
  )
  assert.deepEqual(job.yosysArgs, [
    '-Q',
    '-p',
    'synth_ice40 -top top_module -json out.json',
    'top_module.v',
  ])
  assert.equal(job.files['rom.txt'], 'DEADBEEF\n')
})
