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
  await port.open({
    baudRate: opts.baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  })
  if (!port.readable) {
    try {
      await port.close()
    } catch {
      /* ignore */
    }
    throw new Error('UART_NO_READABLE')
  }
  const decoder = new TextDecoder()
  const reader = port.readable.getReader()
  let closed = false
  const finished = () => {
    if (closed) return
    closed = true
    opts.onDisconnect()
  }
  port.addEventListener('disconnect', finished)
  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value && value.length) {
          opts.onChunk(value, decoder.decode(value, { stream: true }))
        }
      }
    } catch {
      /* unplug or cancel */
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* already released */
      }
      finished()
    }
  })()
  const encoder = new TextEncoder()
  return {
    canWrite: Boolean(port.writable),
    async write(text: string) {
      if (!port.writable || !text) return false
      const writer = port.writable.getWriter()
      try {
        await writer.write(encoder.encode(text))
        return true
      } finally {
        try {
          writer.releaseLock()
        } catch {
          /* already released */
        }
      }
    },
    async close() {
      closed = true
      try {
        await reader.cancel()
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
