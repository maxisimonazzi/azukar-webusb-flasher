/** FTDI bulk-IN packets always start with 2 modem-status bytes (often 0x31 0x60). */

export const FTDI_BULK_PACKET = 64
export const FTDI_STATUS_BYTES = 2
export const FTDI_MAX_PAYLOAD = FTDI_BULK_PACKET - FTDI_STATUS_BYTES

/** SPI READ (0x03) + 24-bit address. Must stay in one FTDI packet with the data. */
export const FLASH_READ_CMD_BYTES = 4
export const FLASH_READ_MAX_DATA = FTDI_MAX_PAYLOAD - FLASH_READ_CMD_BYTES

/** Biggest bulk-IN we ask Chrome for: 256 whole FTDI packets. */
export const FTDI_MAX_BULK_IN = 256 * FTDI_BULK_PACKET

/**
 * Bytes per `flashRead` call in a dump. One 0x03 keeps CS low and the flash
 * streams the whole chunk, so this is a progress step, not a USB limit.
 */
export const FLASH_DUMP_CHUNK = 16384

/** MPSSE length fields are 16-bit: one read command clocks at most 65536 B. */
export const MPSSE_MAX_LEN = 65536

/** USB bytes needed to carry `payload` data bytes, status headers included. */
export function ftdiUsbBytesFor(payload: number): number {
  const packets = Math.max(1, Math.ceil(payload / FTDI_MAX_PAYLOAD))
  return packets * FTDI_BULK_PACKET
}

/**
 * WinUSB on Windows 10 truncates bulk-IN URBs that are not whole FTDI packets.
 * Always ask for a multiple of 64. Never `remaining + 2` when remaining is 6.
 */
export function ftdiBulkInRequestLength(want = FTDI_MAX_PAYLOAD): number {
  return Math.min(FTDI_MAX_BULK_IN, ftdiUsbBytesFor(want))
}

/** Split a read into MPSSE-sized commands; `max` never exceeds 65536. */
export function spiReadChunkSizes(count: number, max = FLASH_DUMP_CHUNK): number[] {
  const limit = Math.min(max, MPSSE_MAX_LEN)
  const sizes: number[] = []
  for (let n = count; n > 0; n -= limit) {
    sizes.push(Math.min(limit, n))
  }
  return sizes
}

export function flashReadSliceSizes(
  count: number,
  maxData = FLASH_READ_MAX_DATA,
): number[] {
  const sizes: number[] = []
  for (let n = count; n > 0; n -= maxData) {
    sizes.push(Math.min(maxData, n))
  }
  return sizes
}

export function ftdiPacketPayload(packet: Uint8Array): Uint8Array {
  if (packet.length < 2) {
    throw new Error(`short FTDI packet: got ${packet.length}`)
  }
  return packet.subarray(2)
}

export function splitFtdiPackets(
  raw: Uint8Array,
  packetSize = FTDI_BULK_PACKET,
): Uint8Array[] {
  const packets: Uint8Array[] = []
  for (let i = 0; i < raw.length; i += packetSize) {
    packets.push(raw.subarray(i, Math.min(i + packetSize, raw.length)))
  }
  return packets
}

export function concatFtdiPayloads(packets: Uint8Array[]): Uint8Array {
  const parts = packets.map(ftdiPacketPayload)
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const part of parts) {
    out.set(part, off)
    off += part.length
  }
  return out
}

/** Chrome may concatenate two USB packets in one transferIn. Strip every header. */
export function ftdiPayloadFromBulkIn(
  raw: Uint8Array,
  packetSize = FTDI_BULK_PACKET,
): Uint8Array {
  return concatFtdiPayloads(splitFtdiPackets(raw, packetSize))
}
