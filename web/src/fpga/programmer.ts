/**
 * Iceprog-style flash program + FPGA config reset, over the MPSSE in `mpsse.ts`.
 * Sequence follows IceStorm iceprog.c (flash pages, iceprog -S SRAM slave).
 * Copyright (C) 2015 Claire Xenia Wolf, 2018 Piotr Esden-Tempski (ISC).
 * https://github.com/YosysHQ/icestorm — notice in web/public/THIRD_PARTY_NOTICES.md
 */
import { FLASH_READ_MAX_DATA } from '@/fpga/ftdiUsb'
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
import { mpsse } from '@/fpga/mpsse'
import type {
  ProgramLog,
  ProgramProgress,
  ProgramStats,
  SramProgramStats,
} from '@/fpga/types'

const FLASH_READ_CHUNK = FLASH_READ_MAX_DATA
const SRAM_SPI_CHUNK = 4096
const SRAM_DUMMY_FF = 7
const SRAM_EXTRA_DUMMY_FF = 16

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
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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
      await mpsse.flashWriteEnable(device)
      await mpsse.flashProgPage(device, page.addr, chunk)
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

    const probe = Math.min(256, payload.length)
    let same = true
    let failAt = -1
    let failWrote = new Uint8Array()
    let failRead = new Uint8Array()
    for (let addr = 0; addr < probe; addr += FLASH_READ_CHUNK) {
      const nRead = Math.min(FLASH_READ_CHUNK, probe - addr)
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
          failWrote = expect
          failRead = readback
          break
        }
      }
      if (!same) break
    }
    if (same) {
      log(`[mpsse] verify @0 OK (${probe} B) — ${hexBytes(payload, 16)}`)
    } else {
      log(
        `[mpsse] verify FAIL @0x${failAt.toString(16)} (chunk wrote ${hexBytes(failWrote, 16)} read ${hexBytes(failRead, 16)})`,
      )
    }

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

async function logAdbus(device: USBDevice, log: ProgramLog, label: string): Promise<string> {
  const pins = formatAdbusPins(await mpsse.readPins(device))
  log(`[mpsse] SRAM ${label} ${pins}`)
  return pins
}

/**
 * iceprog -S: clock the icepack image into CRAM as SPI slave.
 * Does not write the NOR. A later Reset reloads flash.
 *
 * Shared ADBUS4 = flash /CS = FPGA SPI_SS_B, so the W25X40 also sees the
 * shift. We put it in 0xB9 deep power-down first; that is the software we
 * can do without cutting copper. No flash-boot fallback (that lies).
 */
export async function programIce40Sram(
  bin: Uint8Array,
  log: ProgramLog,
  onProgress?: ProgramProgress,
): Promise<SramProgramStats> {
  if (bin.length === 0) {
    throw new Error('empty bitstream')
  }
  const payload = trimIce40Image(bin)
  if (payload.length === 0) {
    throw new Error('ese .bin está vacío o es un dump de flash borrada (todo 0xFF)')
  }
  if (payload.length !== bin.length) {
    log(
      `[mpsse] SRAM recorté ${bin.length} → ${payload.length} B (0xFF al final)`,
    )
  }

  const t0 = now()
  const device = await openMpsse(log)

  try {
    log(
      `[mpsse] SRAM slave ${payload.length} B — iceprog -S (no toca la flash)`,
    )

    await step('SRAM CRESET=0 (FPGA en reset, flash idle)', log, () =>
      mpsse.fpgaResetAssert(device),
    )
    await sleep(2)
    await mpsse.flashReleasePowerDown(device)
    const id = await mpsse.flashReadId(device)
    log(`[mpsse] SRAM JEDEC ${hexBytes(id)} — despierto la NOR para mandarla a sleep`)
    await mpsse.flashPowerDown(device)
    log(
      '[mpsse] SRAM flash 0xB9 deep power-down — misma CS que SPI_SS_B; la NOR no debería interpretar el bitstream',
    )
    await sleep(1)

    await step('SRAM sramReset CS+CRESET=0', log, () => mpsse.sramReset(device))
    await sleep(2)
    await logAdbus(device, log, 'tras sramReset')

    await step('SRAM sramSelect CS=0 CRESET=1 (flanco slave)', log, () =>
      mpsse.sramSelect(device),
    )
    await sleep(5)
    const pinsAfterSelect = await logAdbus(
      device,
      log,
      'tras sramSelect (esperaba CS=0 CRESET=1 CDONE=0)',
    )

    log(`[mpsse] SRAM shifting ${payload.length} bytes`)
    for (let off = 0; off < payload.length; off += SRAM_SPI_CHUNK) {
      const chunk = payload.subarray(
        off,
        Math.min(off + SRAM_SPI_CHUNK, payload.length),
      )
      await mpsse.sramSend(device, chunk)
      const done = off + chunk.length
      onProgress?.(done, payload.length, 'sram')
      if (off === 0 || done === payload.length || done % (SRAM_SPI_CHUNK * 8) === 0) {
        log(`[mpsse] SRAM ${done}/${payload.length}`)
      }
    }

    await mpsse.sramSend(device, new Uint8Array(SRAM_DUMMY_FF).fill(0xff))
    await mpsse.sramDummyClocks(device)
    log(
      `[mpsse] SRAM dummy ${SRAM_DUMMY_FF}×0xFF + 49 clocks (SI=1, iceprog 6 B + 1 bit)`,
    )

    let cdone = await pollCdone(device)
    if (!cdone) {
      log('[mpsse] SRAM CDONE todavía 0 — más dummy y reintento')
      await mpsse.sramSend(device, new Uint8Array(SRAM_EXTRA_DUMMY_FF).fill(0xff))
      await mpsse.sramDummyClocks(device)
      cdone = await pollCdone(device)
    }

    await logAdbus(device, log, 'tras dummy')
    const donePins = iceprogSramReleaseCs()
    await step('SRAM suelto CS (CRESET sigue en 1, sin boot flash)', log, () =>
      mpsse.setGpio(device, donePins.value, donePins.direction),
    )
    await sleep(2)
    cdone = await mpsse.fpgaGetCdone(device)

    const wake = iceprogSramSelect()
    const idle = iceprogSramReleaseCs()
    await mpsse.setGpio(device, wake.value, wake.direction)
    await mpsse.sramSend(device, new Uint8Array([0xab]))
    await mpsse.setGpio(device, idle.value, idle.direction)
    log('[mpsse] SRAM 0xAB — despierto la NOR sin pulsar CRESET (Reset/flash siguen andando)')
    await sleep(1)

    const t1 = now()
    if (cdone) {
      log(
        `[mpsse] SRAM CDONE=1 — corre desde CRAM (${payload.length} B, ${Math.round(t1 - t0)}ms). Reset o un corte de luz recarga la flash, no este diseño.`,
      )
    } else {
      log(
        `[mpsse] SRAM CDONE=0 — el slave no configuró (${payload.length} B, ${Math.round(t1 - t0)}ms). En Azukar FTDI CS, flash /CS y SPI_SS_B son el mismo net (ADBUS4). No hago Reset: eso recargaría la flash y parecería que SRAM anduvo.`,
      )
    }

    return {
      bytes: payload.length,
      cdone,
      totalMs: Math.round(t1 - t0),
      pinsAfterSelect,
    }
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function resetIce40FromFlash(log: ProgramLog): Promise<void> {
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
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function eraseIce40Flash(log: ProgramLog): Promise<void> {
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
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function readIce40Flash(
  log: ProgramLog,
  onProgress?: ProgramProgress,
): Promise<Uint8Array> {
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
    return out
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}

export async function readFtdiConfigEeprom(log: ProgramLog): Promise<Uint8Array> {
  const device = await openMpsse(log)
  try {
    log(
      `[mpsse] USB ya enumeró manufacturer="${device.manufacturerName ?? ''}" product="${device.productName ?? ''}" serial="${device.serialNumber ?? ''}"`,
    )
    const raw = await mpsse.readEeprom(device, 256)
    log('[mpsse] EEPROM FTDI cruda (256 B, request 0x90) — no es la flash W25X40')
    log(formatHexDump(raw))
    return raw
  } catch (err) {
    await closeMpsseSession()
    throw err
  }
}
