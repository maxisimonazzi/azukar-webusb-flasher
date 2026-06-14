import assert from 'node:assert/strict'
import { test } from 'node:test'

import { UART_BAUD_DEFAULT, UART_BAUDS, UART_SERIAL_FILTERS, appendUartText, clipUartText } from './uart.ts'

test('default baud is 115200 and it is in the list', () => {
  assert.equal(UART_BAUD_DEFAULT, 115200)
  assert.equal(UART_BAUDS.includes(UART_BAUD_DEFAULT), true)
})

test('WebSerial filter is the same FT2232H as the programmer (0x0403/0x6010)', () => {
  assert.deepEqual(UART_SERIAL_FILTERS, [{ usbVendorId: 0x0403, usbProductId: 0x6010 }])
})

test('appendUartText concatenates and clips the tail', () => {
  const next = appendUartText('hola', ' mundo')
  assert.equal(next, 'hola mundo')
  const clipped = clipUartText('x'.repeat(90_000), 80_000)
  assert.equal(clipped.length, 80_000)
  assert.equal(clipped.endsWith('x'), true)
})

test('form feed wipes the console even if it arrives split across chunks', () => {
  const mid = appendUartText('Hola UART - 9\r\n', 'Hola UART - 10\r\n\fHol')
  assert.equal(mid, 'Hol')
  assert.equal(appendUartText(mid, 'a UART - 1\r\n'), 'Hola UART - 1\r\n')
})
