<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import type { PllRequest, PllSummary } from '@/fpga/icetools'

const props = defineProps<{
  open: boolean
  busy: boolean
  /** Reloj de la placa activa, para no arrancar de cero. */
  defaultInputMhz: number
  summary: PllSummary | null
  verilog: string | null
  error: string | null
}>()

const emit = defineEmits<{
  run: [req: PllRequest]
  add: []
  close: []
}>()

const { t } = useI18n()

const inputMhz = ref(props.defaultInputMhz)
const outputMhz = ref(25)
const moduleName = ref('pll_25')
const fileName = ref('pll.v')
const usePad = ref(false)
const simpleFeedback = ref(true)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    inputMhz.value = props.defaultInputMhz
  },
)

// El nombre del archivo sigue al del módulo mientras el usuario no lo toque.
const fileTouched = ref(false)
watch(moduleName, (name) => {
  if (!fileTouched.value) fileName.value = `${name || 'pll'}.v`
})

const request = computed<PllRequest>(() => ({
  inputMhz: Number(inputMhz.value),
  outputMhz: Number(outputMhz.value),
  moduleName: moduleName.value.trim(),
  fileName: fileName.value.trim(),
  usePad: usePad.value,
  simpleFeedback: simpleFeedback.value,
}))

const achievedOff = computed(() => {
  const achieved = props.summary?.achievedMhz
  if (achieved == null) return null
  const wanted = Number(outputMhz.value)
  if (!Number.isFinite(wanted) || wanted <= 0) return null
  return Math.abs(achieved - wanted)
})

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
          <p class="text-sm font-semibold text-fg">{{ t('pll.title') }}</p>
          <p class="mt-1 text-xs leading-relaxed text-muted">{{ t('pll.intro') }}</p>
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
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <label class="text-xs font-semibold text-muted">
            {{ t('pll.inputMhz') }}
            <input
              v-model.number="inputMhz"
              type="number"
              step="0.001"
              min="10"
              max="133"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            >
          </label>
          <label class="text-xs font-semibold text-muted">
            {{ t('pll.outputMhz') }}
            <input
              v-model.number="outputMhz"
              type="number"
              step="0.001"
              min="16"
              max="275"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            >
          </label>
          <label class="text-xs font-semibold text-muted">
            {{ t('pll.moduleName') }}
            <input
              v-model="moduleName"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            >
          </label>
          <label class="text-xs font-semibold text-muted">
            {{ t('pll.fileName') }}
            <input
              v-model="fileName"
              class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
              @input="fileTouched = true"
            >
          </label>
        </div>

        <div class="mt-3 flex flex-wrap gap-4">
          <label class="flex items-center gap-2 text-xs text-fg">
            <input v-model="usePad" type="checkbox" class="accent-primary">
            {{ t('pll.usePad') }}
          </label>
          <label class="flex items-center gap-2 text-xs text-fg">
            <input v-model="simpleFeedback" type="checkbox" class="accent-primary">
            {{ t('pll.simpleFeedback') }}
          </label>
        </div>

        <p v-if="error" class="mt-3 rounded-md bg-error/10 px-3 py-2 font-mono text-xs text-error">
          {{ error }}
        </p>

        <div v-if="summary" class="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <p class="font-mono text-sm text-fg">
            {{ t('pll.achieved', { n: summary.achievedMhz?.toFixed(3) ?? '—' }) }}
            <span
              v-if="achievedOff != null && achievedOff > 0.001"
              class="ml-2 text-xs text-warning"
            >{{ t('pll.off', { n: achievedOff.toFixed(3) }) }}</span>
          </p>
          <p class="mt-1 font-mono text-xs text-muted">
            DIVR={{ summary.divr }} · DIVF={{ summary.divf }} · DIVQ={{ summary.divq }} ·
            FILTER_RANGE={{ summary.filterRange }} · {{ summary.feedback }}
            <template v-if="summary.vcoMhz"> · VCO {{ summary.vcoMhz }} MHz</template>
          </p>
        </div>

        <pre
          v-if="verilog"
          class="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[0.6875rem] leading-relaxed text-fg"
        >{{ verilog }}</pre>
      </div>

      <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
        <AppButton :disabled="busy" @click="emit('run', request)">
          {{ busy ? t('pll.running') : t('pll.run') }}
        </AppButton>
        <AppButton variant="secondary" :disabled="!verilog || busy" @click="emit('add')">
          {{ t('pll.add', { name: fileName }) }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
