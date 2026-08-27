<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import { inspectHexFile } from '@/fpga/icetools'

const props = defineProps<{
  open: boolean
  busy: boolean
  /** Los `.hex` que hay en el proyecto. */
  hexFiles: { name: string; content: string }[]
  /** `false` mientras no haya un compile exitoso del que salga el .asc. */
  hasBitstream: boolean
  error: string | null
  note: string | null
}>()

const emit = defineEmits<{
  run: [pair: { from: string; to: string }]
  generate: [spec: { widthBits: number; words: number; name: string }]
  close: []
}>()

const { t } = useI18n()

const from = ref('')
const to = ref('')
const genWidth = ref(16)
const genWords = ref(256)
const genName = ref('rom.hex')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const names = props.hexFiles.map((f) => f.name)
    from.value = names[0] ?? ''
    to.value = names[1] ?? names[0] ?? ''
  },
)

function shapeOf(name: string): string {
  const file = props.hexFiles.find((f) => f.name === name)
  if (!file) return ''
  const out = inspectHexFile(file.content)
  if ('error' in out) return t(`icebram.${out.error}`)
  return t('icebram.shape', { words: out.info.words, bits: out.info.widthBits })
}

const canRun = computed(
  () => props.hasBitstream && from.value && to.value && from.value !== to.value && !props.busy,
)

const bumping = ref(false)

/** Click en el fondo: rebota para decir "salí por el botón", no cierra. */
function onBackdrop() {
  bumping.value = false
  requestAnimationFrame(() => {
    bumping.value = true
  })
}

function onNudgeEnd() {
  bumping.value = false
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="onBackdrop"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      role="dialog"
      aria-modal="true"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <div>
          <p class="text-sm font-semibold text-fg">{{ t('icebram.title') }}</p>
          <p class="mt-1 text-xs leading-relaxed text-muted">{{ t('icebram.intro') }}</p>
        </div>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          :aria-label="t('fpga.cancel')"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p v-if="!hasBitstream" class="mb-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          {{ t('icebram.needCompile') }}
        </p>
        <p v-if="hexFiles.length === 0" class="mb-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
          {{ t('icebram.noHex') }}
        </p>

        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <label class="text-xs font-semibold text-muted">
            {{ t('icebram.from') }}
            <select
              v-model="from"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            >
              <option v-for="file in hexFiles" :key="file.name" :value="file.name">{{ file.name }}</option>
            </select>
            <span class="mt-1 block font-mono text-[0.6875rem] text-subtle">{{ shapeOf(from) }}</span>
          </label>
          <label class="text-xs font-semibold text-muted">
            {{ t('icebram.to') }}
            <select
              v-model="to"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            >
              <option v-for="file in hexFiles" :key="file.name" :value="file.name">{{ file.name }}</option>
            </select>
            <span class="mt-1 block font-mono text-[0.6875rem] text-subtle">{{ shapeOf(to) }}</span>
          </label>
        </div>

        <div class="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <p class="text-xs font-semibold text-fg">{{ t('icebram.genTitle') }}</p>
          <p class="mt-1 text-[0.6875rem] leading-relaxed text-muted">{{ t('icebram.genIntro') }}</p>
          <div class="mt-2 flex flex-wrap items-end gap-2">
            <label class="text-[0.6875rem] font-semibold text-muted">
              {{ t('icebram.width') }}
              <input
                v-model.number="genWidth"
                type="number"
                min="1"
                max="64"
                class="mt-1 w-20 rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm text-fg"
              >
            </label>
            <label class="text-[0.6875rem] font-semibold text-muted">
              {{ t('icebram.words') }}
              <input
                v-model.number="genWords"
                type="number"
                min="256"
                step="256"
                class="mt-1 w-24 rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm text-fg"
              >
            </label>
            <label class="text-[0.6875rem] font-semibold text-muted">
              {{ t('icebram.genName') }}
              <input
                v-model="genName"
                class="mt-1 w-36 rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm text-fg"
              >
            </label>
            <AppButton
              size="sm"
              variant="secondary"
              :disabled="busy"
              @click="emit('generate', { widthBits: genWidth, words: genWords, name: genName })"
            >
              {{ t('icebram.generate') }}
            </AppButton>
          </div>
        </div>

        <p v-if="note" class="mt-3 rounded-md bg-success/10 px-3 py-2 font-mono text-xs text-success">
          {{ note }}
        </p>
        <p v-if="error" class="mt-3 rounded-md bg-error/10 px-3 py-2 font-mono text-xs text-error">
          {{ error }}
        </p>
      </div>

      <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
        <AppButton :disabled="!canRun" @click="emit('run', { from, to })">
          {{ busy ? t('icebram.running') : t('icebram.run') }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
