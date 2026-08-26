<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import type { PcfIssue } from '@/fpga/files'

const props = defineProps<{
  issue: PcfIssue | null
  /** Placa activa: de ahí sale el PCF que se ofrece agregar. */
  boardTitle: string
  boardPcf: string
  pcfName: string
}>()

const emit = defineEmits<{
  add: []
  close: []
}>()

const { t } = useI18n()
const bumping = ref(false)

const canAdd = computed(() => props.issue?.kind === 'none' && props.boardPcf.trim().length > 0)
const manyNames = computed(() => (props.issue?.kind === 'many' ? props.issue.names.join(', ') : ''))

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
    v-if="issue"
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
        <p class="text-sm font-semibold text-fg">
          {{ issue.kind === 'many' ? t('fpga.pcfManyTitle') : t('fpga.pcfNoneTitle') }}
        </p>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          :title="t('fpga.cancel')"
          :aria-label="t('fpga.cancel')"
          @click="emit('close')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
            <path
              d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z"
            />
          </svg>
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <template v-if="issue.kind === 'many'">
          <p class="text-sm leading-relaxed text-muted">{{ t('fpga.pcfManyBody') }}</p>
          <p class="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg">
            {{ manyNames }}
          </p>
        </template>
        <template v-else>
          <p class="text-sm leading-relaxed text-muted">{{ t('fpga.pcfNoneBody', { name: pcfName }) }}</p>
          <template v-if="canAdd">
            <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
              {{ t('fpga.pcfNoneBoard', { board: boardTitle }) }}
            </p>
            <pre class="mt-1 max-h-64 overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[0.7rem] leading-relaxed text-fg">{{ boardPcf }}</pre>
          </template>
          <p v-else class="mt-3 text-sm leading-relaxed text-muted">{{ t('fpga.pcfNoneNoBoard') }}</p>
        </template>
      </div>

      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">
          {{ canAdd ? t('fpga.cancel') : t('fpga.dismissError') }}
        </AppButton>
        <AppButton v-if="canAdd" @click="emit('add')">
          {{ t('fpga.pcfNoneAdd', { name: pcfName }) }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
