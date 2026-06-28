import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isFirefox } from './isFirefox.ts'

test('detects desktop and Android Firefox', () => {
  assert.equal(
    isFirefox('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'),
    true,
  )
  assert.equal(
    isFirefox('Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0'),
    true,
  )
})

test('Chrome, Edge and Safari are not Firefox', () => {
  assert.equal(
    isFirefox(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ),
    false,
  )
  assert.equal(
    isFirefox(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    ),
    false,
  )
  assert.equal(
    isFirefox(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    ),
    false,
  )
})
