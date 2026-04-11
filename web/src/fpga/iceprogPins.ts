/**
 * GPIO low-byte encoding from IceStorm iceprog.c `set_cs_creset`.
 *
 * Bits live in boards/azukar-v2/board.json (programmer.adbus).
 * FT2232H ADBUS canal A, igual que Alhambra / Azukar:
 *   SCK, MOSI, CS#, CDONE, CRESET_B
 *
 * gpio is always 0. CS and CRESET are outputs only while driven low.
 * When they are inputs (high-Z), the board pull-ups take them high so the
 * iCE40 can be SPI master and boot from flash.
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

/** CS low, CRESET high-Z — iCE40 SPI slave (`iceprog -S`). */
export function iceprogSramSelect(): FtdiGpio {
  return iceprogCsCreset(true, false)
}
