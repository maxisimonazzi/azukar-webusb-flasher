/**
 * FTDI MPSSE + SPI flash/SRAM commands ported from IceStorm iceprog.c.
 * Copyright (C) 2015 Claire Xenia Wolf, 2018 Piotr Esden-Tempski (ISC).
 * https://github.com/YosysHQ/icestorm — notice in web/public/THIRD_PARTY_NOTICES.md
 */
import { ftdiBulkInRequestLength, ftdiPayloadFromBulkIn, flashReadSliceSizes } from '@/fpga/ftdiUsb'
import {
  cdoneMask,
  ftdiPid,
  ftdiVid,
  iceprogChipDeselect,
  iceprogChipSelect,
  iceprogReleaseBus,
  iceprogSramSelect,
} from '@/fpga/iceprogPins'
import type { Ice40Mpsse } from '@/fpga/types'

const INTERFACE_A = 1
const OUT_EP = 0x02
const IN_EP = 0x01

const SIO_RESET_REQUEST = 0
const SIO_RESET_SIO = 0
const SIO_RESET_PURGE_RX = 1
const SIO_RESET_PURGE_TX = 2
const SIO_SET_LATENCY = 0x09
const SIO_SET_BITMODE = 0x0b
const BITMODE_MPSSE = 0x02

const MC_SETB_LOW = 0x80
const MC_READB_LOW = 0x81
const MC_SET_CLK_DIV = 0x86
const MC_FLUSH = 0x87
const MC_TCK_D5 = 0x8b
const MC_CLK_N = 0x8e
const MC_CLK_N8 = 0x8f
const MPSSE_WRITE_NEG = 0x11
const MPSSE_WRITE_READ = 0x31
const SIO_READ_EEPROM = 0x90

const FLASH_RPD = 0xab
const FLASH_PD = 0xb9
const FLASH_READ_ID = 0x9f
const FLASH_PP = 0x02
const FLASH_READ = 0x03
const FLASH_WE = 0x06
const FLASH_RDSR = 0x05
const FLASH_BE64 = 0xd8
const FLASH_CE = 0xc7

function vendorOut(
  device: USBDevice,
  request: number,
  value: number,
): Promise<USBOutTransferResult> {
  return device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request,
    value,
    index: INTERFACE_A,
  })
}

async function send(device: USBDevice, bytes: number[]): Promise<void> {
  await device.transferOut(OUT_EP, new Uint8Array(bytes))
}

async function recv(device: USBDevice): Promise<Uint8Array> {
  const result = await Promise.race([
    device.transferIn(IN_EP, ftdiBulkInRequestLength()),
    sleep(4000).then(() => {
      throw new Error('FTDI transferIn timeout (4s)')
    }),
  ])
  if (result.status !== 'ok' || !result.data) {
    throw new Error('FTDI transferIn failed')
  }
  const raw = new Uint8Array(
    result.data.buffer,
    result.data.byteOffset,
    result.data.byteLength,
  )
  return ftdiPayloadFromBulkIn(raw)
}

async function recvExact(device: USBDevice, nbytes: number): Promise<Uint8Array> {
  const out = new Uint8Array(nbytes)
  let off = 0
  let empty = 0
  while (off < nbytes) {
    const payload = await recv(device)
    if (payload.length === 0) {
      empty += 1
      if (empty > 80) {
        throw new Error(`short FTDI read: got ${off} of ${nbytes}`)
      }
      await sleep(2)
      continue
    }
    empty = 0
    const n = Math.min(payload.length, nbytes - off)
    out.set(payload.subarray(0, n), off)
    off += n
  }
  return out
}

async function setGpio(
  device: USBDevice,
  value: number,
  direction: number,
): Promise<void> {
  await send(device, [MC_SETB_LOW, value, direction])
}

function applyGpio(
  device: USBDevice,
  spec: { value: number; direction: number },
): Promise<void> {
  return setGpio(device, spec.value, spec.direction)
}

function csAssert(device: USBDevice): Promise<void> {
  return applyGpio(device, iceprogChipSelect())
}

function csDeassert(device: USBDevice): Promise<void> {
  return applyGpio(device, iceprogChipDeselect())
}

const SPI_WRITE_CHUNK = 4096

async function spiWriteChunk(device: USBDevice, payload: Uint8Array): Promise<void> {
  if (payload.length === 0) return
  const n = payload.length - 1
  const header = new Uint8Array([MPSSE_WRITE_NEG, n & 0xff, (n >> 8) & 0xff])
  const frame = new Uint8Array(header.length + payload.length)
  frame.set(header, 0)
  frame.set(payload, header.length)
  await device.transferOut(OUT_EP, frame)
}

/** MPSSE 0x11 length is 16-bit: one command cannot clock more than 65536 B. */
async function spiWrite(device: USBDevice, payload: Uint8Array): Promise<void> {
  for (let off = 0; off < payload.length; off += SPI_WRITE_CHUNK) {
    await spiWriteChunk(
      device,
      payload.subarray(off, Math.min(off + SPI_WRITE_CHUNK, payload.length)),
    )
  }
}

async function spiWriteRead(
  device: USBDevice,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const n = payload.length - 1
  const header = new Uint8Array([MPSSE_WRITE_READ, n & 0xff, (n >> 8) & 0xff])
  const frame = new Uint8Array(header.length + payload.length)
  frame.set(header, 0)
  frame.set(payload, header.length)
  await device.transferOut(OUT_EP, frame)
  await send(device, [MC_FLUSH])
  return recvExact(device, payload.length)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const mpsse: Ice40Mpsse = {
  async connect() {
    if (!navigator.usb) {
      throw new Error('WebUSB vive en Chrome o Edge, en localhost o HTTPS.')
    }
    return navigator.usb.requestDevice({
      filters: [{ vendorId: ftdiVid(), productId: ftdiPid() }],
    })
  },

  async disconnect(device, opts) {
    const forget = opts?.forget !== false
    const resetUsb = opts?.resetUsb === true
    if (resetUsb) {
      try {
        await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_SIO)
        await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_RX)
        await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_TX)
      } catch {
        // pipe already dead
      }
      try {
        if (typeof device.reset === 'function') await device.reset()
      } catch {
        // WinUSB already gone
      }
    } else if (device.opened) {
      try {
        await applyGpio(device, iceprogReleaseBus())
      } catch {
        // already gone
      }
    }
    try {
      await device.releaseInterface(0)
    } catch {
      // already released
    }
    try {
      if (device.opened) await device.close()
    } catch {
      // already closed
    }
    if (forget && typeof device.forget === 'function') {
      try {
        await device.forget()
      } catch {
        // Chrome < 101
      }
    }
  },

  async initialize(device) {
    await device.open()
    await device.selectConfiguration(1)
    await device.claimInterface(0)
  },

  async spiInit(device, clkDiv) {
    await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_SIO)
    await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_RX)
    await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_TX)
    await vendorOut(device, SIO_SET_LATENCY, 1)
    await vendorOut(device, SIO_SET_BITMODE, (BITMODE_MPSSE << 8) | 0xff)
    await send(device, [MC_TCK_D5])
    const div = clkDiv ?? 0
    await send(device, [MC_SET_CLK_DIV, div & 0xff, (div >> 8) & 0xff])
  },

  setGpio,

  async readPins(device) {
    await send(device, [MC_READB_LOW, MC_FLUSH])
    const raw = await recvExact(device, 1)
    return raw[0] ?? 0
  },

  async readEeprom(device, bytes = 256) {
    const words = Math.max(1, Math.ceil(bytes / 2))
    const out = new Uint8Array(words * 2)
    for (let i = 0; i < words; i++) {
      const res = await device.controlTransferIn(
        {
          requestType: 'vendor',
          recipient: 'device',
          request: SIO_READ_EEPROM,
          value: 0,
          index: i,
        },
        2,
      )
      if (res.status !== 'ok' || !res.data || res.data.byteLength < 2) {
        throw new Error(`FTDI EEPROM read failed at word ${i}`)
      }
      out[i * 2] = res.data.getUint8(0)
      out[i * 2 + 1] = res.data.getUint8(1)
    }
    return out.subarray(0, bytes)
  },

  flashCsAssert: (device) => csAssert(device),
  flashCsDeassert: (device) => csDeassert(device),

  fpgaResetAssert(device) {
    return applyGpio(device, iceprogChipDeselect())
  },

  fpgaResetDeassert(device) {
    return applyGpio(device, iceprogReleaseBus())
  },

  async setResetPin(device, level) {
    if (level) return applyGpio(device, iceprogReleaseBus())
    return applyGpio(device, iceprogChipDeselect())
  },

  async fpgaGetCdone(device) {
    const pins = await this.readPins(device)
    return pins & cdoneMask() ? 1 : 0
  },

  async flashReleasePowerDown(device) {
    await csAssert(device)
    await spiWrite(device, new Uint8Array([FLASH_RPD]))
    await csDeassert(device)
  },

  async flashPowerDown(device) {
    await csAssert(device)
    await spiWrite(device, new Uint8Array([FLASH_PD]))
    await csDeassert(device)
  },

  async flashReadId(device) {
    await csAssert(device)
    const rx = await spiWriteRead(
      device,
      new Uint8Array([FLASH_READ_ID, 0, 0, 0]),
    )
    await csDeassert(device)
    return rx.subarray(1)
  },

  async flashReadStatus(device) {
    await csAssert(device)
    const rx = await spiWriteRead(device, new Uint8Array([FLASH_RDSR, 0]))
    await csDeassert(device)
    return rx[1] ?? 0xff
  },

  async flashWriteEnable(device) {
    await csAssert(device)
    await spiWrite(device, new Uint8Array([FLASH_WE]))
    await csDeassert(device)
  },

  async flashWait(device) {
    for (let i = 0; i < 4000; i++) {
      const status = await this.flashReadStatus(device)
      if ((status & 0x01) === 0) return
      await sleep(10)
    }
    throw new Error('SPI flash timed out waiting for WIP=0')
  },

  async flashChipErase(device) {
    await csAssert(device)
    await spiWrite(device, new Uint8Array([FLASH_CE]))
    await csDeassert(device)
  },

  async flashBlockErase64k(device, addr) {
    await csAssert(device)
    await spiWrite(
      device,
      new Uint8Array([
        FLASH_BE64,
        (addr >> 16) & 0xff,
        (addr >> 8) & 0xff,
        addr & 0xff,
      ]),
    )
    await csDeassert(device)
  },

  async flashProgPage(device, addr, data) {
    if (data.length === 0 || data.length > 256) {
      throw new Error('page must be 1–256 bytes')
    }
    await csAssert(device)
    const cmd = new Uint8Array(4 + data.length)
    cmd[0] = FLASH_PP
    cmd[1] = (addr >> 16) & 0xff
    cmd[2] = (addr >> 8) & 0xff
    cmd[3] = addr & 0xff
    cmd.set(data, 4)
    await spiWrite(device, cmd)
    await csDeassert(device)
  },

  async flashWriteByte(device, addr, value) {
    await this.flashWriteEnable(device)
    await this.flashProgPage(device, addr, new Uint8Array([value]))
    await this.flashWait(device)
  },

  async flashRead(device, addr, count) {
    if (count <= 0) return new Uint8Array()
    const out = new Uint8Array(count)
    let off = 0
    for (const n of flashReadSliceSizes(count)) {
      await csAssert(device)
      const payload = new Uint8Array(4 + n)
      payload[0] = FLASH_READ
      const at = addr + off
      payload[1] = (at >> 16) & 0xff
      payload[2] = (at >> 8) & 0xff
      payload[3] = at & 0xff
      const rx = await spiWriteRead(device, payload)
      out.set(rx.subarray(4), off)
      off += n
      await csDeassert(device)
    }
    return out
  },

  async flashRead8(device, addr) {
    const bytes = await this.flashRead(device, addr, 1)
    return bytes[0] ?? 0xff
  },

  sramReset(device) {
    return applyGpio(device, iceprogChipSelect())
  },

  sramSelect(device) {
    return applyGpio(device, iceprogSramSelect())
  },

  sramSend(device, data) {
    return spiWrite(device, data)
  },

  async sramDummyClocks(device) {
    await send(device, [MC_CLK_N8, 5, 0x00])
    await send(device, [MC_CLK_N, 0x00])
  },
}
