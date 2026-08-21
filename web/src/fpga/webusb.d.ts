/** Minimal WebUSB types for Chrome/Edge. Firefox is not a target. */

interface USBDeviceFilter {
  vendorId?: number
  productId?: number
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[]
}

interface USBControlSetup {
  requestType: 'standard' | 'class' | 'vendor'
  recipient: 'device' | 'interface' | 'endpoint' | 'other'
  request: number
  value: number
  index: number
}

interface USBInTransferResult {
  status: 'ok' | 'stall' | 'babble'
  data: DataView
}

interface USBOutTransferResult {
  status: 'ok' | 'stall' | 'babble'
  bytesWritten: number
}

interface USBDevice {
  opened: boolean
  vendorId: number
  productId: number
  productName?: string
  manufacturerName?: string
  serialNumber?: string
  open(): Promise<void>
  close(): Promise<void>
  forget(): Promise<void>
  reset?(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  controlTransferOut(
    setup: USBControlSetup,
    data?: BufferSource,
  ): Promise<USBOutTransferResult>
  controlTransferIn(
    setup: USBControlSetup,
    length: number,
  ): Promise<USBInTransferResult>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>
}

interface USBConnectionEvent extends Event {
  device: USBDevice
}

interface USB {
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
  getDevices(): Promise<USBDevice[]>
  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (event: USBConnectionEvent) => void,
  ): void
}

interface Navigator {
  usb?: USB
}
