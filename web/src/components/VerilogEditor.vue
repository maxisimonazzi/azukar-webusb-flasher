<script setup lang="ts">
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { pcfLanguage, verilogLanguage, type EditorLanguage } from '@/lib/verilogEditor'
import { editorFontSizeRef } from '@/prefs/editorFont'
import { themeRef } from '@/prefs/theme'

const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    /** Tailwind height classes for the editor host. */
    heightClass?: string
    /** Override the global editor font (page-local size). */
    fontSize?: number
    /** Grammar for the open file. `.pcf` no es Verilog. */
    language?: EditorLanguage
  }>(),
  {
    heightClass: 'h-72 min-h-72',
    language: 'verilog',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
const themeComp = new Compartment()
const fontComp = new Compartment()

/** Syntax colors from design tokens (--syntax-*) so light/dark stay in sync. */
const verilogHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-kw)', fontWeight: '700' },
  { tag: tags.comment, color: 'var(--syntax-com)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--syntax-str)' },
  { tag: tags.number, color: 'var(--syntax-num)' },
  { tag: tags.typeName, color: 'var(--syntax-type)', fontWeight: '600' },
  { tag: tags.className, color: 'var(--syntax-inst)', fontWeight: '700' },
  { tag: tags.attributeName, color: 'var(--syntax-type)', fontWeight: '600' },
  { tag: tags.variableName, color: 'var(--fg)' },
  { tag: tags.definition(tags.variableName), color: 'var(--syntax-fn)' },
  { tag: tags.operator, color: 'var(--syntax-op)' },
  { tag: tags.meta, color: 'var(--syntax-fn)' },
  { tag: tags.bracket, color: 'var(--syntax-op)', fontWeight: '600' },
  { tag: tags.punctuation, color: 'var(--muted)' },
])

const editorChrome = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--surface)',
    color: 'var(--fg)',
  },
  '.cm-scroller': {
    fontFamily:
      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontVariantLigatures: 'common-ligatures',
    backgroundColor: 'var(--surface)',
  },
  '.cm-content': { caretColor: 'var(--primary)' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-2)',
    color: 'var(--muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '3.25ch',
    padding: '0 0.45rem 0 0.35rem',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--primary) 8%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface-3)' },
  '.cm-selectionBackground': {
    backgroundColor:
      'color-mix(in oklab, var(--primary) 22%, transparent) !important',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor:
      'color-mix(in oklab, var(--primary) 28%, transparent) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
})

function themeExtensions(dark: boolean) {
  return [
    EditorView.theme({}, { dark }),
    editorChrome,
    syntaxHighlighting(verilogHighlight),
  ]
}

function fontExtension(px: number) {
  return EditorView.theme({
    '&': { fontSize: `${px}px` },
  })
}

function languageExtensions() {
  switch (props.language) {
    case 'pcf':
      return [pcfLanguage]
    case 'plain':
      return []
    case 'verilog':
      return [verilogLanguage]
    default: {
      const _exhaustive: never = props.language
      return _exhaustive
    }
  }
}

function mountEditor(doc: string) {
  if (!host.value) return
  view?.destroy()
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ...languageExtensions(),
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.editable.of(!props.readonly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit('update:modelValue', update.state.doc.toString())
          }
        }),
        themeComp.of(themeExtensions(themeRef.value === 'dark')),
        fontComp.of(fontExtension(props.fontSize ?? editorFontSizeRef.value)),
      ],
    }),
    parent: host.value,
  })
}

onMounted(() => mountEditor(props.modelValue))

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== next) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: next },
      })
    }
  },
)

watch(
  () => props.readonly,
  () => {
    if (!view) return
    mountEditor(view.state.doc.toString())
  },
)

watch(themeRef, (theme) => {
  view?.dispatch({
    effects: themeComp.reconfigure(themeExtensions(theme === 'dark')),
  })
})

watch(
  () => props.fontSize ?? editorFontSizeRef.value,
  (px) => {
    view?.dispatch({
      effects: fontComp.reconfigure(fontExtension(px)),
    })
  },
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div
    ref="host"
    class="overflow-hidden rounded-lg border border-border"
    :class="heightClass"
  />
</template>
