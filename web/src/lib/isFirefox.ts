/** Gecko/Firefox: no WebUSB, no WebSerial. Chrome, Edge and Safari skip this. */

export function isFirefox(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Firefox\//i.test(userAgent) && !/Seamonkey/i.test(userAgent)
}
