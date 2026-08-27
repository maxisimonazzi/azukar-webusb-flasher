import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareBins, describeDiff } from './binCompare.ts'

describe('compareBins', () => {
  it('says equal when the read-back matches', () => {
    const a = new Uint8Array([1, 2, 3])
    const diff = compareBins(a, new Uint8Array([1, 2, 3]))
    assert.deepEqual(diff, {
      equal: true,
      firstDiff: null,
      compared: 3,
      missing: 0,
      expectedByte: null,
      actualByte: null,
    })
    assert.match(describeDiff(diff), /^verificado: 3 bytes/)
  })

  it('points at the first byte that differs', () => {
    const diff = compareBins(new Uint8Array([1, 2, 3]), new Uint8Array([1, 9, 3]))
    assert.equal(diff.equal, false)
    assert.equal(diff.firstDiff, 1)
    assert.equal(diff.expectedByte, 2)
    assert.equal(diff.actualByte, 9)
    assert.match(describeDiff(diff), /0x000001.*0x02.*0x09/)
  })

  it('notices a short read', () => {
    const diff = compareBins(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))
    assert.equal(diff.equal, false)
    assert.equal(diff.missing, 1)
    assert.equal(diff.firstDiff, 2)
    assert.match(describeDiff(diff), /faltan 1/)
  })

  it('ignores the tail when the flash gives back more than we wrote', () => {
    const diff = compareBins(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0xff, 0xff]))
    assert.equal(diff.equal, true)
    assert.equal(diff.compared, 2)
  })
})
