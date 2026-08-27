<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import { SHARE_URL_WARN } from '@/fpga/shareLink'

const props = defineProps<{
  open: boolean
  url: string
  fileCount: number
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const copied = ref(false)

const tooLong = computed(() => props.url.length > SHARE_URL_WARN)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    /* sin clipboard: queda el textarea para copiar a mano */
  }
}

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
          <p class="text-sm font-semibold text-fg">{{ t('share.title') }}</p>
          <p class="mt-1 text-xs leading-relaxed text-muted">
            {{ t('share.intro', { n: fileCount }) }}
          </p>
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
        <textarea
          :value="url"
          readonly
          rows="5"
          class="w-full resize-none rounded-lg border border-border bg-surface-2 p-3 font-mono text-[0.6875rem] leading-relaxed break-all text-fg"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
        <p class="mt-2 font-mono text-[0.6875rem] text-muted">
          {{ t('share.length', { n: url.length }) }}
        </p>
        <p v-if="tooLong" class="mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          {{ t('share.tooLong') }}
        </p>
        <p class="mt-3 text-xs leading-relaxed text-muted">{{ t('share.privacy') }}</p>
      </div>

      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
        <AppButton @click="copy">{{ copied ? t('share.copied') : t('share.copy') }}</AppButton>
      </div>
    </div>
  </div>
</template>
