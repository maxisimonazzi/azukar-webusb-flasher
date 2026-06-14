/** Minimal Web Serial types for Chrome/Edge. */

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  forget(): Promise<void>
  addEventListener(type: 'disconnect', listener: () => void): void
}

interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface Navigator {
  serial?: Serial
}
