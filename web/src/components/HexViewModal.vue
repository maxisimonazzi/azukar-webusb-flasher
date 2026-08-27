<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import { formatHexDump } from '@/fpga/flashDump'

const props = defineProps<{
  open: boolean
  title: string
  data: Uint8Array | null
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

/** Página de 4 KiB: alcanza para mirar y no mata al navegador. */
const PAGE = 4096
const offset = ref(0)

watch(
  () => props.open,
  (open) => {
    if (open) offset.value = 0
  },
)

const total = computed(() => props.data?.length ?? 0)
const dump = computed(() => {
  const data = props.data
  if (!data || data.length === 0) return ''
  const from = Math.min(offset.value, Math.max(0, data.length - 1))
  const to = Math.min(from + PAGE, data.length)
  return formatHexDump(data.subarray(from, to), from)
})

function step(delta: number) {
  const next = offset.value + delta * PAGE
  offset.value = Math.min(Math.max(0, next), Math.max(0, total.value - PAGE))
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
      class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      role="dialog"
      aria-modal="true"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <p class="text-sm font-semibold text-fg">{{ title }}</p>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          :aria-label="t('fpga.cancel')"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-auto bg-surface-2">
        <pre class="p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre text-fg">{{
          dump || t('hex.empty')
        }}</pre>
      </div>

      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <p class="font-mono text-[0.6875rem] text-muted">
          {{ t('hex.range', { from: offset, to: Math.min(offset + 4096, total), total }) }}
        </p>
        <div class="flex gap-2">
          <AppButton size="sm" variant="outline" :disabled="offset <= 0" @click="step(-1)">
            {{ t('hex.prev') }}
          </AppButton>
          <AppButton
            size="sm"
            variant="outline"
            :disabled="offset + 4096 >= total"
            @click="step(1)"
          >
            {{ t('hex.next') }}
          </AppButton>
          <AppButton size="sm" @click="emit('close')">{{ t('hex.close') }}</AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
