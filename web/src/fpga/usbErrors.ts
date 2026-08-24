/** Classify Chrome/WebUSB error text so the UI never dumps raw step names. */

export type UsbFailKind =
  | 'picker_cancel'
  | 'claim'
  | 'winusb'
  | 'short_read'
  | 'denied'
  | 'unplugged'
  | 'timeout'
  | 'empty_bin'
  | 'jedec'
  | 'no_webusb'
  | 'unknown'

export type UsbBannerKey =
  | 'fpga.usbClaim'
  | 'fpga.usbWinusb'
  | 'fpga.usbShortRead'
  | 'fpga.usbDenied'
  | 'fpga.usbUnplugged'
  | 'fpga.usbTimeout'
  | 'fpga.usbEmptyBin'
  | 'fpga.usbJedec'
  | 'fpga.needWebUsb'
  | 'fpga.usbUnknown'

export function classifyUsbError(msg: string): UsbFailKind {
  const m = msg.toLowerCase()
  if (
    /no usb device found/.test(m) ||
    /no device selected/.test(m) ||
    /notfounderror/.test(m) ||
    /\bcancel(led|ó|o)?\b/.test(m)
  ) {
    return 'picker_cancel'
  }
  if (/webusb vive|need_web_usb|navigator\.usb/.test(m)) return 'no_webusb'
  if (/claim interface|unable to claim/.test(m)) return 'claim'
  if (/short ftdi read/.test(m)) return 'short_read'
  if (/controltransferout|transfer error|networkerror|not functioning|winusb/.test(m)) {
    return 'winusb'
  }
  if (/access denied|securityerror|insecure/.test(m)) return 'denied'
  if (/disconnected|device not found/.test(m)) return 'unplugged'
  if (/timeout|wip=0/.test(m)) return 'timeout'
  if (/empty bitstream|todo 0xff|dump de flash borrada/.test(m)) return 'empty_bin'
  if (/unknown jedec/.test(m)) return 'jedec'
  return 'unknown'
}

/** Picker cancel stays in the log only. Other kinds map to short i18n copy. */
export function usbBannerKey(kind: UsbFailKind): UsbBannerKey | null {
  switch (kind) {
    case 'picker_cancel':
      return null
    case 'claim':
      return 'fpga.usbClaim'
    case 'winusb':
      return 'fpga.usbWinusb'
    case 'short_read':
      return 'fpga.usbShortRead'
    case 'denied':
      return 'fpga.usbDenied'
    case 'unplugged':
      return 'fpga.usbUnplugged'
    case 'timeout':
      return 'fpga.usbTimeout'
    case 'empty_bin':
      return 'fpga.usbEmptyBin'
    case 'jedec':
      return 'fpga.usbJedec'
    case 'no_webusb':
      return 'fpga.needWebUsb'
    case 'unknown':
      return 'fpga.usbUnknown'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
