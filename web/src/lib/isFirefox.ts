/** Gecko/Firefox: no native WebUSB. WebSerial only via add-on. */

export const WEBSERIAL_FIREFOX_ADDON_URL =
  'https://addons.mozilla.org/pl/firefox/addon/webserial-for-firefox/'

export function isFirefox(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Firefox\//i.test(userAgent) && !/Seamonkey/i.test(userAgent)
}
