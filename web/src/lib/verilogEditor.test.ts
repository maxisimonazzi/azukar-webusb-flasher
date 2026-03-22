import assert from 'node:assert/strict'
import { test } from 'node:test'

import { indentOnInput } from '@codemirror/language'
import { EditorState } from '@codemirror/state'

import { verilogLanguage } from './verilogEditor.ts'

function typeInsideParens(doc: string, from: string, insert: string) {
  const pos = doc.indexOf(from)
  const state = EditorState.create({
    doc,
    selection: { anchor: pos, head: pos + from.length },
    extensions: [indentOnInput(), verilogLanguage],
  })
  return state.update({
    changes: { from: pos, to: pos + from.length, insert },
    userEvent: 'input.type',
  }).state.doc.toString()
}

test('typing inside $dumpvars(...) does not change the line indent', () => {
  const doc = [
    'module t;',
    '    initial begin',
    '        $dumpvars(0, t);',
    '    end',
    'endmodule',
  ].join('\n')
  const next = typeInsideParens(doc, '0', '1')
  const dumpLine = next.split('\n').find((line) => line.includes('$dumpvars'))
  assert.equal(dumpLine, '        $dumpvars(1, t);')
})

test('typing a space inside parentheses does not change the line indent', () => {
  const doc = [
    'module t;',
    '    initial begin',
    '        $dumpvars(0,t);',
    '    end',
    'endmodule',
  ].join('\n')
  const next = typeInsideParens(doc, ',', ', ')
  const dumpLine = next.split('\n').find((line) => line.includes('$dumpvars'))
  assert.equal(dumpLine, '        $dumpvars(0, t);')
})
