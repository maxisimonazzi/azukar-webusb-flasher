<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'

const props = defineProps<{
  open: boolean
  initialName: string
}>()

const emit = defineEmits<{
  export: [name: string]
  close: []
}>()

const { t } = useI18n()
const nameInput = ref<HTMLInputElement | null>(null)
const projectName = ref('')
const bumping = ref(false)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      projectName.value = props.initialName
      await nextTick()
      if (nameInput.value) {
        nameInput.value.focus()
        nameInput.value.select()
      }
    }
  },
  { immediate: true },
)

function onBackdrop() {
  bumping.value = false
  requestAnimationFrame(() => {
    bumping.value = true
  })
}

function onNudgeEnd() {
  bumping.value = false
}

function onConfirm() {
  const clean = projectName.value.trim() || props.initialName.trim() || 'top_module'
  emit('export', clean)
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    onConfirm()
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="onBackdrop"
  >
    <div
      class="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      role="dialog"
      aria-modal="true"
      :aria-label="t('fpga.exportProject')"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <p class="text-sm font-semibold text-fg">{{ t('fpga.exportProject') }}</p>
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

      <div class="space-y-3 px-5 py-4">
        <div>
          <label class="mb-1 block text-xs font-semibold text-muted" for="export-name-input">
            {{ t('fpga.exportProjectName') }}
          </label>
          <div class="flex items-center rounded-md border border-border bg-surface-2 px-3 py-1.5 focus-within:border-primary">
            <input
              id="export-name-input"
              ref="nameInput"
              v-model="projectName"
              type="text"
              class="min-w-0 flex-1 bg-transparent font-mono text-sm text-fg outline-none"
              spellcheck="false"
              @keydown="onKeydown"
            >
            <span class="ml-1 select-none font-mono text-xs text-muted">.zip</span>
          </div>
        </div>
      </div>

      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
        <AppButton @click="onConfirm">{{ t('fpga.exportConfirm') }}</AppButton>
      </div>
    </div>
  </div>
</template>
