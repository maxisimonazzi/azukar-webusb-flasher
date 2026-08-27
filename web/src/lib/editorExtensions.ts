/**
 * El pegamento con CodeMirror 6: autocompletado, snippets, panel de búsqueda y
 * subrayado de errores. Lo que se puede probar sin CM6 está en
 * `editorComplete.ts`.
 */

import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { search } from '@codemirror/search'
import type { EditorView } from '@codemirror/view'

import {
  collectIdentifiers,
  collectModules,
  frequencySuggestions,
  getEditorProjectContext,
  ICE40_PRIMITIVES,
  instantiationSnippet,
  pcfSuggestions,
  VERILOG_KEYWORDS,
  VERILOG_SNIPPETS,
} from './editorComplete.ts'

export type EditorMark = {
  /** 1-based, como la numera el editor y como la nombran las herramientas. */
  line: number
  severity: 'error' | 'warning'
  message: string
}

const WORD_RE = /[\w$]*/
const PCF_WORD_RE = /[\w$[\].]*/

function snippetOptions(): Completion[] {
  return VERILOG_SNIPPETS.map((s) =>
    snippetCompletion(s.body, {
      label: s.label,
      detail: s.detail,
      type: 'keyword',
      boost: 20,
    }),
  )
}

export function verilogCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(WORD_RE)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const ctx = getEditorProjectContext()
  const doc = context.state.doc.toString()
  const options: Completion[] = [
    ...snippetOptions(),
    ...VERILOG_KEYWORDS.map((label) => ({ label, type: 'keyword' })),
    ...ICE40_PRIMITIVES.map((label) => ({ label, type: 'type', detail: 'iCE40' })),
  ]

  for (const module of collectModules(ctx.files)) {
    options.push(
      snippetCompletion(instantiationSnippet(module), {
        label: module.name,
        detail: `instanciar (${module.file})`,
        type: 'class',
        boost: 10,
      }),
    )
  }

  const taken = new Set(options.map((o) => o.label))
  for (const id of collectIdentifiers(doc)) {
    if (taken.has(id)) continue
    options.push({ label: id, type: 'variable' })
  }

  return { from: word.from, options, validFor: /^[\w$]*$/ }
}

export function pcfCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(PCF_WORD_RE)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const ctx = getEditorProjectContext()
  const doc = context.state.doc.toString()
  const options: Completion[] = [
    snippetCompletion('set_io -nowarn ${1:PUERTO} ${2:pin}', {
      label: 'set_io',
      detail: 'constraint de pin',
      type: 'keyword',
      boost: 20,
    }),
    snippetCompletion('set_frequency ${1:CLK} ${2:12}', {
      label: 'set_frequency',
      detail: 'reloj esperado en MHz',
      type: 'keyword',
    }),
  ]
  for (const suggestion of frequencySuggestions(ctx, doc)) {
    options.push({
      label: suggestion.label,
      apply: suggestion.apply,
      detail: suggestion.detail,
      type: 'keyword',
      boost: 8,
    })
  }
  for (const suggestion of pcfSuggestions(ctx, doc)) {
    options.push({
      label: suggestion.label,
      apply: suggestion.apply,
      detail: suggestion.detail,
      type: 'variable',
      boost: 5,
    })
  }
  return { from: word.from, options }
}

export function completionFor(language: 'verilog' | 'pcf' | 'plain') {
  switch (language) {
    case 'verilog':
      return autocompletion({ override: [verilogCompletion], activateOnTyping: true })
    case 'pcf':
      return autocompletion({ override: [pcfCompletion], activateOnTyping: true })
    case 'plain':
      return autocompletion({ override: [] })
    default: {
      const _exhaustive: never = language
      return _exhaustive
    }
  }
}

export function searchExtension() {
  return search({ top: true })
}

/** Marca la línea entera: las herramientas dan línea, no columna. */
export function marksToDiagnostics(view: EditorView, marks: EditorMark[]): Diagnostic[] {
  const total = view.state.doc.lines
  const out: Diagnostic[] = []
  const seen = new Set<string>()
  for (const mark of marks) {
    if (!Number.isInteger(mark.line) || mark.line < 1 || mark.line > total) continue
    const key = `${mark.line}:${mark.severity}:${mark.message}`
    if (seen.has(key)) continue
    seen.add(key)
    const line = view.state.doc.line(mark.line)
    out.push({
      from: line.from,
      to: line.to,
      severity: mark.severity,
      message: mark.message,
    })
  }
  return out
}

export function applyMarks(view: EditorView, marks: EditorMark[]): void {
  view.dispatch(setDiagnostics(view.state, marksToDiagnostics(view, marks)))
}

/** Deja el cursor en la línea pedida y la centra. */
export function scrollToLine(view: EditorView, line: number): void {
  const total = view.state.doc.lines
  const target = Math.min(Math.max(1, Math.trunc(line)), total)
  const pos = view.state.doc.line(target).from
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  view.focus()
}
