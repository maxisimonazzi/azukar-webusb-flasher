/** FTDI bulk-IN packets always start with 2 modem-status bytes. */

export function ftdiPacketPayload(packet: Uint8Array): Uint8Array {
  if (packet.length < 2) {
    throw new Error(`short FTDI packet: got ${packet.length}`)
  }
  return packet.subarray(2)
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
