import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyUsbError, usbBannerKey } from './usbErrors.ts'

test('Chrome picker cancel is not a red banner', () => {
  assert.equal(
    classifyUsbError('USB — Chrome pide qué placa: No USB device found or selected'),
    'picker_cancel',
  )
  assert.equal(classifyUsbError('No device selected.'), 'picker_cancel')
  assert.equal(classifyUsbError('NotFoundError: Failed to execute requestDevice'), 'picker_cancel')
})

test('WinUSB / claim / unplug map to distinct kinds', () => {
  assert.equal(classifyUsbError('Unable to claim interface'), 'claim')
  assert.equal(classifyUsbError('NetworkError: controlTransferOut failed'), 'winusb')
  assert.equal(classifyUsbError('The device was disconnected'), 'unplugged')
  assert.equal(classifyUsbError('unknown JEDEC density'), 'jedec')
})

test('picker cancel has no red banner; others get short copy keys', () => {
  assert.equal(usbBannerKey('picker_cancel'), null)
  assert.equal(usbBannerKey('claim'), 'fpga.usbClaim')
  assert.equal(usbBannerKey('unknown'), 'fpga.usbUnknown')
})

test('short FTDI read (Win10 WinUSB truncated packet) maps to short_read', () => {
  assert.equal(classifyUsbError('short FTDI read: got 66 of 68'), 'short_read')
  assert.equal(classifyUsbError('short FTDI read: got 0 of 62'), 'short_read')
  assert.equal(usbBannerKey('short_read'), 'fpga.usbShortRead')
})
