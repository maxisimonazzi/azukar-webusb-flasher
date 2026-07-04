/** FTDI bulk-IN packets always start with 2 modem-status bytes (often 0x31 0x60). */

export const FTDI_BULK_PACKET = 64

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
