/**
 * GPIO low-byte encoding from IceStorm iceprog.c `set_cs_creset`.
 *
 * Bits live in boards/azukar-v2/board.json (programmer.adbus).
 * FT2232H ADBUS canal A, igual que Alhambra / Azukar:
 *   SCK, MOSI, CS#, CDONE, CRESET_B
 *
 * For flash, gpio value is 0: CS and CRESET are outputs only while driven
 * low. High means high-Z + board pull-up (SPI master boot).
 * SRAM slave drives CRESET high so the mode-sample edge does not wait on
 * the 10 kΩ. Flash /CS and FPGA SPI_SS_B share ADBUS4; ADBUS3 is unused.
 */
import board from '../../../boards/azukar-v2/board.json' with { type: 'json' }

function adbusMask(bit: number): number {
  return 1 << bit
}

const bits = board.programmer.adbus

export const PIN_SCK = adbusMask(bits.sck)
export const PIN_MOSI = adbusMask(bits.mosi)
export const PIN_CS = adbusMask(bits.cs)
export const PIN_CDONE = adbusMask(bits.cdone)
export const PIN_CRESET = adbusMask(bits.creset)

export const FTDI_VID = board.programmer.vid
export const FTDI_PID = board.programmer.pid

export type FtdiGpio = { value: number; direction: number }

export function iceprogCsCreset(csLow: boolean, cresetLow: boolean): FtdiGpio {
  let direction = PIN_SCK | PIN_MOSI
  if (csLow) direction |= PIN_CS
  if (cresetLow) direction |= PIN_CRESET
  return { value: 0, direction }
}

/** FPGA in reset, flash selected. */
export function iceprogChipSelect(): FtdiGpio {
  return iceprogCsCreset(true, true)
}

/** FPGA in reset, flash idle (CS high-Z). */
export function iceprogChipDeselect(): FtdiGpio {
  return iceprogCsCreset(false, true)
}

/** CS + CRESET high-Z. FPGA boots from flash. */
export function iceprogReleaseBus(): FtdiGpio {
  return iceprogCsCreset(false, false)
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
export function iceprogSramSelect(): FtdiGpio {
  return {
    value: PIN_CRESET,
    direction: PIN_SCK | PIN_MOSI | PIN_CS | PIN_CRESET,
  }
}

/** After the shift: CS high-Z, CRESET stays driven high — no CRESET edge, no flash boot. */
export function iceprogSramReleaseCs(): FtdiGpio {
  return {
    value: PIN_CRESET,
    direction: PIN_SCK | PIN_MOSI | PIN_CRESET,
  }
}

/** Decode ADBUS after a SETB/READB so the lab log shows CS / CRESET / CDONE. */
export function formatAdbusPins(pins: number): string {
  const cs = pins & PIN_CS ? 1 : 0
  const creset = pins & PIN_CRESET ? 1 : 0
  const cdone = pins & PIN_CDONE ? 1 : 0
  return `CS=${cs} CRESET=${creset} CDONE=${cdone} raw=0x${pins.toString(16).padStart(2, '0')}`
}
