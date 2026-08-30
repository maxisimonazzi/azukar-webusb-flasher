/** WebSerial on FTDI channel B. Channel A (WebUSB/MPSSE) stays untouched. */

import { getActivePid, getActiveVid } from './activeBoard.ts'

export const UART_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600] as const
export type UartBaud = (typeof UART_BAUDS)[number]
export const UART_BAUD_DEFAULT: UartBaud = 115200
export const UART_TEXT_MAX = 80_000

/** Same FT2232H as the active board (default 0x0403 / 0x6010). */
export const UART_SERIAL_FILTERS = [{ usbVendorId: 0x0403, usbProductId: 0x6010 }]

export function uartSerialFilters(): { usbVendorId: number; usbProductId: number }[] {
  return [{ usbVendorId: getActiveVid(), usbProductId: getActivePid() }]
}

export function clipUartText(text: string, max = UART_TEXT_MAX): string {
  if (text.length <= max) return text
  return text.slice(-max)
}

export function appendUartText(prev: string, chunk: string, max = UART_TEXT_MAX): string {
  if (!chunk) return prev
  const combined = prev + chunk
  const ff = combined.lastIndexOf('\f')
  if (ff >= 0) return clipUartText(combined.slice(ff + 1), max)
  return clipUartText(combined, max)
}

export function hasWebSerial(): boolean {
  return typeof navigator !== 'undefined' && navigator.serial != null
}

export type UartSession = {
  close(): Promise<void>
  /** Manda texto por el TX del canal B. `false` si el puerto no deja escribir. */
  write(text: string): Promise<boolean>
  canWrite: boolean
}

export async function openUartSession(opts: {
  baudRate: number
  /** Los bytes crudos alimentan la vista hex; el texto ya viene decodificado. */
  onChunk: (bytes: Uint8Array, text: string) => void
  onDisconnect: () => void
}): Promise<UartSession> {
  if (!hasWebSerial()) {
    throw new Error('NEED_WEB_SERIAL')
  }
  const port = await navigator.serial!.requestPort({ filters: uartSerialFilters() })
  const serialOptions: SerialOptions = {
    baudRate: opts.baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  }

  try {
    await port.open(serialOptions)
  } catch (err: unknown) {
    const isAlreadyOpen =
      (err instanceof DOMException && err.name === 'InvalidStateError') ||
      (err instanceof Error && err.message.toLowerCase().includes('already open'))
    if (isAlreadyOpen) {
      try {
        await port.close()
        await port.open(serialOptions)
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }

  if (!port.readable) {
    try {
      await port.close()
    } catch {
      /* ignore */
    }
    throw new Error('UART_NO_READABLE')
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let keepReading = true
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let closed = false

  const finished = async () => {
    if (closed) return
    closed = true
    keepReading = false
    if (reader) {
      try {
        await reader.cancel()
      } catch {
        /* already released or closed */
      }
    }
    if (writer) {
      try {
        writer.releaseLock()
      } catch {
        /* already released */
      }
      writer = null
    }
    try {
      await readLoopPromise
    } catch {
      /* ignore */
    }
    try {
      await port.close()
    } catch {
      /* ignore */
    }
    opts.onDisconnect()
  }

  port.addEventListener('disconnect', () => {
    void finished()
  })

  const readLoopPromise = (async () => {
    while (port.readable && keepReading) {
      try {
        reader = port.readable.getReader()
      } catch {
        break
      }
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            keepReading = false
            break
          }
          if (value && value.length) {
            opts.onChunk(value, decoder.decode(value, { stream: true }))
          }
        }
      } catch (err) {
        // Non-fatal read errors: FramingError, BufferOverrunError, BreakError, ParityError
        // (common when baud rate is mismatched or noise on the line).
        // Releasing the reader lock allows port.readable to construct a new stream for the next iteration.
        console.warn('WebSerial read error (framing/parity/overrun):', err)
      } finally {
        try {
          reader.releaseLock()
        } catch {
          /* already released */
        }
        reader = null
      }
    }
  })()

  void readLoopPromise.then(async () => {
    if (!closed && keepReading) {
      await finished()
    }
  })

  return {
    get canWrite() {
      return Boolean(port.writable && !closed)
    },
    async write(text: string) {
      if (!port.writable || !text || closed) return false
      try {
        writer = port.writable.getWriter()
        await writer.write(encoder.encode(text))
        return true
      } catch {
        return false
      } finally {
        if (writer) {
          try {
            writer.releaseLock()
          } catch {
            /* already released */
          }
          writer = null
        }
      }
    },
    async close() {
      if (closed) return
      closed = true
      keepReading = false
      if (reader) {
        try {
          await reader.cancel()
        } catch {
          /* already closed */
        }
      }
      if (writer) {
        try {
          writer.releaseLock()
        } catch {
          /* already released */
        }
        writer = null
      }
      try {
        await readLoopPromise
      } catch {
        /* already closed */
      }
      try {
        await port.close()
      } catch {
        /* already closed */
      }
      try {
        await port.forget()
      } catch {
        /* older Chrome */
      }
    },
  }
}
