import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  adbusHasDuplicates,
  customDraftToProfile,
  emptyCustomDraft,
  EXAMPLE_CUSTOM_PCF,
  ICEPROG_ADBUS,
} from './boardTypes.ts'

test('default iceprog ADBUS has unique bits', () => {
  assert.equal(adbusHasDuplicates(ICEPROG_ADBUS), false)
})

test('duplicate ADBUS pins are rejected', () => {
  assert.equal(adbusHasDuplicates({ ...ICEPROG_ADBUS, cs: 0 }), true)
})

test('customDraftToProfile falls back to the example PCF as the starter', () => {
  const profile = customDraftToProfile(emptyCustomDraft(), 'custom-1')
  assert.equal(profile.kind, 'custom')
  assert.equal(profile.starterPcf, EXAMPLE_CUSTOM_PCF)
  assert.match(profile.starterPcf, /set_io -nowarn LED0 30/)
})

test('a legacy custom board keeps its saved PCF as the starter', () => {
  const saved = 'set_io -nowarn LED0 1'
  const profile = customDraftToProfile({ ...emptyCustomDraft(), starterPcf: saved }, 'custom-2')
  assert.equal(profile.starterPcf, saved)
})
