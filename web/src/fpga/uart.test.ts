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

test('openUartSession recovers from framing/parity errors without terminating session', async () => {
  const enc = new TextEncoder()
  let currentStreamIndex = 0

  const stream1 = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode('foo'))
    },
    pull(controller) {
      currentStreamIndex = 1
      controller.error(new DOMException('Framing error', 'FramingError'))
    },
  })

  const stream2 = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode('bar'))
      controller.close()
    },
  })

  const streams = [stream1, stream2]

  let isPortOpen = false
  let portCloseCount = 0
  const mockPort = {
    get readable() {
      if (!isPortOpen) return null
      return streams[currentStreamIndex] ?? null
    },
    get writable() {
      return null
    },
    async open() {
      isPortOpen = true
    },
    async close() {
      isPortOpen = false
      portCloseCount++
    },
    async forget() {},
    addEventListener() {},
  }

  const originalSerial = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serial')
  Object.defineProperty(globalThis.navigator, 'serial', {
    configurable: true,
    value: {
      async requestPort() {
        return mockPort as unknown as SerialPort
      },
    },
  })

  const chunks: string[] = []
  let disconnected = false

  try {
    const { openUartSession } = await import('./uart.ts')
    const session = await openUartSession({
      baudRate: 115200,
      onChunk: (_bytes, text) => chunks.push(text),
      onDisconnect: () => {
        disconnected = true
      },
    })

    // Give background stream reader time to process both streams
    await new Promise((r) => setTimeout(r, 50))

    assert.deepEqual(chunks, ['foo', 'bar'])
    assert.equal(session.canWrite, false)

    await session.close()
    assert.equal(portCloseCount, 1)
    assert.equal(isPortOpen, false)
  } finally {
    if (originalSerial) {
      Object.defineProperty(globalThis.navigator, 'serial', originalSerial)
    } else {
      // @ts-expect-error cleanup
      delete globalThis.navigator.serial
    }
  }
})

test('openUartSession recovers if port was already open', async () => {
  let openAttempts = 0
  let isPortOpen = true
  let portCloseCount = 0

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })

  const mockPort = {
    get readable() {
      return isPortOpen ? stream : null
    },
    get writable() {
      return null
    },
    async open() {
      openAttempts++
      if (openAttempts === 1) {
        throw new DOMException("Failed to execute 'open' on 'SerialPort': The port is already open.", 'InvalidStateError')
      }
      isPortOpen = true
    },
    async close() {
      isPortOpen = false
      portCloseCount++
    },
    async forget() {},
    addEventListener() {},
  }

  const originalSerial = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serial')
  Object.defineProperty(globalThis.navigator, 'serial', {
    configurable: true,
    value: {
      async requestPort() {
        return mockPort as unknown as SerialPort
      },
    },
  })

  try {
    const { openUartSession } = await import('./uart.ts')
    const session = await openUartSession({
      baudRate: 115200,
      onChunk: () => {},
      onDisconnect: () => {},
    })

    assert.equal(openAttempts, 2)
    assert.equal(portCloseCount, 1)
    await session.close()
    assert.equal(portCloseCount, 2)
  } finally {
    if (originalSerial) {
      Object.defineProperty(globalThis.navigator, 'serial', originalSerial)
    } else {
      // @ts-expect-error cleanup
      delete globalThis.navigator.serial
    }
  }
})

