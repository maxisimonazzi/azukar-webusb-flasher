import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  checkPcf,
  findTopPorts,
  parseModulePorts,
  parsePcf,
  parsePcfFrequencies,
  stripComments,
} from './pcfCheck.ts'

const ANSI = `// laboratorio
module top_module(
    input  wire CLK12,
    input  wire BTN0_,
    output wire [7:0] LED,
    output reg  TX
);
    assign LED = 8'h00;
endmodule
`

const LEGACY = `module top_module(clk, led, btn);
    input clk;
    input btn;
    output [3:0] led;
endmodule
`

const PARAMS = `module top_module #(parameter WIDTH = 8) (
    input wire clk,
    output wire [WIDTH-1:0] led
);
endmodule
`

describe('stripComments', () => {
  it('drops line and block comments but keeps the line count', () => {
    const src = 'a // uno\nb /* dos\ntres */ c\n'
    const out = stripComments(src)
    assert.equal(out.split('\n').length, src.split('\n').length)
    assert.ok(!out.includes('uno'))
    assert.ok(!out.includes('dos'))
    assert.ok(out.includes('c'))
  })
})

describe('parseModulePorts', () => {
  it('reads an ANSI port list with directions and widths', () => {
    const ports = parseModulePorts(ANSI, 'top_module')
    assert.deepEqual(ports, [
      { name: 'CLK12', dir: 'input', msb: null, lsb: null },
      { name: 'BTN0_', dir: 'input', msb: null, lsb: null },
      { name: 'LED', dir: 'output', msb: 7, lsb: 0 },
      { name: 'TX', dir: 'output', msb: null, lsb: null },
    ])
  })

  it('reads the old style with declarations in the body', () => {
    const ports = parseModulePorts(LEGACY, 'top_module')
    assert.deepEqual(ports, [
      { name: 'clk', dir: 'input', msb: null, lsb: null },
      { name: 'led', dir: 'output', msb: 3, lsb: 0 },
      { name: 'btn', dir: 'input', msb: null, lsb: null },
    ])
  })

  it('skips the parameter block and leaves non-literal widths unknown', () => {
    const ports = parseModulePorts(PARAMS, 'top_module')
    assert.deepEqual(ports, [
      { name: 'clk', dir: 'input', msb: null, lsb: null },
      { name: 'led', dir: 'output', msb: null, lsb: null },
    ])
  })

  it('returns null when the module is not there', () => {
    assert.equal(parseModulePorts(ANSI, 'otro'), null)
    assert.equal(parseModulePorts(ANSI, 'no valido!'), null)
  })

  it('does not match a module whose name only starts the same', () => {
    assert.equal(parseModulePorts('module top_module_2(input a);\nendmodule\n', 'top_module'), null)
  })
})

describe('parsePcf', () => {
  it('reads set_io with options and comments', () => {
    const pcf = [
      '# comentario',
      'set_io -nowarn LED0 37  #-- output',
      'set_io CLK12 49',
      'set_io -pullup yes BTN0_ 118',
      'set_io LED[3] 41',
      'set_frequency CLK12 12',
      '',
    ].join('\n')
    const out = parsePcf(pcf)
    assert.equal(out.length, 4)
    assert.deepEqual(out[0], { port: 'LED0', index: null, pin: '37', line: 2, nowarn: true })
    assert.deepEqual(out[2], { port: 'BTN0_', index: null, pin: '118', line: 4, nowarn: false })
    assert.deepEqual(out[3], { port: 'LED', index: 3, pin: '41', line: 5, nowarn: false })
  })
})

describe('checkPcf', () => {
  const ports = parseModulePorts(ANSI, 'top_module')

  function run(pcfText: string) {
    return checkPcf({
      ports,
      constraints: parsePcf(pcfText),
      pcfName: 'pins.pcf',
      topName: 'top_module',
    })
  }

  const fullPcf = [
    'set_io CLK12 49',
    'set_io BTN0_ 118',
    'set_io TX 63',
    ...Array.from({ length: 8 }, (_, i) => `set_io LED[${i}] ${37 + i}`),
  ].join('\n')

  it('says nothing when every port has a pin', () => {
    assert.deepEqual(run(fullPcf), [])
  })

  it('flags a port with no set_io', () => {
    const problems = run(fullPcf.replace('set_io TX 63\n', ''))
    assert.equal(problems.length, 1)
    assert.equal(problems[0]?.code, 'unconstrained')
    assert.equal(problems[0]?.severity, 'error')
    assert.match(problems[0]?.message ?? '', /TX/)
  })

  it('lists the missing bits of a bus', () => {
    const problems = run(fullPcf.replace('set_io LED[6] 43\n', '').replace('set_io LED[7] 44', ''))
    const missing = problems.find((p) => p.code === 'unconstrained')
    assert.match(missing?.message ?? '', /LED\[6\]/)
    assert.match(missing?.message ?? '', /LED\[7\]/)
  })

  it('flags a constraint for a port that does not exist', () => {
    const problems = run(`${fullPcf}\nset_io LED9 60`)
    const bad = problems.find((p) => p.code === 'unmatched')
    assert.equal(bad?.severity, 'error')
    assert.equal(bad?.line, 12)
  })

  it('says nothing about an unused -nowarn pin: that is what -nowarn means', () => {
    // Las plantillas de las placas mapean el conector entero y el diseño usa
    // cuatro señales. Sin esto el panel se llena de avisos inútiles.
    const problems = run(`${fullPcf}\nset_io -nowarn LED9 60`)
    assert.equal(problems.find((p) => p.code === 'unmatched'), undefined)
  })

  it('still catches a typo in a -nowarn line, through the port with no pin', () => {
    const problems = run(fullPcf.replace('set_io TX 63', 'set_io -nowarn TXX 63'))
    const missing = problems.find((p) => p.code === 'unconstrained')
    assert.equal(missing?.severity, 'error')
    assert.match(missing?.message ?? '', /TX/)
  })

  it('flags an index outside the declared range', () => {
    const problems = run(`${fullPcf}\nset_io LED[9] 60`)
    assert.match(problems.find((p) => p.code === 'unmatched')?.message ?? '', /fuera del rango/)
  })

  it('flags two ports on the same pin', () => {
    const problems = run(`${fullPcf}\nset_io -nowarn CLK12b 49`)
    const dup = problems.find((p) => p.code === 'duplicate-pin')
    assert.equal(dup?.severity, 'error')
    assert.match(dup?.message ?? '', /CLK12/)
  })

  it('flags the same port twice', () => {
    const problems = run(`${fullPcf}\nset_io TX 99`)
    assert.equal(problems.find((p) => p.code === 'duplicate-port')?.severity, 'error')
  })

  it('warns once when the top module is missing', () => {
    const problems = checkPcf({
      ports: null,
      constraints: [],
      pcfName: 'pins.pcf',
      topName: 'top_module',
    })
    assert.equal(problems.length, 1)
    assert.equal(problems[0]?.code, 'no-top')
    assert.equal(problems[0]?.severity, 'warning')
  })

  it('says nothing about ports whose width is unknown', () => {
    const problems = checkPcf({
      ports: parseModulePorts(PARAMS, 'top_module'),
      constraints: parsePcf('set_io clk 49\nset_io led[0] 37'),
      pcfName: 'pins.pcf',
      topName: 'top_module',
    })
    assert.deepEqual(problems, [])
  })
})

describe('findTopPorts', () => {
  it('finds the module in any .v of the project', () => {
    const files = [
      { name: 'uart_tx.v', content: 'module uart_tx(input clk);\nendmodule\n' },
      { name: 'top_module.v', content: ANSI },
      { name: 'pins.pcf', content: 'set_io CLK12 49' },
    ]
    const found = findTopPorts(files, 'top_module')
    assert.equal(found.file, 'top_module.v')
    assert.equal(found.ports?.length, 4)
  })

  it('reports nothing when no file declares it', () => {
    const found = findTopPorts([{ name: 'a.v', content: 'module a();endmodule' }], 'top_module')
    assert.deepEqual(found, { ports: null, file: null })
  })
})

describe('parsePcfFrequencies', () => {
  it('reads the timing constraints nextpnr uses', () => {
    const out = parsePcfFrequencies(
      [
        '# relojes de la placa',
        'set_io -nowarn CLK12 49',
        'set_frequency CLK12 12',
        'set_frequency CLK100 100  # el rapido',
        '',
      ].join('\n'),
    )
    assert.deepEqual(out, [
      { net: 'CLK12', mhz: 12, line: 3 },
      { net: 'CLK100', mhz: 100, line: 4 },
    ])
  })

  it('ignores malformed lines instead of guessing', () => {
    assert.deepEqual(parsePcfFrequencies('set_frequency CLK12'), [])
    assert.deepEqual(parsePcfFrequencies('set_frequency CLK12 cero'), [])
    assert.deepEqual(parsePcfFrequencies('set_frequency CLK12 -5'), [])
    assert.deepEqual(parsePcfFrequencies('# set_frequency CLK12 12'), [])
  })
})
