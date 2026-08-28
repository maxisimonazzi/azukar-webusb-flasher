/**
 * Iceprog-style flash program + FPGA config reset, over the MPSSE in `mpsse.ts`.
 * Sequence follows IceStorm iceprog.c (flash pages, iceprog -S SRAM slave).
 * Copyright (C) 2015 Claire Xenia Wolf, 2018 Piotr Esden-Tempski (ISC).
 * https://github.com/YosysHQ/icestorm — notice in web/public/THIRD_PARTY_NOTICES.md
 */
import { compareBins, describeDiff, type BinDiff } from '@/fpga/binCompare'
import { FLASH_DUMP_CHUNK } from '@/fpga/ftdiUsb'
import {
  elapsedLine,
  nowMs,
} from '@/fpga/elapsed'
import { formatHexDump } from '@/fpga/flashDump'
import {
  flashSizeFromJedec,
  hexBytes,
  ice40FlashPlan,
  trimIce40Image,
} from '@/fpga/flashPlan'
import {
  formatAdbusPins,
  iceprogSramReleaseCs,
  iceprogSramSelect,
} from '@/fpga/iceprogPins'
import {
  bitbangModeSramShift,
  bitbangSlaveEdge,
  bitbangSramShift,
  mpsse,
  probeAdbus2Drive,
} from '@/fpga/mpsse'
import type {
  ProgramLog,
  ProgramProgress,
  ProgramStats,
} from '@/fpga/types'

const FLASH_READ_CHUNK = FLASH_DUMP_CHUNK

type ConnectionListener = (connected: boolean) => void
const listeners = new Set<ConnectionListener>()

function wrapUsbError(step: string, err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err)
  const transfer =
    /controlTransferOut|transfer error|NetworkError|not functioning/i.test(raw)
  const claim = /claim interface|Unable to claim/i.test(raw)
  if (transfer || claim) {
    return new Error(
      `${step}: ${raw}. ` +
        'Chrome ya vio la placa; el USB lo habla ESTA PC (no el contenedor). ' +
        'En Windows, Zadig → Options → List All Devices → ' +
        '"USB Serial Converter A" (Interface 0) → WinUSB (no libusbK). ' +
        'Cerrá iceprog/terminales COM. chrome://device-log → driver=WinUSB.',
    )
  }
  return new Error(`${step}: ${raw}`)
}

/**
 * Envuelve un paso USB para que, si falla, el error diga en que etapa fue.
 * No loguea: el nombre del paso es contexto de error, no algo que le sirva a
 * quien esta usando la placa.
 */
async function usbStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw wrapUsbError(name, err)
  }
}

function now(): number {
  return nowMs()
}

/** Closing stopwatch line for a long task. Fires on success and on failure. */
function logElapsed(
  log: ProgramLog,
  task: string,
  t0: number,
  opts?: { bytes?: number; failed?: boolean },
): number {
  const ms = now() - t0
  log(elapsedLine(task, ms, opts))
  return ms
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

let session: USBDevice | null = null

export function isMpsseConnected(): boolean {
  return Boolean(session?.opened)
}

export function onMpsseConnectionChange(fn: ConnectionListener): () => void {
  listeners.add(fn)
  fn(isMpsseConnected())
  return () => {
    listeners.delete(fn)
  }
}

function notifyConnection(): void {
  const open = isMpsseConnected()
  for (const fn of listeners) fn(open)
}

function rememberSession(device: USBDevice | null): void {
  session = device
  notifyConnection()
}

if (typeof navigator !== 'undefined' && navigator.usb) {
  navigator.usb.addEventListener('disconnect', (ev) => {
    if (session && ev.device === session) rememberSession(null)
  })
}

export async function closeMpsseSession(
  opts?: { forget?: boolean; resetUsb?: boolean },
): Promise<void> {
  const device = session
  rememberSession(null)
  if (device) {
    await mpsse.disconnect(device, {
      forget: opts?.forget ?? false,
      resetUsb: opts?.resetUsb ?? true,
    })
  }
}

/** Nombre legible de la flash a partir del JEDEC ID. */
function describeJedec(id: Uint8Array): string {
  const hex = hexBytes(id)
  if (hex.startsWith('EF 30 13')) return `${hex} (W25X40, 4 Mbit)`
  if (hex.startsWith('EF 40 16')) return `${hex} (W25Q32, 32 Mbit)`
  return hex
}

async function openMpsse(
  log: ProgramLog,
  opts?: { forcePicker?: boolean },
): Promise<USBDevice> {
  if (session?.opened && !opts?.forcePicker) {
    return session
  }
  if (opts?.forcePicker && session) {
    await closeMpsseSession({ forget: true, resetUsb: false })
  }
  log('Elegí la placa en el diálogo del navegador.')
  const device = await usbStep('USB — el navegador pide qué placa', () =>
    mpsse.connect(opts),
  )
  log(
    `Conectada: ${[device.manufacturerName, device.productName, device.serialNumber].filter(Boolean).join(' ')}`,
  )
  if (!device.opened) {
    await usbStep('open + claim interfaz 0 (canal A)', () =>
      mpsse.initialize(device),
    )
    await usbStep('MPSSE init (primer controlTransferOut / WinUSB)', () =>
      mpsse.spiInit(device),
    )
  }
  rememberSession(device)
  return device
}

export async function connectMpsse(
  log: ProgramLog,
  opts?: { forcePicker?: boolean },
): Promise<void> {
  const device = await openMpsse(log, opts)
  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    log(`Flash detectada: ${describeJedec(id)}`)
    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function disconnectMpsse(log: ProgramLog): Promise<void> {
  if (!session) {
    log('No había ninguna placa conectada.')
    return
  }
  log('Desconectada.')
  await closeMpsseSession({ forget: true, resetUsb: false })
}

export async function programIce40Flash(
  bin: Uint8Array,
  log: ProgramLog,
  onProgress?: ProgramProgress,
): Promise<ProgramStats> {
  if (bin.length === 0) {
    throw new Error('empty bitstream')
  }
  const payload = trimIce40Image(bin)
  if (payload.length === 0) {
    throw new Error('ese .bin está vacío o es un dump de flash borrada (todo 0xFF)')
  }
  if (payload.length !== bin.length) {
    log(
      `Era un dump de chip entero: recorté ${bin.length} → ${payload.length} bytes. El 0xFF del final no se graba.`,
    )
  }
  const plan = ice40FlashPlan(payload.length)
  const t0 = now()
  log(`Grabando en flash: ${payload.length} bytes.`)

  const device = await openMpsse(log)
  const tConnect = now()

  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    const flashIdHex = hexBytes(id)
    log(`Flash detectada: ${describeJedec(id)}`)

    const tErase0 = now()
    for (const addr of plan.eraseAddrs) {
      await mpsse.flashWriteEnable(device)
      await mpsse.flashBlockErase64k(device, addr)
      await mpsse.flashWait(device)

    }
    const tErase1 = now()

    const tProg0 = now()
    let n = 0
    for (const page of plan.pages) {
      const chunk = payload.subarray(page.addr, page.addr + page.length)
      await mpsse.flashWriteEnableAndProgPage(device, page.addr, chunk)
      await mpsse.flashWait(device)
      n += 1
      onProgress?.(n, plan.pages.length, 'flash')
    }
    const tProg1 = now()

    // Leer pasó a costar ~200x menos, así que verificamos el bitstream entero
    // y no los primeros 256 B, que casi no verificaban nada.
    const tVerify0 = now()
    let same = true
    let failAt = -1
    let failWrote = new Uint8Array()
    let failRead = new Uint8Array()
    for (let addr = 0; addr < payload.length && same; addr += FLASH_READ_CHUNK) {
      const nRead = Math.min(FLASH_READ_CHUNK, payload.length - addr)
      const readback = await mpsse.flashRead(device, addr, nRead)
      const expect = payload.subarray(addr, addr + nRead)
      if (readback.length !== nRead) {
        same = false
        failAt = addr
        failWrote = expect
        failRead = readback
        break
      }
      for (let i = 0; i < nRead; i++) {
        if (readback[i] !== expect[i]) {
          same = false
          failAt = addr + i
          failWrote = expect.subarray(i, i + 16)
          failRead = readback.subarray(i, i + 16)
          break
        }
      }
      onProgress?.(Math.min(addr + nRead, payload.length), payload.length, 'read')
      if (addr === 0) await sleep(0)
    }
    const tVerify1 = now()
    if (same) {
      log(`Verificación OK: los ${payload.length} bytes leídos coinciden.`)
    } else {
      log(
        `Verificación FALLIDA en el byte 0x${failAt.toString(16)}: esperaba ${hexBytes(failWrote, 16)} y leí ${hexBytes(failRead, 16)}.`,
      )
    }
    log(elapsedLine('Verificar flash', tVerify1 - tVerify0, { bytes: payload.length }))

    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
    const tCfg0 = now()
    await sleep(250)
    let cdone = await mpsse.fpgaGetCdone(device)
    for (let i = 0; i < 40 && !cdone; i++) {
      await sleep(50)
      cdone = await mpsse.fpgaGetCdone(device)
    }
    log(
      cdone
        ? 'FPGA configurada desde la flash (LED DONE encendido).'
        : 'La FPGA no arrancó: CDONE quedó en 0. Revisá el .bin y el cable.',
    )
    const t1 = now()
    log(elapsedLine('Grabar flash', t1 - t0, { bytes: payload.length }))

    const stats: ProgramStats = {
      flashIdHex,
      connectMs: Math.round(tConnect - t0),
      eraseMs: Math.round(tErase1 - tErase0),
      programMs: Math.round(tProg1 - tProg0),
      configureMs: Math.round(t1 - tCfg0),
      totalMs: Math.round(t1 - t0),
      bytes: payload.length,
      pages: plan.pages.length,
      sectors: plan.eraseAddrs.length,
    }
    return stats
  } catch (err) {
    logElapsed(log, 'Grabar flash', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

async function pollCdone(device: USBDevice, tries = 20, gapMs = 20): Promise<0 | 1> {
  let cdone = await mpsse.fpgaGetCdone(device)
  for (let i = 0; i < tries && !cdone; i++) {
    await sleep(gapMs)
    cdone = await mpsse.fpgaGetCdone(device)
  }
  return cdone
}

export type SramBitbangResult = {
  /** El FT2232H nos dejo manejar ADBUS2 como salida. */
  adbus2Drives: boolean
  cdone: 0 | 1
  bytes: number
}

/**
 * Configuracion slave bit-bangueando el bitstream por ADBUS2. Verificado:
 * levanta CDONE en el cableado de bus compartido tipo iCEstick.
 *
 * Contexto en docs/sram-slave-bitbang-adbus2.md. Resumen: el motor de
 * datos del MPSSE transmite solo por ADBUS1, que en este cableado comparte net
 * con el SPI_SO de la FPGA (una salida). La entrada de configuracion de la FPGA
 * (SPI_SI) esta en el net de ADBUS2. Este camino maneja ADBUS2 como GPIO y
 * clockea el bitstream a mano.
 *
 * No escribe la flash. La manda a deep power-down para que su DO quede en alta
 * impedancia y no pelee el net, y deja MOSI como entrada para no pelear con el
 * SPI_SO de la FPGA.
 */
export async function bitbangIce40Sram(
  bin: Uint8Array,
  log: ProgramLog,
  onProgress?: ProgramProgress,
  opts?: { fast?: boolean },
): Promise<SramBitbangResult> {
  const fast = opts?.fast === true
  // El camino rapido sube SS despues del flanco y saca la flash del bus, asi
  // que ahi no hace falta dormirla — y nos ahorramos el modo de falla "placa
  // congelada" cuando algo se corta a mitad de camino.
  const duermeFlash = !fast
  const payload = trimIce40Image(bin)
  if (payload.length === 0) {
    throw new Error('ese .bin está vacío o es un dump de flash borrada (todo 0xFF)')
  }

  const t0 = now()
  const device = await openMpsse(log)

  try {
    log(`Grabando en SRAM: ${payload.length} bytes. No toca la flash.`)

    // --- 0. ¿el chip nos deja manejar ADBUS2? --------------------------------
    await usbStep('CRESET=0 (FPGA en reset, suelta sus pines)', () =>
      mpsse.fpgaResetAssert(device),
    )
    await sleep(2)
    const probe = await probeAdbus2Drive(device)
    if (!probe.drives) {
      log(
        'Esta placa no deja manejar el pin de datos de configuración: ' +
          `pedí 1 y leí 0x${probe.rawHigh.toString(16).padStart(2, '0')}, ` +
          `pedí 0 y leí 0x${probe.rawLow.toString(16).padStart(2, '0')}.`,
      )
      log('Sin ese pin no se puede configurar por SRAM. Grabá en flash.')
      await mpsse.flashReleasePowerDown(device)
      await mpsse.fpgaResetDeassert(device)
      logElapsed(log, 'Grabar en SRAM', t0)
      return { adbus2Drives: false, cdone: 0, bytes: payload.length }
    }

    // --- 1. la flash fuera del camino ---------------------------------------
    await mpsse.flashReleasePowerDown(device)
    await mpsse.flashReadId(device)
    if (duermeFlash) {
      // La NOR comparte el net de datos: dormida deja su salida en alta Z.
      await mpsse.flashPowerDown(device)
    }
    await sleep(1)

    // --- 2. reset y flanco de modo ------------------------------------------
    await usbStep('CS+CRESET=0 — sram_reset()', () => mpsse.sramReset(device))
    await sleep(2)

    if (fast) {
      // El flanco de CRESET pasa a hacerse adentro del modo bitbang, para no
      // depender de un cambio de modo justo en el momento que decide master
      // contra slave.
      await bitbangModeSramShift(device, payload, (done) => {
        onProgress?.(done, payload.length, 'sram')
      })
    } else {
      await usbStep('CS=0 CRESET=1 con ADBUS2 como salida — flanco slave', () =>
        bitbangSlaveEdge(device),
      )
      await sleep(5)
      await bitbangSramShift(device, payload, (done) => {
        onProgress?.(done, payload.length, 'sram')
      })
      await mpsse.sramDummyClocks(device)
    }
    const cdone = await pollCdone(device)

    // --- 5. dejar la placa en un estado sano --------------------------------
    const idle = iceprogSramReleaseCs()
    await mpsse.setGpio(device, idle.value, idle.direction)
    const wake = iceprogSramSelect()
    await mpsse.setGpio(device, wake.value, wake.direction)
    await mpsse.sramSend(device, new Uint8Array([0xab]))
    await mpsse.setGpio(device, idle.value, idle.direction)

    if (cdone) {
      log('FPGA configurada en SRAM (LED DONE encendido). Se pierde al cortar la alimentación.')
    } else {
      log(
        `La FPGA no tomó el bitstream. Estado de los pines: ${formatAdbusPins(
          await mpsse.readPins(device),
        )}`,
      )
    }
    logElapsed(log, 'Grabar en SRAM', t0, { bytes: payload.length })
    return { adbus2Drives: true, cdone, bytes: payload.length }
  } catch (err) {
    // Una NOR dormida hace que el boot master falle y la placa parezca muerta.
    try {
      await mpsse.flashReleasePowerDown(device)
    } catch {
      // el pipe ya no responde; lo resuelve un desenchufe
    }
    logElapsed(log, 'Grabar en SRAM', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

export async function resetIce40FromFlash(log: ProgramLog): Promise<void> {
  const t0 = now()
  const device = await openMpsse(log)
  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await sleep(20)
    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const cdone = await mpsse.fpgaGetCdone(device)
    log(
      cdone
        ? 'FPGA recargada desde la flash (LED DONE encendido).'
        : 'La FPGA no arrancó: CDONE quedó en 0. ¿La flash tiene un bitstream?',
    )
    logElapsed(log, 'Reset desde flash', t0)
  } catch (err) {
    logElapsed(log, 'Reset desde flash', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

export async function eraseIce40Flash(log: ProgramLog): Promise<void> {
  const t0 = now()
  const device = await openMpsse(log)
  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    log('Borrando la flash entera. Puede tardar varios segundos.')
    await mpsse.flashWriteEnable(device)
    await mpsse.flashChipErase(device)
    await sleep(50)
    const tErase = now()
    let sawBusy = false
    let lastSpeak = -1000
    const maxMs = 40_000
    while (now() - tErase < maxMs) {
      const status = await mpsse.flashReadStatus(device)
      const wip = (status & 0x01) !== 0
      if (wip) sawBusy = true
      const elapsed = now() - tErase
      // Latido cada 2 s: sin esto un borrado de 7 s parece un cuelgue.
      if (elapsed - lastSpeak >= 2000) {
        log(`Borrando… ${Math.round(elapsed / 1000)} s`)
        lastSpeak = elapsed
      }
      if (!wip && sawBusy) break
      if (!wip && !sawBusy && elapsed >= 2000) break
      await sleep(100)
    }
    if (now() - tErase >= maxMs) {
      throw new Error('SPI flash timed out waiting for WIP=0')
    }
    const ms = Math.round(now() - tErase)
    const probe = await mpsse.flashRead(device, 0, 64)
    if (probe.some((b) => b !== 0xff)) {
      throw new Error(
        'chip erase terminó el WIP pero @0x0 no está en 0xFF; el borrado no se confirmó',
      )
    }
    log(`Flash borrada y verificada en ${ms} ms.`)
    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    logElapsed(log, 'Borrar flash', t0)
  } catch (err) {
    logElapsed(log, 'Borrar flash', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

export async function readIce40Flash(
  log: ProgramLog,
  onProgress?: ProgramProgress,
): Promise<Uint8Array> {
  const t0 = now()
  const device = await openMpsse(log)
  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    const size = flashSizeFromJedec(id)
    log(`Leyendo ${size} bytes de la flash (${describeJedec(id)}).`)
    const out = new Uint8Array(size)
    for (let addr = 0; addr < size; addr += FLASH_READ_CHUNK) {
      const n = Math.min(FLASH_READ_CHUNK, size - addr)
      out.set(await mpsse.flashRead(device, addr, n), addr)
      const done = addr + n
      onProgress?.(done, size, 'read')
      if (done % 4096 === 0) await sleep(0)
    }
    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    logElapsed(log, 'Leer flash', t0, { bytes: out.length })
    return out
  } catch (err) {
    logElapsed(log, 'Leer flash', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

/**
 * Relee de la flash solo lo que ocupa el bitstream y lo compara. Es la mitad
 * del ciclo que faltaba: "grabé" deja de ser una suposición. Lee `length`
 * bytes en vez de los 512 KiB del chip, así tarda lo mismo que grabar.
 */
export async function verifyIce40Flash(
  expected: Uint8Array,
  log: ProgramLog,
  onProgress?: ProgramProgress,
): Promise<BinDiff> {
  const payload = trimIce40Image(expected)
  if (payload.length === 0) throw new Error('no hay bitstream para verificar')
  const t0 = now()
  const device = await openMpsse(log)
  try {
    await usbStep('CRESET assert — mpsse.fpgaResetAssert', () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    const size = Math.min(payload.length, flashSizeFromJedec(id))
    log(`Verificando ${size} bytes contra la flash.`)
    const out = new Uint8Array(size)
    for (let addr = 0; addr < size; addr += FLASH_READ_CHUNK) {
      const n = Math.min(FLASH_READ_CHUNK, size - addr)
      out.set(await mpsse.flashRead(device, addr, n), addr)
      const done = addr + n
      onProgress?.(done, size, 'read')
      if (done % 4096 === 0) await sleep(0)
    }
    await usbStep('CS+CRESET high-Z — mpsse.fpgaResetDeassert', () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const diff = compareBins(payload, out)
    log(describeDiff(diff))
    logElapsed(log, 'Verificar flash', t0, { bytes: out.length })
    return diff
  } catch (err) {
    logElapsed(log, 'Verificar flash', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

export async function readFtdiConfigEeprom(log: ProgramLog): Promise<Uint8Array> {
  const t0 = now()
  const device = await openMpsse(log)
  try {
    const raw = await mpsse.readEeprom(device, 256)
    log('EEPROM de configuración del FTDI (256 bytes). No es la flash del bitstream.')
    log(formatHexDump(raw))
    logElapsed(log, 'Leer EEPROM del FTDI', t0, { bytes: raw.length })
    return raw
  } catch (err) {
    logElapsed(log, 'Leer EEPROM del FTDI', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}
