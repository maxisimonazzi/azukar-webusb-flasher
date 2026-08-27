import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fmaxFails,
  parsePnrReport,
  parseYosysStat,
  prettyClockName,
  utilisationPct,
} from './pnrReport.ts'

/** Salida real de Yosys 0.68 (synth_ice40 sobre el laboratorio de Azukar). */
const REAL_STAT = "=== top_module ===\n\n        +----------Local Count, excluding submodules.\n        | \n       59 wires\n       89 wire bits\n       59 public wires\n       89 public wire bits\n       11 ports\n       11 port bits\n       78 submodules\n       22   SB_CARRY\n       24   SB_DFF\n       32   SB_LUT4\n"

/** `out.pnr` real de nextpnr-ice40 0.11, recortado. */
const REAL_REPORT = "{\"utilization\": {\"ICESTORM_LC\": {\"available\": 7680, \"used\": 35}, \"ICESTORM_PLL\": {\"available\": 2, \"used\": 0}, \"ICESTORM_RAM\": {\"available\": 32, \"used\": 0}, \"SB_GB\": {\"available\": 8, \"used\": 1}, \"SB_IO\": {\"available\": 107, \"used\": 11}, \"SB_WARMBOOT\": {\"available\": 1, \"used\": 0}}, \"fmax\": {\"CLK12$SB_IO_IN_$glb_clk\": {\"achieved\": 194.36346435546875, \"constraint\": 12}}, \"critical_paths\": [{\"path\": [{\"delay\": 0.5}, {\"delay\": 1.25}]}]}"

describe('parsePnrReport', () => {
  it('reads utilisation and fmax from a real report', () => {
    const report = parsePnrReport(REAL_REPORT)
    assert.ok(report)
    const lc = report.utilisation.find((u) => u.name === 'ICESTORM_LC')
    assert.deepEqual(lc, { name: 'ICESTORM_LC', used: 35, available: 7680 })
    assert.equal(report.fmax.length, 1)
    assert.equal(report.fmax[0]?.clock, 'CLK12')
    assert.equal(report.fmax[0]?.constraint, 12)
    assert.ok((report.fmax[0]?.achieved ?? 0) > 190)
  })

  it('adds up the critical path', () => {
    const report = parsePnrReport(REAL_REPORT)
    assert.ok(Math.abs((report?.criticalPathNs ?? 0) - 1.75) < 1e-9)
  })

  it('accepts the british spelling too', () => {
    const report = parsePnrReport('{"utilisation":{"SB_IO":{"used":2,"available":4}}}')
    assert.equal(report?.utilisation[0]?.used, 2)
  })

  it('returns null on junk', () => {
    assert.equal(parsePnrReport(''), null)
    assert.equal(parsePnrReport('not json'), null)
    assert.equal(parsePnrReport('{}'), null)
  })
})

describe('parseYosysStat', () => {
  it('reads the 0.68 stat block', () => {
    const stat = parseYosysStat(REAL_STAT, 'top_module')
    assert.equal(stat?.module, 'top_module')
    assert.equal(stat?.totalCells, 78)
    assert.deepEqual(stat?.cells, [
      { name: 'SB_LUT4', count: 32 },
      { name: 'SB_DFF', count: 24 },
      { name: 'SB_CARRY', count: 22 },
    ])
  })

  it('leaves out the internal cells of Yosys', () => {
    const stat = parseYosysStat(`${REAL_STAT}        1   $scopeinfo\n`, 'top_module')
    assert.ok(!stat?.cells.some((c) => c.name.startsWith('$')))
  })

  it('ignores the design hierarchy block', () => {
    const stat = parseYosysStat(REAL_STAT + '\n=== design hierarchy ===\n\n  9 wires\n')
    assert.equal(stat?.module, 'top_module')
  })

  it('reads the old "Number of cells" format', () => {
    const old = [
      '=== top ===',
      '',
      '   Number of wires:                 12',
      '   Number of cells:                  3',
      '     SB_DFF                          1',
      '     SB_LUT4                         2',
      '',
    ].join('\n')
    const stat = parseYosysStat(old)
    assert.equal(stat?.totalCells, 3)
    assert.deepEqual(stat?.cells, [
      { name: 'SB_LUT4', count: 2 },
      { name: 'SB_DFF', count: 1 },
    ])
  })

  it('returns null when there is no stat', () => {
    assert.equal(parseYosysStat('nothing here'), null)
  })
})

describe('helpers', () => {
  it('shortens the clock name', () => {
    assert.equal(prettyClockName('CLK12$SB_IO_IN_$glb_clk'), 'CLK12')
    assert.equal(prettyClockName('clk'), 'clk')
  })

  it('computes the utilisation percentage', () => {
    assert.equal(utilisationPct({ name: 'x', used: 35, available: 7680 }) < 1, true)
    assert.equal(utilisationPct({ name: 'x', used: 0, available: 0 }), 0)
  })

  it('flags a clock that does not meet the constraint', () => {
    assert.equal(fmaxFails({ clock: 'clk', achieved: 8, constraint: 12 }), true)
    assert.equal(fmaxFails({ clock: 'clk', achieved: 20, constraint: 12 }), false)
    assert.equal(fmaxFails({ clock: 'clk', achieved: 20, constraint: 0 }), false)
  })
})
