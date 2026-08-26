/**
 * FTDI MPSSE + SPI flash/SRAM commands ported from IceStorm iceprog.c.
 * Copyright (C) 2015 Claire Xenia Wolf, 2018 Piotr Esden-Tempski (ISC).
 * https://github.com/YosysHQ/icestorm — notice in web/public/THIRD_PARTY_NOTICES.md
 */
import {
  FLASH_DUMP_CHUNK,
  FTDI_BULK_PACKET,
  ftdiBulkInRequestLength,
  ftdiPayloadFromBulkIn,
  flashReadSliceSizes,
  spiReadChunkSizes,
} from '@/fpga/ftdiUsb'
import {
  PIN_DATA_IN,
  cdoneMask,
  iceprogSramReleaseCs,
  ftdiPid,
  ftdiVid,
  iceprogBitbangDirection,
  iceprogBitbangValue,
  iceprogChipDeselect,
  iceprogChipSelect,
  iceprogReleaseBus,
  iceprogSramSelect,
} from '@/fpga/iceprogPins'
import { getActiveAdbus } from '@/fpga/activeBoard'
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
const MPSSE_READ_POS = 0x20
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

/**
 * Purge FTDI RX and TX buffers.  After a short-read stall (common on
 * Windows 10 WinUSB), old data may sit in the FTDI FIFO.  Purging before
 * a retry avoids reading stale bytes on the next transferIn.
 */
async function purgeBuffers(device: USBDevice): Promise<void> {
  await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_RX)
  await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_TX)
}

function isShortRead(err: unknown): boolean {
  return err instanceof Error && /short FTDI read/.test(err.message)
}

function isStalledRead(err: unknown): boolean {
  return (
    isShortRead(err) ||
    (err instanceof Error && /transferIn (timeout|failed)/.test(err.message))
  )
}

/**
 * Latches when a host truncates bulk-IN that spans more than one FTDI packet
 * (seen on some Windows 10 WinUSB stacks). Cleared by `spiInit`.
 */
let bulkInStreamingBroken = false

async function send(device: USBDevice, bytes: number[]): Promise<void> {
  await device.transferOut(OUT_EP, new Uint8Array(bytes))
}

/**
 * The MPSSE reads a plain byte stream, so several commands ride in ONE
 * bulk-OUT. Every USB round trip we skip here is ~0.3 ms off every page.
 */
function frame(...parts: (number[] | Uint8Array)[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let off = 0
  for (const part of parts) {
    out.set(part instanceof Uint8Array ? part : new Uint8Array(part), off)
    off += part.length
  }
  return out
}

function gpioCmd(spec: { value: number; direction: number }): number[] {
  return [MC_SETB_LOW, spec.value, spec.direction]
}

function lenLo(n: number): number[] {
  return [(n - 1) & 0xff, ((n - 1) >> 8) & 0xff]
}

async function recv(device: USBDevice, want = 1): Promise<Uint8Array> {
  const result = await Promise.race([
    device.transferIn(IN_EP, ftdiBulkInRequestLength(want)),
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

/** How long we tolerate status-only packets before calling the pipe stalled. */
const FTDI_IDLE_MS = 300

async function recvExact(device: USBDevice, nbytes: number): Promise<Uint8Array> {
  const out = new Uint8Array(nbytes)
  let off = 0
  let idleUntil = Date.now() + FTDI_IDLE_MS
  while (off < nbytes) {
    const payload = await recv(device, nbytes - off)
    if (payload.length === 0) {
      if (Date.now() > idleUntil) {
        throw new Error(`short FTDI read: got ${off} of ${nbytes}`)
      }
      await sleep(2)
      continue
    }
    idleUntil = Date.now() + FTDI_IDLE_MS
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

/**
 * CS low -> full-duplex xfer -> flush -> CS high, all in one bulk-OUT.
 * Deasserting CS in the same frame is safe: the reply already sits in the
 * FTDI read FIFO, which does not care about the SPI pins.
 */
async function spiCsWriteRead(
  device: USBDevice,
  payload: Uint8Array,
): Promise<Uint8Array> {
  await device.transferOut(
    OUT_EP,
    frame(
      gpioCmd(iceprogChipSelect()),
      [MPSSE_WRITE_READ, ...lenLo(payload.length)],
      payload,
      [MC_FLUSH],
      gpioCmd(iceprogChipDeselect()),
    ),
  )
  return recvExact(device, payload.length)
}

/**
 * One CS pulse per payload, write-only, all in one bulk-OUT. Passing several
 * payloads chains them (e.g. write-enable + page program) without extra USB.
 */
async function spiCsWrite(
  device: USBDevice,
  ...payloads: Uint8Array[]
): Promise<void> {
  const parts: (number[] | Uint8Array)[] = []
  for (const payload of payloads) {
    if (payload.length === 0) continue
    parts.push(
      gpioCmd(iceprogChipSelect()),
      [MPSSE_WRITE_NEG, ...lenLo(payload.length)],
      payload,
      gpioCmd(iceprogChipDeselect()),
    )
  }
  if (parts.length === 0) return
  await device.transferOut(OUT_EP, frame(...parts))
}

/**
 * MPSSE 0x20 clocks data *in* only: no command byte shares the packet with the
 * data, so nothing depends on where a 64-byte FTDI packet happens to end.
 */
async function spiRead(device: USBDevice, count: number): Promise<Uint8Array> {
  const n = count - 1
  await send(device, [MPSSE_READ_POS, n & 0xff, (n >> 8) & 0xff, MC_FLUSH])
  return recvExact(device, count)
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

/** Covers a full chip erase (seconds) without hanging forever on a dead pipe. */
const FLASH_WAIT_TIMEOUT_MS = 40_000

/** How many EEPROM word reads to keep in flight. Enough to hide USB latency. */
const EEPROM_BATCH = 16

function pageProgramCmd(addr: number, data: Uint8Array): Uint8Array {
  if (data.length === 0 || data.length > 256) {
    throw new Error('page must be 1–256 bytes')
  }
  const cmd = new Uint8Array(4 + data.length)
  cmd[0] = FLASH_PP
  cmd[1] = (addr >> 16) & 0xff
  cmd[2] = (addr >> 8) & 0xff
  cmd[3] = addr & 0xff
  cmd.set(data, 4)
  return cmd
}

/**
 * One 0x03 with CS held low: the flash keeps streaming while we clock, so a
 * whole chunk costs one command plus a handful of full-size bulk-IN reads
 * instead of ~5 USB round trips per 58 bytes.
 */
async function flashReadStream(
  device: USBDevice,
  addr: number,
  count: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(count)
  const cmd = new Uint8Array([
    FLASH_READ,
    (addr >> 16) & 0xff,
    (addr >> 8) & 0xff,
    addr & 0xff,
  ])
  try {
    // CS low and the 0x03 command travel together; the data streams after.
    await device.transferOut(
      OUT_EP,
      frame(
        gpioCmd(iceprogChipSelect()),
        [MPSSE_WRITE_NEG, ...lenLo(cmd.length)],
        cmd,
      ),
    )
    let off = 0
    for (const n of spiReadChunkSizes(count, FLASH_DUMP_CHUNK)) {
      out.set(await spiRead(device, n), off)
      off += n
    }
    await csDeassert(device)
  } catch (err) {
    try {
      await csDeassert(device)
    } catch {
      // never let the cleanup hide why the read failed
    }
    throw err
  }
  return out
}

/**
 * Conservative path: command + data never leave one 64-byte FTDI packet, so
 * the host never has to reassemble a bulk-IN. Slow, but it survives Windows 10.
 */
async function flashReadPerPacket(
  device: USBDevice,
  addr: number,
  count: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(count)
  let off = 0
  for (const n of flashReadSliceSizes(count)) {
    const at = addr + off
    const payload = new Uint8Array(4 + n)
    payload[0] = FLASH_READ
    payload[1] = (at >> 16) & 0xff
    payload[2] = (at >> 8) & 0xff
    payload[3] = at & 0xff

    let rx: Uint8Array
    try {
      await csAssert(device)
      rx = await spiWriteRead(device, payload)
      await csDeassert(device)
    } catch (err) {
      if (!isShortRead(err)) throw err
      // Windows 10 WinUSB short-read: purge + retry once
      try {
        await purgeBuffers(device)
        await csDeassert(device)
        await sleep(10)
        await csAssert(device)
        rx = await spiWriteRead(device, payload)
        await csDeassert(device)
      } catch {
        // Retry also failed — throw the original for better diagnostics
        throw err
      }
    }

    out.set(rx.subarray(4), off)
    off += n
  }
  return out
}

/**
 * Bit-bang de configuracion slave por ADBUS2.
 *
 * El motor de datos del MPSSE transmite SOLO por ADBUS1, y en el cableado
 * estandar ADBUS1 comparte net con el SPI_SO de la FPGA (una salida). La
 * entrada de datos de la FPGA (SPI_SI) esta en el net de ADBUS2, que el MPSSE
 * usa como entrada.
 *
 * Pero el comando 0x80 (SET_BITS_LOW) fija valor Y direccion de los ocho pines
 * de ADBUS sin excluir ninguno (FTDI AN_108). Si el motor respeta ese bit de
 * direccion para ADBUS2, podemos manejarlo como GPIO y clockear el bitstream a
 * mano. Eso es lo que hay aca.
 */

/** Los 4 estados posibles de un bit: [dato][reloj]. Se precalculan una vez. */
function bitbangStates(): number[] {
  return [
    iceprogBitbangValue(false, false),
    iceprogBitbangValue(false, true),
    iceprogBitbangValue(true, false),
    iceprogBitbangValue(true, true),
  ]
}

/** Comandos MPSSE por transferOut. Cada byte del bitstream cuesta 48. */
const BITBANG_USB_CHUNK = 32768

export type Adbus2Probe = {
  /** true si el pad siguio lo que le pedimos en los dos sentidos. */
  drives: boolean
  rawLow: number
  rawHigh: number
}

/**
 * Antes de mandar 135 KB: ¿este FT2232H nos deja manejar ADBUS2 como salida?
 *
 * Se hace con la FPGA en reset (sus pines de configuracion sueltos) y con CS
 * arriba (flash deseleccionada, su DO en alta impedancia), asi que nadie mas
 * maneja el net y la lectura significa algo. Si el pad sigue el valor en los dos
 * sentidos, el MPSSE respeta la direccion; si lee 1 en los dos casos, el pin
 * quedo flotando en el pull-up y el motor ignoro el bit.
 */
export async function probeAdbus2Drive(device: USBDevice): Promise<Adbus2Probe> {
  const map = getActiveAdbus()
  // CS como entrada (pull-up = flash deseleccionada), CRESET manejado abajo.
  const direction =
    (1 << map.sck) | PIN_DATA_IN | (1 << map.creset)

  await send(device, [MC_SETB_LOW, PIN_DATA_IN, direction, MC_READB_LOW, MC_FLUSH])
  const high = (await recvExact(device, 1))[0] ?? 0

  await send(device, [MC_SETB_LOW, 0, direction, MC_READB_LOW, MC_FLUSH])
  const low = (await recvExact(device, 1))[0] ?? 0

  return {
    drives: (high & PIN_DATA_IN) !== 0 && (low & PIN_DATA_IN) === 0,
    rawHigh: high,
    rawLow: low,
  }
}

/**
 * Clockea el bitstream por ADBUS2 en modo SPI 0: el dato se pone con SCK abajo
 * y se muestrea en el flanco de subida. CS queda abajo todo el shift y CRESET
 * arriba, igual que en la secuencia de iceprog.
 */
export async function bitbangSramShift(
  device: USBDevice,
  payload: Uint8Array,
  onProgress?: (done: number) => void,
): Promise<void> {
  const direction = iceprogBitbangDirection()
  const state = bitbangStates()
  const buf = new Uint8Array(BITBANG_USB_CHUNK)
  let n = 0

  const flush = async (): Promise<void> => {
    if (n === 0) return
    await device.transferOut(OUT_EP, buf.subarray(0, n))
    n = 0
  }

  for (let i = 0; i < payload.length; i++) {
    const byte = payload[i] ?? 0
    for (let bit = 7; bit >= 0; bit--) {
      const data = (byte >> bit) & 1
      buf[n++] = MC_SETB_LOW
      buf[n++] = state[data * 2] ?? 0
      buf[n++] = direction
      buf[n++] = MC_SETB_LOW
      buf[n++] = state[data * 2 + 1] ?? 0
      buf[n++] = direction
    }
    if (n + 48 > BITBANG_USB_CHUNK) {
      await flush()
      onProgress?.(i + 1)
      // Le damos aire al event loop para que la barra de progreso se mueva.
      await sleep(0)
    }
  }
  await flush()
  onProgress?.(payload.length)
}

/** Deja el bus como lo espera la secuencia slave: CS abajo, CRESET arriba, SCK abajo. */
export async function bitbangSlaveEdge(device: USBDevice): Promise<void> {
  await send(device, [
    MC_SETB_LOW,
    iceprogBitbangValue(false, false),
    iceprogBitbangDirection(),
  ])
}

/**
 * Camino rapido: modo bitbang nativo del FT2232H.
 *
 * En MPSSE cada cambio de pin cuesta un comando `0x80 valor direccion` que el
 * motor tiene que parsear: 6 bytes por bit y ~311 k comandos/s medidos. En modo
 * bitbang no hay comandos — **cada byte escrito ES el estado de los ocho
 * pines**— asi que son 2 bytes por bit (16 por byte de bitstream en vez de 48) y
 * el ritmo lo marca el generador de baudios.
 *
 * En bitbang asincronico los pines se actualizan a baud x 16 (FTDI AN232R-01).
 * Elegimos 750 kbaud sobre la base de 120 MHz de la serie H: 12 MHz de toggle,
 * o sea 6 MHz de reloj SPI, el mismo que usa iceprog y bien adentro de los
 * 25 MHz que acepta la iCE40 en slave.
 *
 * Si el USB no llega a alimentar esa velocidad, el FTDI simplemente se queda sin
 * datos y **los pines mantienen el ultimo estado**. Para la configuracion slave
 * eso es inofensivo: es sincrona, CS se queda abajo y no hay reloj minimo. Los
 * huecos solo alargan el shift, no lo rompen.
 */

const SIO_SET_BAUDRATE = 0x03
const BITMODE_RESET = 0x00
const BITMODE_BITBANG = 0x01

/**
 * Divisor de baudios para el bitbang, sobre la base de 120 MHz de la serie H.
 * El indice lleva el bit 0x0200 (base /10 = 12 MHz) y la interfaz A.
 *
 *   wValue   divisor   baud
 *   0x0010      16     750 k   <- actual
 *   0x0008       8     1,5 M
 *   0x0004       4     3 M
 *   0x0002       2     6 M
 *   0x0000       -     12 M (maximo)
 *
 * NO es el cuello: iceram.c usa 25000 baud (divisor 480, treinta veces mas
 * lento) y aun asi va mas rapido. Los dos estamos limitados por el throughput
 * de USB, no por el generador. El lever es pipelineDepth, no este numero.
 */
export const BITBANG_BAUD_VALUE = 0x0010
const BITBANG_BAUD_INDEX = 0x0201

/** Bytes de estados de pines por transferOut. Cada byte del bitstream cuesta 16. */
const BITBANG_MODE_CHUNK = 32768

function vendorOutIndex(
  device: USBDevice,
  request: number,
  value: number,
  index: number,
): Promise<USBOutTransferResult> {
  return device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request,
    value,
    index,
  })
}

/**
 * Vuelve a MPSSE sin resetear la FPGA que acabamos de configurar.
 *
 * La primera version usaba mascara 0xff al reentrar a MPSSE, y eso pone los
 * ocho pines como SALIDAS con el latch en 0: manejaba CRESET abajo y borraba la
 * configuracion antes de poder leer CDONE. Con mascara 0x00 los pines quedan
 * como entrada; en ese hueco CRESET lo sostiene el pull-up de la placa, que
 * sabemos que existe porque el boot master depende de el.
 *
 * Ademas hay que purgar los FIFOs: si quedan bytes del bitbang, el MPSSE los
 * parsea como comandos y el chip queda inservible hasta el proximo enchufe.
 * Purgamos RX y TX pero NO mandamos SIO_RESET_SIO, que glitchea los pines.
 */
async function leaveBitbangMode(device: USBDevice): Promise<void> {
  await vendorOut(device, SIO_SET_BITMODE, (BITMODE_RESET << 8) | 0x00)
  await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_RX)
  await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_TX)
  await vendorOut(device, SIO_SET_BITMODE, (BITMODE_MPSSE << 8) | 0x00)
  const hold = iceprogSramReleaseCs()
  await send(device, [
    MC_TCK_D5,
    MC_SETB_LOW,
    hold.value,
    hold.direction,
    MC_SET_CLK_DIV,
    0,
    0,
  ])
}

/**
 * Configuracion slave completa en modo bitbang: el flanco de CRESET tambien se
 * hace aca adentro, para no depender de un cambio de modo en el medio.
 *
 * Precondicion: la FPGA en reset y la flash en deep power-down. El latch de
 * salida del bitbang arranca en 0 (CS abajo, CRESET abajo, SCK abajo), que es
 * exactamente el estado de reset, asi que el arranque no glitchea nada.
 */
export type BitbangModeOptions = {
  /**
   * SCK en reposo alto = modo 3, lo que usan `iceram.c` y openFPGALoader.
   * Jesus Arias sostiene que la iCE40 lo necesita para slave; nuestro camino por
   * GPIO del MPSSE anda con reposo bajo (modo 0), asi que no sabemos si el modo
   * 0 es tolerado o si estamos en un margen.
   */
  clockIdleHigh: boolean
  /**
   * Subir SS despues del flanco de CRESET para deseleccionar la flash, como
   * hace `iceram.c`. SPI_SS_B solo se muestrea en ese flanco, asi que despues
   * se puede soltar. Evita tener que dormir la NOR con 0xB9 — y evita el modo
   * de falla "placa congelada" cuando algo se corta a mitad de camino.
   */
  raiseSsAfterEdge: boolean
  /** Cuantos transferOut dejar en vuelo. 1 = secuencial (como estaba). */
  pipelineDepth: number
  /** Vaciar el endpoint IN durante el shift (ver nota de contrapresion). */
  drainIn: boolean
  /** Tamano de cada transferOut, en bytes de estados de pines. */
  chunkBytes: number
  /**
   * Divisor de baudios crudo (wValue). Mas chico = mas rapido.
   * 0x0010 es el punto de partida medido; ver BITBANG_BAUD_VALUE.
   */
  baudValue: number
}

export const BITBANG_MODE_DEFAULTS: BitbangModeOptions = {
  clockIdleHigh: true,
  raiseSsAfterEdge: true,
  pipelineDepth: 1,
  drainIn: false,
  chunkBytes: BITBANG_MODE_CHUNK,
  baudValue: BITBANG_BAUD_VALUE,
}

/**
 * Lee el estado de los pines SIN salir del modo bitbang.
 *
 * En bitbang asincronico el FT2232 muestrea ADBUS continuamente hacia el FIFO
 * de lectura, asi que un transferIn devuelve el estado real — incluido CDONE.
 * (Este documento afirmaba antes que hacia falta bitbang sincronico para esto;
 * era falso, y `iceram.c` lo hace con un ftdi_read_data de un byte.)
 *
 * Purgamos RX primero para no leer muestras viejas: el FIFO viene lleno de
 * estados de hace milisegundos.
 */
export async function readPinsFromBitbang(device: USBDevice): Promise<number> {
  for (let intento = 0; intento < 5; intento++) {
    await vendorOut(device, SIO_RESET_REQUEST, SIO_RESET_PURGE_RX)
    await sleep(3)
    const res = await device.transferIn(IN_EP, FTDI_BULK_PACKET)
    if (res.status === 'ok' && res.data) {
      const raw = new Uint8Array(
        res.data.buffer,
        res.data.byteOffset,
        res.data.byteLength,
      )
      const muestras = ftdiPayloadFromBulkIn(raw)
      if (muestras.length > 0) return muestras[muestras.length - 1] ?? 0
    }
  }
  throw new Error('bitbang: no llegaron muestras de pines')
}

/**
 * Configuracion slave completa en modo bitbang del FTDI.
 *
 * Sigue la secuencia de `iceram.c` (J. Arias, 2017), que es la referencia que
 * funciona: el flanco de CRESET se hace adentro del modo, SS sube despues del
 * flanco para sacar la flash del bus, y la salida deja los pines como entrada
 * sin cambiar de modo.
 *
 * Precondicion: la FPGA en reset. El latch de salida del bitbang arranca en 0
 * (todo abajo), que es el estado de reset, y ademas escribimos ese estado dos
 * veces para garantizar el ancho minimo del pulso.
 *
 * Devuelve el ADBUS leido despues de los 49 clocks, sin haber salido del modo.
 */
export type BitbangShiftStats = {
  /** ADBUS leido despues de los 49 clocks, sin haber salido del modo. */
  pins: number
  /** Milisegundos armando los estados de pines en JS. */
  msArmado: number
  /** Milisegundos adentro de transferOut. */
  msUsb: number
}

export async function bitbangModeSramShift(
  device: USBDevice,
  payload: Uint8Array,
  opts: BitbangModeOptions,
  onProgress?: (done: number) => void,
): Promise<BitbangShiftStats> {
  const direction = iceprogBitbangDirection()
  const map = getActiveAdbus()
  const sck = 1 << map.sck
  const creset = 1 << map.creset
  const ss = 1 << map.cs

  const reposo = opts.clockIdleHigh ? sck : 0
  // Durante el shift: CRESET arriba siempre; SS arriba solo si lo soltamos.
  const base = creset | (opts.raiseSsAfterEdge ? ss : 0)
  // [dato][reloj] — el dato se pone con SCK abajo y se muestrea al subir.
  const v = [base, base | sck, base | PIN_DATA_IN, base | PIN_DATA_IN | sck]

  // Si estos control transfers no se aceptan, el divisor nunca se aplica y el
  // barrido de velocidad sale plano — que es exactamente lo que vimos.
  const rBaud = await vendorOutIndex(
    device,
    SIO_SET_BAUDRATE,
    opts.baudValue,
    BITBANG_BAUD_INDEX,
  )
  const rModo = await vendorOut(
    device,
    SIO_SET_BITMODE,
    (BITMODE_BITBANG << 8) | direction,
  )
  if (rBaud.status !== 'ok' || rModo.status !== 'ok') {
    throw new Error(
      `bitbang: el FTDI rechazo la configuracion (baud=${rBaud.status}, bitmode=${rModo.status})`,
    )
  }

  try {
    // Reset sostenido: SS abajo, CRESET abajo, SCK en su nivel de reposo.
    // Dos muestras = ancho minimo garantizado (iceram.c hace lo mismo).
    await device.transferOut(OUT_EP, new Uint8Array([reposo, reposo]))
    await sleep(2)

    // EL FLANCO: CRESET sube con SS todavia abajo -> la FPGA entra en slave.
    await device.transferOut(OUT_EP, new Uint8Array([creset | reposo]))
    // Los pines mantienen el estado mientras esperamos: es el tiempo que la
    // FPGA necesita para limpiar su CRAM (>1200 us segun el datasheet).
    await sleep(10)

    if (opts.raiseSsAfterEdge) {
      // Ya latcheo el modo: soltamos SS y la flash queda deseleccionada.
      await device.transferOut(OUT_EP, new Uint8Array([base | reposo]))
      await sleep(1)
    }

    const tope = Math.max(64, opts.chunkBytes)
    const buf = new Uint8Array(tope)
    let n = 0
    let msArmado = 0
    let msUsb = 0
    let bloques = 0
    const enVuelo: Promise<USBOutTransferResult>[] = []
    const profundidad = Math.max(1, opts.pipelineDepth)

    const flush = async (): Promise<void> => {
      if (n === 0) return
      const t = performance.now()
      // Copia: el buffer se reutiliza y con transferOut encolados el original
      // se pisaria antes de que el navegador lo lea.
      enVuelo.push(device.transferOut(OUT_EP, buf.slice(0, n)))
      n = 0
      while (enVuelo.length >= profundidad) await enVuelo.shift()
      msUsb += performance.now() - t
      bloques += 1
      // En bitbang asincronico el chip tambien muestrea los pines hacia el FIFO
      // de lectura. Si nadie lo vacia se llena, y ese trafico IN puede estar
      // compitiendo con nuestro OUT. Vaciarlo dice si eso nos frena.
      if (opts.drainIn && bloques % 8 === 0) {
        try {
          await device.transferIn(IN_EP, FTDI_BULK_PACKET * 8)
        } catch {
          // si no hay nada que leer, seguimos
        }
      }
    }

    let tArmado = performance.now()
    for (let i = 0; i < payload.length; i++) {
      const byte = payload[i] ?? 0
      for (let bit = 7; bit >= 0; bit--) {
        const data = (byte >> bit) & 1
        buf[n++] = v[data * 2] ?? 0
        buf[n++] = v[data * 2 + 1] ?? 0
      }
      if (n + 16 > tope) {
        msArmado += performance.now() - tArmado
        await flush()
        onProgress?.(i + 1)
        tArmado = performance.now()
      }
    }
    msArmado += performance.now() - tArmado
    await flush()
    while (enVuelo.length > 0) await enVuelo.shift()
    onProgress?.(payload.length)

    // Los 49 clocks del datasheet, para que los pines de usuario cobren vida.
    const cola = new Uint8Array(49 * 2)
    for (let i = 0; i < 49; i++) {
      cola[i * 2] = v[0] ?? 0
      cola[i * 2 + 1] = v[1] ?? 0
    }
    await device.transferOut(OUT_EP, cola)

    // La lectura que importa, todavia adentro del bitbang. CDONE no sube en el
    // mismo instante en que termina el shift, asi que hay que darle tiempo:
    // una sola muestra lo agarra todavia en 0 y miente.
    const cdoneBit = 1 << map.cdone
    let pines = 0
    const limite = Date.now() + 300
    do {
      pines = await readPinsFromBitbang(device)
      if (pines & cdoneBit) break
    } while (Date.now() < limite)
    return { pins: pines, msArmado, msUsb }
  } finally {
    await leaveBitbangMode(device)
  }
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
    bulkInStreamingBroken = false
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

  /**
   * The FTDI EEPROM only reads one 16-bit word per control transfer, so 256 B
   * means 128 of them. Awaiting one at a time serialised 128 USB round trips;
   * Chrome pipelines them happily, and each word is an independent request.
   */
  async readEeprom(device, bytes = 256) {
    const words = Math.max(1, Math.ceil(bytes / 2))
    const out = new Uint8Array(words * 2)
    const readWord = async (i: number): Promise<void> => {
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
    for (let base = 0; base < words; base += EEPROM_BATCH) {
      const batch: Promise<void>[] = []
      for (let i = base; i < Math.min(base + EEPROM_BATCH, words); i++) {
        batch.push(readWord(i))
      }
      await Promise.all(batch)
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
    await spiCsWrite(device, new Uint8Array([FLASH_RPD]))
  },

  async flashPowerDown(device) {
    await spiCsWrite(device, new Uint8Array([FLASH_PD]))
  },

  async flashReadId(device) {
    const rx = await spiCsWriteRead(
      device,
      new Uint8Array([FLASH_READ_ID, 0, 0, 0]),
    )
    return rx.subarray(1)
  },

  async flashReadStatus(device) {
    const rx = await spiCsWriteRead(device, new Uint8Array([FLASH_RDSR, 0]))
    return rx[1] ?? 0xff
  },

  async flashWriteEnable(device) {
    await spiCsWrite(device, new Uint8Array([FLASH_WE]))
  },

  /**
   * A W25X40 page program takes 0.7-3 ms. Polling every 10 ms threw away most
   * of that on every one of the ~530 pages of a bitstream, so poll flat out at
   * first and only back off for the slow ones (erase).
   */
  async flashWait(device) {
    const deadline = Date.now() + FLASH_WAIT_TIMEOUT_MS
    let polls = 0
    let gap = 0
    while (Date.now() < deadline) {
      const status = await this.flashReadStatus(device)
      if ((status & 0x01) === 0) return
      polls += 1
      if (polls >= 3) gap = gap === 0 ? 1 : Math.min(gap * 2, 10)
      if (gap > 0) await sleep(gap)
    }
    throw new Error('SPI flash timed out waiting for WIP=0')
  },

  async flashChipErase(device) {
    await spiCsWrite(device, new Uint8Array([FLASH_CE]))
  },

  async flashBlockErase64k(device, addr) {
    await spiCsWrite(
      device,
      new Uint8Array([
        FLASH_BE64,
        (addr >> 16) & 0xff,
        (addr >> 8) & 0xff,
        addr & 0xff,
      ]),
    )
  },

  async flashProgPage(device, addr, data) {
    await spiCsWrite(device, pageProgramCmd(addr, data))
  },

  /** Write-enable + page program in a single bulk-OUT: 6 USB writes down to 1. */
  async flashWriteEnableAndProgPage(device, addr, data) {
    await spiCsWrite(
      device,
      new Uint8Array([FLASH_WE]),
      pageProgramCmd(addr, data),
    )
  },

  async flashWriteByte(device, addr, value) {
    await this.flashWriteEnable(device)
    await this.flashProgPage(device, addr, new Uint8Array([value]))
    await this.flashWait(device)
  },

  async flashRead(device, addr, count) {
    if (count <= 0) return new Uint8Array()
    if (!bulkInStreamingBroken) {
      try {
        return await flashReadStream(device, addr, count)
      } catch (err) {
        if (!isStalledRead(err)) throw err
        // This host mangles multi-packet bulk-IN. Stay on the slow path.
        bulkInStreamingBroken = true
        try {
          await purgeBuffers(device)
          await csDeassert(device)
        } catch {
          // pipe already dead; the per-packet path reports the real error
        }
        await sleep(10)
      }
    }
    return flashReadPerPacket(device, addr, count)
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
