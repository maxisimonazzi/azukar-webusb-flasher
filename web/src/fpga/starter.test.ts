import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BLINKY_TOP, BLINKY_VERILOG, EDU_CIAA_VERILOG, FPGA_STARTER, UART_TX_VERILOG, starterForBoard } from './starter.ts'

test('starter top is top_module and ships uart_tx as a second file', () => {
  assert.equal(BLINKY_TOP, 'top_module')
  assert.deepEqual(
    FPGA_STARTER.map((f) => f.name),
    ['top_module.v', 'uart_tx.v'],
  )
  assert.equal(FPGA_STARTER.every((f) => f.open), true)
})

test('top_module instantiates uart_tx on pin TX at 115200', () => {
  assert.match(BLINKY_VERILOG, /module top_module/)
  assert.match(BLINKY_VERILOG, /\boutput TX\b/)
  assert.match(BLINKY_VERILOG, /uart_tx u_tx/)
  assert.match(BLINKY_VERILOG, /115200/)
  assert.match(UART_TX_VERILOG, /module uart_tx/)
  assert.match(UART_TX_VERILOG, /parameter BAUD\s*=\s*115200/)
})

test('EDU-CIAA starter is a 4-bit counter with BTN1 reset and UART', () => {
  const starter = starterForBoard('edu-ciaa-fpga')
  assert.equal(starter.top, 'top_module')
  assert.match(EDU_CIAA_VERILOG, /\binput  CLK\b/)
  assert.match(EDU_CIAA_VERILOG, /\binput  BTN1\b/)
  assert.match(EDU_CIAA_VERILOG, /\boutput LED3\b/)
  assert.doesNotMatch(EDU_CIAA_VERILOG, /BTN0_/)
  assert.match(EDU_CIAA_VERILOG, /if \(!BTN1\)/)
  assert.equal(starter.files[0]?.content, EDU_CIAA_VERILOG)
})
