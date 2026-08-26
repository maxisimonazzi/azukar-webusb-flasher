/**
 * GPIO low-byte encoding from IceStorm iceprog.c `set_cs_creset`.
 * Copyright (C) 2015 Claire Xenia Wolf, 2018 Piotr Esden-Tempski (ISC).
 * https://github.com/YosysHQ/icestorm — notice in web/public/THIRD_PARTY_NOTICES.md
 *
 * Bits come from the active board profile (programmer.adbus).
 * Default is the Iceprog / Alhambra / Azukar / EDU-CIAA map:
 *   SCK, MOSI, CS#, CDONE, CRESET_B
 *
 * For flash, gpio value is 0: CS and CRESET are outputs only while driven
 * low. High means high-Z + board pull-up (SPI master boot).
 * SRAM slave drives CRESET high so the mode-sample edge does not wait on
 * the 10 kΩ. Flash /CS and FPGA SPI_SS_B share ADBUS4; ADBUS3 is unused.
 */
import { getActiveAdbus, getActivePid, getActiveVid } from './activeBoard.ts'
import { ICEPROG_ADBUS, type AdbusBits } from './boardTypes.ts'

function adbusMask(bit: number): number {
  return 1 << bit
}

function bits(adbus: AdbusBits = getActiveAdbus()): AdbusBits {
  return adbus
}

export const PIN_SCK = adbusMask(ICEPROG_ADBUS.sck)
export const PIN_MOSI = adbusMask(ICEPROG_ADBUS.mosi)
export const PIN_CS = adbusMask(ICEPROG_ADBUS.cs)
export const PIN_CDONE = adbusMask(ICEPROG_ADBUS.cdone)
export const PIN_CRESET = adbusMask(ICEPROG_ADBUS.creset)

export const FTDI_VID = 0x0403
export const FTDI_PID = 0x6010

export function ftdiVid(): number {
  return getActiveVid()
}

export function ftdiPid(): number {
  return getActivePid()
}

export function cdoneMask(adbus: AdbusBits = getActiveAdbus()): number {
  return adbusMask(adbus.cdone)
}

export type FtdiGpio = { value: number; direction: number }

export function iceprogCsCreset(
  csLow: boolean,
  cresetLow: boolean,
  adbus: AdbusBits = getActiveAdbus(),
): FtdiGpio {
  const map = bits(adbus)
  let direction = adbusMask(map.sck) | adbusMask(map.mosi)
  if (csLow) direction |= adbusMask(map.cs)
  if (cresetLow) direction |= adbusMask(map.creset)
  return { value: 0, direction }
}

/** FPGA in reset, flash selected. */
export function iceprogChipSelect(adbus?: AdbusBits): FtdiGpio {
  return iceprogCsCreset(true, true, adbus ?? getActiveAdbus())
}

/** FPGA in reset, flash idle (CS high-Z). */
export function iceprogChipDeselect(adbus?: AdbusBits): FtdiGpio {
  return iceprogCsCreset(false, true, adbus ?? getActiveAdbus())
}

/** CS + CRESET high-Z. FPGA boots from flash. */
export function iceprogReleaseBus(adbus?: AdbusBits): FtdiGpio {
  return iceprogCsCreset(false, false, adbus ?? getActiveAdbus())
}

/**
 * SPI slave (`iceprog -S`): CS/SS low, CRESET high.
 *
 * iceprog releases CRESET to high-Z and waits on the pull-up. Azukar samples
 * slave vs master on that rising edge while SS is already low. Driving CRESET
 * high as an output makes the edge, instead of hoping the 10 kΩ is fast enough.
 *
 * ADBUS3 is unused on this board. Flash /CS and FPGA SPI_SS_B are the same
 * net (ADBUS4). Separating them needs a copper cut, not another GPIO bit.
 */
export function iceprogSramSelect(adbus: AdbusBits = getActiveAdbus()): FtdiGpio {
  const map = bits(adbus)
  const creset = adbusMask(map.creset)
  return {
    value: creset,
    direction: adbusMask(map.sck) | adbusMask(map.mosi) | adbusMask(map.cs) | creset,
  }
}

/** After the shift: CS high-Z, CRESET stays driven high — no CRESET edge, no flash boot. */
export function iceprogSramReleaseCs(adbus: AdbusBits = getActiveAdbus()): FtdiGpio {
  const map = bits(adbus)
  const creset = adbusMask(map.creset)
  return {
    value: creset,
    direction: adbusMask(map.sck) | adbusMask(map.mosi) | creset,
  }
}

/**
 * ADBUS2 = TDO/DI del FT2232H. Lo fija el motor MPSSE, no el perfil de placa.
 *
 * En el cableado estandar (FTDI + flash + FPGA sobre el mismo bus) este pin
 * comparte net con el DO de la flash y con el SPI_SI de la FPGA — o sea, es el
 * unico pin del FTDI que puede alcanzar la entrada de datos de configuracion.
 * El motor de datos del MPSSE solo transmite por ADBUS1, asi que para usarlo
 * hay que manejarlo como GPIO y bit-banguear.
 */
export const ADBUS_DATA_IN_BIT = 2
export const PIN_DATA_IN = adbusMask(ADBUS_DATA_IN_BIT)

/**
 * Direccion para el bit-bang de configuracion slave: manejamos SCK, el dato
 * (ADBUS2), CS y CRESET. **MOSI (ADBUS1) queda como entrada** a proposito: en
 * slave el SPI_SO de la FPGA es una salida sobre ese mismo net y no hay que
 * pelearlo.
 */
export function iceprogBitbangDirection(adbus: AdbusBits = getActiveAdbus()): number {
  const map = bits(adbus)
  return (
    adbusMask(map.sck) | PIN_DATA_IN | adbusMask(map.cs) | adbusMask(map.creset)
  )
}

/** Valor de ADBUS para un bit del shift: CS abajo, CRESET arriba, dato y reloj. */
export function iceprogBitbangValue(
  dataHigh: boolean,
  sckHigh: boolean,
  adbus: AdbusBits = getActiveAdbus(),
): number {
  const map = bits(adbus)
  let value = adbusMask(map.creset)
  if (dataHigh) value |= PIN_DATA_IN
  if (sckHigh) value |= adbusMask(map.sck)
  return value
}

/** Decode ADBUS after a SETB/READB so the lab log shows CS / CRESET / CDONE. */
export function formatAdbusPins(
  pins: number,
  adbus: AdbusBits = getActiveAdbus(),
): string {
  const map = bits(adbus)
  const cs = pins & adbusMask(map.cs) ? 1 : 0
  const creset = pins & adbusMask(map.creset) ? 1 : 0
  const cdone = pins & adbusMask(map.cdone) ? 1 : 0
  return `CS=${cs} CRESET=${creset} CDONE=${cdone} raw=0x${pins.toString(16).padStart(2, '0')}`
}
