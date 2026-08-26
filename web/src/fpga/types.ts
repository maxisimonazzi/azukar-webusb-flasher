export type ProgramLog = (line: string) => void

export type ProgramProgress = (done: number, total: number, phase: string) => void

export type ProgramStats = {
  flashIdHex: string
  connectMs: number
  eraseMs: number
  programMs: number
  configureMs: number
  totalMs: number
  bytes: number
  pages: number
  sectors: number
}


/** FT2232H MPSSE + SPI flash. See `mpsse.ts`. */
export interface Ice40Mpsse {
  connect(opts?: { forcePicker?: boolean }): Promise<USBDevice>
  readEeprom(device: USBDevice, bytes?: number): Promise<Uint8Array>
  disconnect(device: USBDevice, opts?: { forget?: boolean; resetUsb?: boolean }): Promise<void>
  initialize(device: USBDevice): Promise<void>
  spiInit(device: USBDevice, clkDiv?: number): Promise<void>
  setGpio(device: USBDevice, value: number, direction: number): Promise<void>
  readPins(device: USBDevice): Promise<number>
  flashCsAssert(device: USBDevice): Promise<void>
  flashCsDeassert(device: USBDevice): Promise<void>
  fpgaResetAssert(device: USBDevice): Promise<void>
  fpgaResetDeassert(device: USBDevice): Promise<void>
  setResetPin(device: USBDevice, released: boolean): Promise<void>
  fpgaGetCdone(device: USBDevice): Promise<0 | 1>
  flashReleasePowerDown(device: USBDevice): Promise<void>
  flashPowerDown(device: USBDevice): Promise<void>
  flashReadId(device: USBDevice): Promise<Uint8Array>
  flashReadStatus(device: USBDevice): Promise<number>
  flashWriteEnable(device: USBDevice): Promise<void>
  flashWait(device: USBDevice): Promise<void>
  flashBlockErase64k(device: USBDevice, addr: number): Promise<void>
  flashChipErase(device: USBDevice): Promise<void>
  flashProgPage(device: USBDevice, addr: number, data: Uint8Array): Promise<void>
  flashWriteEnableAndProgPage(
    device: USBDevice,
    addr: number,
    data: Uint8Array,
  ): Promise<void>
  sramReset(device: USBDevice): Promise<void>
  sramSelect(device: USBDevice): Promise<void>
  sramSend(device: USBDevice, data: Uint8Array): Promise<void>
  sramDummyClocks(device: USBDevice): Promise<void>
  flashWriteByte(device: USBDevice, addr: number, value: number): Promise<void>
  flashRead(device: USBDevice, addr: number, count: number): Promise<Uint8Array>
  flashRead8(device: USBDevice, addr: number): Promise<number>
}
