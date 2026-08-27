/**
 * Autocompletado del editor. La parte pensada acá es la que se puede probar
 * sin CodeMirror: qué palabras ofrecer y con qué texto reemplazarlas. El
 * pegamento con CM6 vive en `editorExtensions.ts`.
 */

import {
  listModuleNames,
  parseModulePorts,
  parsePcf,
  parsePcfFrequencies,
  type ModulePort,
} from '../fpga/pcfCheck.ts'
import type { BoardClock } from '../fpga/boardTypes.ts'

export type EditorProjectFile = { name: string; content: string }

export type EditorProjectContext = {
  files: EditorProjectFile[]
  top: string
  /** PCF de la placa activa: de ahí salen los pines sugeridos. */
  boardPcf: string
  /** Relojes de la placa, para sugerir la restricción de timing. */
  clocks: BoardClock[]
}

const EMPTY: EditorProjectContext = { files: [], top: '', boardPcf: '', clocks: [] }

let context: EditorProjectContext = EMPTY

/** El editor se remonta seguido; el contexto vive afuera y lo actualiza App. */
export function setEditorProjectContext(next: EditorProjectContext): void {
  context = next
}

export function getEditorProjectContext(): EditorProjectContext {
  return context
}

export const VERILOG_KEYWORDS = [
  'always', 'assign', 'begin', 'case', 'casex', 'casez', 'default', 'defparam',
  'else', 'end', 'endcase', 'endfunction', 'endgenerate', 'endmodule', 'endtask',
  'for', 'function', 'generate', 'genvar', 'if', 'initial', 'inout', 'input',
  'integer', 'localparam', 'module', 'negedge', 'output', 'parameter', 'posedge',
  'reg', 'repeat', 'task', 'wire', 'while',
]

/** Primitivas del iCE40 que la gente instancia a mano. */
export const ICE40_PRIMITIVES = [
  'SB_IO', 'SB_LUT4', 'SB_CARRY', 'SB_DFF', 'SB_DFFE', 'SB_RAM40_4K',
  'SB_PLL40_CORE', 'SB_PLL40_PAD', 'SB_GB', 'SB_WARMBOOT', 'SB_SPRAM256KA',
  'SB_HFOSC', 'SB_LFOSC', 'SB_RGBA_DRV',
]

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_$]*/g
const KEYWORD_SET = new Set([...VERILOG_KEYWORDS, ...ICE40_PRIMITIVES])

/** Identificadores del archivo abierto: señales, instancias, parámetros. */
export function collectIdentifiers(text: string, limit = 400): string[] {
  const out = new Set<string>()
  for (const match of text.matchAll(IDENT_RE)) {
    const word = match[0]
    if (word.length < 2 || KEYWORD_SET.has(word)) continue
    out.add(word)
    if (out.size >= limit) break
  }
  return [...out]
}

export type ModuleInfo = { name: string; file: string; ports: ModulePort[] }

export function collectModules(files: EditorProjectFile[]): ModuleInfo[] {
  const out: ModuleInfo[] = []
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.v')) continue
    for (const name of listModuleNames(file.content)) {
      const ports = parseModulePorts(file.content, name) ?? []
      out.push({ name, file: file.name, ports })
    }
  }
  return out
}

/** `uart_tx u_tx (.clk(clk), .wr(wr));` con placeholders para tabular. */
export function instantiationSnippet(module: ModuleInfo): string {
  const inst = `u_${module.name}`
  if (module.ports.length === 0) return `${module.name} ${inst} ();`
  const lines = module.ports.map(
    (port, i) => `    .${port.name}(\${${i + 1}:${port.name}})`,
  )
  return `${module.name} ${inst} (\n${lines.join(',\n')}\n);`
}

export type PcfSuggestion = {
  label: string
  /** Línea completa que se inserta. */
  apply: string
  detail: string
}

function expandPort(port: ModulePort): string[] {
  if (port.msb == null || port.lsb == null) return [port.name]
  const hi = Math.max(port.msb, port.lsb)
  const lo = Math.min(port.msb, port.lsb)
  if (hi - lo > 256) return [port.name]
  const out: string[] = []
  for (let i = lo; i <= hi; i += 1) out.push(`${port.name}[${i}]`)
  return out
}

/**
 * Lo que falta en el `.pcf`: primero los puertos del top que ya tienen pin en
 * la plantilla de la placa (línea lista para pegar), después los que no.
 */
export function pcfSuggestions(
  ctx: EditorProjectContext,
  currentPcf: string,
): PcfSuggestion[] {
  const already = new Set(
    parsePcf(currentPcf).map((c) => (c.index == null ? c.port : `${c.port}[${c.index}]`)),
  )
  const boardPins = new Map<string, string>()
  for (const entry of parsePcf(ctx.boardPcf)) {
    const key = entry.index == null ? entry.port : `${entry.port}[${entry.index}]`
    boardPins.set(key, entry.pin)
  }

  const wanted: string[] = []
  for (const file of ctx.files) {
    if (!file.name.toLowerCase().endsWith('.v')) continue
    const ports = parseModulePorts(file.content, ctx.top)
    if (!ports) continue
    for (const port of ports) wanted.push(...expandPort(port))
    break
  }

  const out: PcfSuggestion[] = []
  for (const name of wanted) {
    if (already.has(name)) continue
    const pin = boardPins.get(name)
    out.push(
      pin
        ? {
            label: name,
            apply: `set_io -nowarn ${name} ${pin}`,
            detail: `pin ${pin} — plantilla de la placa`,
          }
        : { label: name, apply: `set_io -nowarn ${name} `, detail: 'puerto sin pin' },
    )
  }
  for (const [name, pin] of boardPins) {
    if (already.has(name) || wanted.includes(name)) continue
    out.push({ label: name, apply: `set_io -nowarn ${name} ${pin}`, detail: `pin ${pin}` })
  }
  return out
}

/**
 * Relojes de la placa que todavía no tienen `set_frequency`. Sin esa línea,
 * nextpnr los compara contra su default de 12 MHz.
 */
export function frequencySuggestions(
  ctx: EditorProjectContext,
  currentPcf: string,
): PcfSuggestion[] {
  const already = new Set(parsePcfFrequencies(currentPcf).map((f) => f.net))
  return ctx.clocks
    .filter((clock) => !already.has(clock.name))
    .map((clock) => ({
      label: `set_frequency ${clock.name}`,
      apply: `set_frequency ${clock.name} ${clock.mhz}`,
      detail: `${clock.mhz} MHz — restricción de timing`,
    }))
}

export type SnippetDef = { label: string; detail: string; body: string }

/** Bloques que se escriben siempre igual. `${n:texto}` son los saltos con Tab. */
export const VERILOG_SNIPPETS: SnippetDef[] = [
  {
    label: 'module',
    detail: 'módulo vacío',
    body: [
      'module ${1:nombre} (',
      '    input  wire ${2:clk},',
      '    output reg  ${3:q}',
      ');',
      '    ${4}',
      'endmodule',
      '',
    ].join('\n'),
  },
  {
    label: 'always',
    detail: 'always @(posedge clk)',
    body: ['always @(posedge ${1:clk}) begin', '    ${2}', 'end'].join('\n'),
  },
  {
    label: 'counter',
    detail: 'divisor de reloj',
    body: [
      'reg [${1:23}:0] ${2:cnt} = 0;',
      'always @(posedge ${3:clk}) ${2:cnt} <= ${2:cnt} + 1;',
    ].join('\n'),
  },
  {
    label: 'fsm',
    detail: 'máquina de estados de 3 bloques',
    body: [
      'localparam ${1:IDLE} = 2\'d0, ${2:RUN} = 2\'d1, ${3:DONE} = 2\'d2;',
      'reg [1:0] state = ${1:IDLE}, next;',
      '',
      'always @(posedge ${4:clk}) state <= next;',
      '',
      'always @(*) begin',
      '    next = state;',
      '    case (state)',
      '        ${1:IDLE}: next = ${2:RUN};',
      '        ${2:RUN}:  next = ${3:DONE};',
      '        ${3:DONE}: next = ${1:IDLE};',
      '    endcase',
      'end',
    ].join('\n'),
  },
  {
    label: 'debounce',
    detail: 'antirrebote de un botón',
    body: [
      'reg [${1:15}:0] deb = 0;',
      'reg ${2:btn_clean} = 0;',
      'always @(posedge ${3:clk}) begin',
      '    if (${4:btn_raw} == ${2:btn_clean}) deb <= 0;',
      '    else begin',
      '        deb <= deb + 1;',
      '        if (&deb) ${2:btn_clean} <= ${4:btn_raw};',
      '    end',
      'end',
    ].join('\n'),
  },
  {
    label: 'pwm',
    detail: 'salida PWM de 8 bits',
    body: [
      'reg [7:0] pwm_cnt = 0;',
      'always @(posedge ${1:clk}) pwm_cnt <= pwm_cnt + 1;',
      'assign ${2:led} = (pwm_cnt < ${3:duty});',
    ].join('\n'),
  },
  {
    label: 'rom',
    detail: 'ROM inicializada desde un .hex (icebram)',
    body: [
      'reg [${1:15}:0] ${2:rom} [0:${3:255}];',
      'initial $readmemh("${4:rom.hex}", ${2:rom});',
      'always @(posedge ${5:clk}) ${6:dout} <= ${2:rom}[${7:addr}];',
    ].join('\n'),
  },
  {
    label: 'pll',
    detail: 'instancia de PLL (usá el asistente para los divisores)',
    body: [
      '${1:pll_25} u_pll (',
      '    .clock_in(${2:CLK12}),',
      '    .clock_out(${3:clk}),',
      '    .locked(${4:pll_locked})',
      ');',
    ].join('\n'),
  },
]
