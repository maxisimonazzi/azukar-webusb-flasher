<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'

defineProps<{
  open: boolean
  title: string
  body: string
  confirmLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const { t } = useI18n()
const bumping = ref(false)

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
      class="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <p class="text-sm font-semibold text-fg">{{ title }}</p>
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

      <p class="px-5 py-4 text-sm leading-relaxed text-muted">{{ body }}</p>

      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
        <AppButton @click="emit('confirm')">{{ confirmLabel }}</AppButton>
      </div>
    </div>
  </div>
</template>
