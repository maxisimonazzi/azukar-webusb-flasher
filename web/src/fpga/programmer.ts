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
  formatDuration,
  formatThroughput,
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
  BITBANG_MODE_DEFAULTS,
  type BitbangModeOptions,
  type BitbangShiftStats,
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

async function step<T>(
  name: string,
  log: ProgramLog,
  fn: () => Promise<T>,
): Promise<T> {
  log(`… ${name}`)
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

async function openMpsse(
  log: ProgramLog,
  opts?: { forcePicker?: boolean },
): Promise<USBDevice> {
  if (session?.opened && !opts?.forcePicker) {
    log('[mpsse] sesión USB ya abierta (sin picker)')
    return session
  }
  if (opts?.forcePicker && session) {
    await closeMpsseSession({ forget: true, resetUsb: false })
  }
  const device = await step('USB — Chrome pide qué placa', log, () =>
    mpsse.connect(opts),
  )
  log(
    `[mpsse] USB ${device.manufacturerName ?? '?'} ${device.productName ?? '?'} ${device.serialNumber ?? ''}`,
  )
  if (!device.opened) {
    await step('open + claim interfaz 0 (canal A)', log, () =>
      mpsse.initialize(device),
    )
    await step('MPSSE init (primer controlTransferOut / WinUSB)', log, () =>
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
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    log(`[mpsse] JEDEC ${hexBytes(id)} — mpsse.flashReadId (placa viva)`)
    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
      mpsse.fpgaResetDeassert(device),
    )
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function disconnectMpsse(log: ProgramLog): Promise<void> {
  if (!session) {
    log('[mpsse] ya estaba desconectada')
    return
  }
  log('[mpsse] desconectando (suelto el bus y olvido el permiso de Chrome)')
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
      `[mpsse] dump de chip: recorté ${bin.length} → ${payload.length} B (0xFF al final). Eso es lo que icepack graba; el .bin de 512 KiB no bootea.`,
    )
  }
  const plan = ice40FlashPlan(payload.length)
  const t0 = now()
  log(`[mpsse] bitstream ${payload.length} bytes, ${plan.eraseAddrs.length} sectors, ${plan.pages.length} pages`)

  const device = await openMpsse(log)
  const tConnect = now()

  try {
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    log(`[mpsse] flash wake 0xAB — mpsse.flashReleasePowerDown`)
    const id = await mpsse.flashReadId(device)
    const flashIdHex = hexBytes(id)
    const jedecNote =
      flashIdHex.startsWith('EF 30 13')
        ? 'W25X40 4 Mbit — OK para Azukar'
        : flashIdHex.startsWith('EF 40 16')
          ? 'W25Q32 — típico Alhambra'
          : 'compará con el datasheet de la flash'
    log(`[mpsse] JEDEC ID ${flashIdHex} — mpsse.flashReadId (${jedecNote})`)

    const tErase0 = now()
    for (const addr of plan.eraseAddrs) {
      log(`[mpsse] erase 64 KiB @ 0x${addr.toString(16)} — mpsse.flashBlockErase64k`)
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
      if (n === 1 || n === plan.pages.length || n % 25 === 0) {
        log(
          `[mpsse] programmed page ${n}/${plan.pages.length} @ 0x${page.addr.toString(16)}`,
        )
      }
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
      log(
        `[mpsse] verify OK — ${payload.length} B leídos y comparados byte a byte @0 ${hexBytes(payload, 16)}`,
      )
    } else {
      log(
        `[mpsse] verify FAIL @0x${failAt.toString(16)} (esperaba ${hexBytes(failWrote, 16)} leyó ${hexBytes(failRead, 16)})`,
      )
    }
    log(elapsedLine('Verificar flash', tVerify1 - tVerify0, { bytes: payload.length }))

    const cdoneHeld = await mpsse.fpgaGetCdone(device)
    log(
      `[mpsse] CDONE while CRESET held=${cdoneHeld} — mpsse.fpgaGetCdone (esperado 0)`,
    )

    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
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
      `[mpsse] CDONE=${cdone}${cdone ? ' (FPGA configurada; LED DONE on)' : ' — timeout, revisá el .bin / el cable'}`,
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
    log(
      `[mpsse] timings connect=${stats.connectMs}ms erase=${stats.eraseMs}ms program=${stats.programMs}ms cfg=${stats.configureMs}ms total=${stats.totalMs}ms`,
    )
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
  opts?: { fast?: boolean } & Partial<BitbangModeOptions>,
): Promise<SramBitbangResult> {
  const fast = opts?.fast === true
  const modo: BitbangModeOptions = { ...BITBANG_MODE_DEFAULTS, ...opts }
  // iceram.c sube SS despues del flanco para sacar la flash del bus; ahi no
  // hace falta dormirla, y nos ahorramos el modo de falla "placa congelada".
  const duermeFlash = !(fast && modo.raiseSsAfterEdge)
  const payload = trimIce40Image(bin)
  if (payload.length === 0) {
    throw new Error('ese .bin está vacío o es un dump de flash borrada (todo 0xFF)')
  }

  const t0 = now()
  const device = await openMpsse(log)

  try {
    log(
      `[bitbang] slave por ADBUS2 — ${payload.length} B (no escribe la flash)` +
        (fast ? ' — modo bitbang del FTDI' : ' — GPIO del MPSSE'),
    )

    // --- 0. ¿el chip nos deja manejar ADBUS2? --------------------------------
    await step('CRESET=0 (FPGA en reset, suelta sus pines)', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await sleep(2)
    const probe = await probeAdbus2Drive(device)
    log(
      `[bitbang] sonda ADBUS2: pedido 1 → leí 0x${probe.rawHigh.toString(16).padStart(2, '0')}` +
        `, pedido 0 → leí 0x${probe.rawLow.toString(16).padStart(2, '0')}`,
    )
    if (!probe.drives) {
      log(
        '[bitbang] El MPSSE IGNORA el bit de dirección de ADBUS2: el pin quedó flotando en el pull-up.',
      )
      log(
        '[bitbang] Este camino está cerrado. Queda el plan B: modo bitbang del FTDI (SIO_SET_BITMODE).',
      )
      await mpsse.flashReleasePowerDown(device)
      await mpsse.fpgaResetDeassert(device)
      logElapsed(log, 'Bit-bang SRAM', t0)
      return { adbus2Drives: false, cdone: 0, bytes: payload.length }
    }
    log('[bitbang] ADBUS2 responde como salida. Seguimos.')

    // --- 1. la flash fuera del camino ---------------------------------------
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    if (duermeFlash) {
      await mpsse.flashPowerDown(device)
      log(`[bitbang] flash JEDEC ${hexBytes(id)} → 0xB9 deep power-down (DO en alta Z)`)
    } else {
      log(
        `[bitbang] flash JEDEC ${hexBytes(id)} — se queda despierta: SS sube tras el flanco`,
      )
    }
    await sleep(1)

    // --- 2. reset y flanco de modo ------------------------------------------
    await step('CS+CRESET=0 — sram_reset()', log, () => mpsse.sramReset(device))
    await sleep(2)

    const tShift = now()
    let statsBitbang: BitbangShiftStats | null = null
    if (fast) {
      // El flanco de CRESET pasa a hacerse adentro del modo bitbang, para no
      // depender de un cambio de modo justo en el momento que decide master
      // contra slave.
      log(
        `[bitbang] ${payload.length} B por el generador de baudios ` +
          `(~${Math.round((payload.length * 16) / 1024)} KB de estados de pines, ` +
          `divisor 0x${modo.baudValue.toString(16).padStart(4, '0')})`,
      )
      log(
        `[bitbang] SCK en reposo ${modo.clockIdleHigh ? 'ALTO (modo 3)' : 'bajo (modo 0)'}` +
          `, SS ${modo.raiseSsAfterEdge ? 'sube tras el flanco' : 'queda abajo'}` +
          `, ${modo.pipelineDepth} transferOut en vuelo`,
      )
      statsBitbang = await bitbangModeSramShift(
        device,
        payload,
        modo,
        (done) => {
          onProgress?.(done, payload.length, 'sram')
        },
      )
    } else {
      await step('CS=0 CRESET=1 con ADBUS2 como salida — flanco slave', log, () =>
        bitbangSlaveEdge(device),
      )
      await sleep(5)
      const pins = formatAdbusPins(await mpsse.readPins(device))
      log(`[bitbang] tras el flanco (esperado CS=0 CRESET=1 CDONE=0): ${pins}`)

      log(
        `[bitbang] clockeando ${payload.length} B a mano (~${Math.round((payload.length * 48) / 1024)} KB de comandos MPSSE)`,
      )
      await bitbangSramShift(device, payload, (done) => {
        onProgress?.(done, payload.length, 'sram')
      })
      await mpsse.sramDummyClocks(device)
    }
    const shiftMs = now() - tShift
    log(
      `[bitbang] shift: ${formatDuration(shiftMs)} (${formatThroughput(payload.length, shiftMs)})`,
    )
    if (statsBitbang !== null) {
      // La lectura que vale: tomada adentro del modo bitbang, antes de que
      // cualquier cambio de modo pueda tocar CRESET.
      log(
        `[bitbang] pines leídos SIN salir del bitbang: ${formatAdbusPins(statsBitbang.pins)}`,
      )
      // Donde se va el tiempo: armar los estados en JS o esperar al USB.
      log(
        `[bitbang] reparto: armado ${formatDuration(statsBitbang.msArmado)}` +
          ` / transferOut ${formatDuration(statsBitbang.msUsb)}`,
      )
    }
    const cdone = await pollCdone(device)
    log(`[bitbang] tras los 49 clocks: ${formatAdbusPins(await mpsse.readPins(device))}`)

    // --- 5. dejar la placa en un estado sano --------------------------------
    const idle = iceprogSramReleaseCs()
    await mpsse.setGpio(device, idle.value, idle.direction)
    const wake = iceprogSramSelect()
    await mpsse.setGpio(device, wake.value, wake.direction)
    await mpsse.sramSend(device, new Uint8Array([0xab]))
    await mpsse.setGpio(device, idle.value, idle.direction)

    log('')
    if (cdone) {
      log('[bitbang] ★★★ CDONE=1 — LA FPGA SE CONFIGURÓ POR SLAVE. El bit-bang por ADBUS2 funciona.')
      log('[bitbang] No hace falta ninguna modificación de hardware.')
    } else {
      log('[bitbang] CDONE=0 — ADBUS2 se maneja, pero la FPGA no tomó el bitstream.')
      log('[bitbang] Revisar: polaridad del reloj, orden de bits, o el net de ADBUS2 no llega al SPI_SI.')
    }
    logElapsed(log, 'Bit-bang SRAM', t0, { bytes: payload.length })
    return { adbus2Drives: true, cdone, bytes: payload.length }
  } catch (err) {
    // Una NOR dormida hace que el boot master falle y la placa parezca muerta.
    try {
      await mpsse.flashReleasePowerDown(device)
    } catch {
      // el pipe ya no responde; lo resuelve un desenchufe
    }
    logElapsed(log, 'Bit-bang SRAM', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}

export async function resetIce40FromFlash(log: ProgramLog): Promise<void> {
  const t0 = now()
  const device = await openMpsse(log)
  try {
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await sleep(20)
    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const cdone = await mpsse.fpgaGetCdone(device)
    log(
      `[mpsse] reset CDONE=${cdone}${cdone ? ' (FPGA reléida desde la flash)' : ' — timeout'}`,
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
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    log('[mpsse] chip erase 0xC7 — espero WIP=0 (puede tardar varios segundos)')
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
      if (elapsed - lastSpeak >= 1000) {
        log(
          `[mpsse] borrando… ${(elapsed / 1000).toFixed(1)} s  WIP=${wip ? 1 : 0}`,
        )
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
    log(
      `[mpsse] WIP=0 en ${ms}ms${sawBusy ? '' : ' (no vi WIP=1; confirmo leyendo)'}`,
    )
    const probe = await mpsse.flashRead(device, 0, 64)
    if (probe.some((b) => b !== 0xff)) {
      throw new Error(
        'chip erase terminó el WIP pero @0x0 no está en 0xFF; el borrado no se confirmó',
      )
    }
    log(`[mpsse] flash borrada: 64 B @ 0x0 = 0xFF (${ms}ms)`)
    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const cdone = await mpsse.fpgaGetCdone(device)
    log(
      `[mpsse] flash vacía CDONE=${cdone}${cdone ? '' : ' (esperado: no hay bitstream)'}`,
    )
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
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    const size = flashSizeFromJedec(id)
    log(`[mpsse] leyendo ${size} bytes (JEDEC ${hexBytes(id)}) — mpsse.flashRead`)
    const out = new Uint8Array(size)
    for (let addr = 0; addr < size; addr += FLASH_READ_CHUNK) {
      const n = Math.min(FLASH_READ_CHUNK, size - addr)
      out.set(await mpsse.flashRead(device, addr, n), addr)
      const done = addr + n
      onProgress?.(done, size, 'read')
      if (addr === 0 || done % 65536 === 0 || done === size) {
        log(`[mpsse] leídos ${done}/${size} @ 0x${addr.toString(16)}`)
      }
      if (done % 4096 === 0) await sleep(0)
    }
    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const cdone = await mpsse.fpgaGetCdone(device)
    log(`[mpsse] dump listo CDONE=${cdone}`)
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
    await step('CRESET assert — mpsse.fpgaResetAssert', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    const size = Math.min(payload.length, flashSizeFromJedec(id))
    log(`[mpsse] verificando ${size} bytes (JEDEC ${hexBytes(id)})`)
    const out = new Uint8Array(size)
    for (let addr = 0; addr < size; addr += FLASH_READ_CHUNK) {
      const n = Math.min(FLASH_READ_CHUNK, size - addr)
      out.set(await mpsse.flashRead(device, addr, n), addr)
      const done = addr + n
      onProgress?.(done, size, 'read')
      if (done % 65536 === 0 || done === size) {
        log(`[mpsse] leídos ${done}/${size} @ 0x${addr.toString(16)}`)
      }
      if (done % 4096 === 0) await sleep(0)
    }
    await step('CS+CRESET high-Z — mpsse.fpgaResetDeassert', log, () =>
      mpsse.fpgaResetDeassert(device),
    )
    await sleep(250)
    const diff = compareBins(payload, out)
    log(`[mpsse] ${describeDiff(diff)}`)
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
    log(
      `[mpsse] USB ya enumeró manufacturer="${device.manufacturerName ?? ''}" product="${device.productName ?? ''}" serial="${device.serialNumber ?? ''}"`,
    )
    const raw = await mpsse.readEeprom(device, 256)
    log('[mpsse] EEPROM FTDI cruda (256 B, request 0x90) — no es la flash W25X40')
    log(formatHexDump(raw))
    logElapsed(log, 'Leer EEPROM del FTDI', t0, { bytes: raw.length })
    return raw
  } catch (err) {
    logElapsed(log, 'Leer EEPROM del FTDI', t0, { failed: true })
    await closeMpsseSession()
    throw err
  }
}
