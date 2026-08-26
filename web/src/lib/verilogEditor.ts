import { StreamLanguage } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { verilog } from '@codemirror/legacy-modes/mode/verilog'

/**
 * CM6 `indentOnInput` tests the line prefix up to the cursor, not the
 * character just typed. The legacy Verilog regex matches any `()[]{}` in
 * that prefix, so editing `$dumpvars(0, tb)` reindents the whole line
 * (typically 8 spaces → 6, one `indentUnit`). Keep electric indent only
 * for block closers at the start of the line (`end`, `join`, `else`).
 */
const indentOnInput = /^\s*(?:end\w*|join(?:_any|_none)?|else)\b/

/** Gramática del editor según la extensión del archivo abierto. */
export type EditorLanguage = 'verilog' | 'pcf' | 'plain'

/**
 * The stock CM5 Verilog mode paints every identifier as `variable`.
 * VS Code's grammar tags `flip_flop_d u0 (` as an instantiation. We look
 * ahead for that shape (and `#(...)` parameters) and retag those names.
 */
type InstPhase = null | 'want-name' | 'want-hash' | 'in-hash'

type VerilogState = {
  instPhase: InstPhase
  hashDepth: number
}

function asInstState(state: unknown): VerilogState {
  const s = state as VerilogState
  if (s.instPhase === undefined) s.instPhase = null
  if (s.hashDepth === undefined) s.hashDepth = 0
  return s
}

export const verilogLanguage = StreamLanguage.define({
  ...verilog,
  startState(indentUnit) {
    const state = asInstState(verilog.startState!(indentUnit))
    state.instPhase = null
    state.hashDepth = 0
    return state
  },
  token(stream, raw) {
    const state = asInstState(raw)

    if (stream.match(/^\.[A-Za-z_][\w$]*(?=\s*\()/, false)) {
      stream.match(/^\.[A-Za-z_][\w$]*/)
      return 'attribute'
    }

    const style = verilog.token(stream, raw)
    const text = stream.current()

    if (state.instPhase === 'want-name') {
      if (style === 'variable') {
        state.instPhase = null
        return 'inst'
      }
    } else if (
      state.instPhase === 'want-hash' &&
      style === 'def' &&
      text.startsWith('#')
    ) {
      state.instPhase = 'in-hash'
      state.hashDepth = 0
    } else if (state.instPhase === 'in-hash' && style === 'bracket') {
      if (text === '(') state.hashDepth += 1
      else if (text === ')') {
        state.hashDepth -= 1
        if (state.hashDepth <= 0) state.instPhase = 'want-name'
      }
    } else if (style === 'variable' && state.instPhase === null) {
      const rest = stream.string.slice(stream.pos)
      if (/^\s+[A-Za-z_][\w$]*\s*\(/.test(rest)) {
        state.instPhase = 'want-name'
        return 'inst'
      }
      if (/^\s+#/.test(rest)) {
        state.instPhase = 'want-hash'
        return 'inst'
      }
    }

    return style
  },
  tokenTable: {
    inst: tags.className,
  },
  languageData: {
    ...verilog.languageData,
    indentOnInput,
  },
})

/**
 * Constraint file de nextpnr (`.pcf`): `set_io -nowarn LED0 45 # output`.
 * Alcanza con un modo por línea: comentario `#`, comando, flag, nombre y pin.
 */
export const pcfLanguage = StreamLanguage.define({
  name: 'pcf',
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^#.*/)) return 'pcfComment'
    if (stream.match(/^set_(?:io|frequency)\b/)) return 'pcfCommand'
    if (stream.match(/^--?[A-Za-z][\w-]*/)) return 'pcfFlag'
    if (stream.match(/^[0-9]+\b/)) return 'pcfPin'
    if (stream.match(/^[A-Za-z_][\w$.:-]*(?:\[[0-9]+\])?/)) return 'pcfName'
    stream.next()
    return null
  },
  tokenTable: {
    pcfComment: tags.comment,
    pcfCommand: tags.keyword,
    pcfFlag: tags.meta,
    pcfPin: tags.number,
    pcfName: tags.variableName,
  },
  languageData: {
    commentTokens: { line: '#' },
  },
})
