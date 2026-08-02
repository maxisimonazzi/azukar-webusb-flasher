<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import enHelp from '@/help/en.md?raw'
import esHelp from '@/help/es.md?raw'
import { renderHelpMarkdown } from '@/help/renderHelpMarkdown'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { locale, t } = useI18n()
const bumping = ref(false)

const html = computed(() => {
  const src = locale.value === 'es' ? esHelp : enHelp
  return renderHelpMarkdown(src)
})

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
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="onBackdrop"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      role="dialog"
      aria-modal="true"
      :aria-label="t('app.help')"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <p class="text-sm font-semibold text-fg">{{ t('app.help') }}</p>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          :title="t('app.helpClose')"
          :aria-label="t('app.helpClose')"
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
        <div class="help-md text-sm leading-relaxed text-muted" v-html="html" />
      </div>
      <div class="flex shrink-0 border-t border-border px-5 py-3">
        <AppButton variant="outline" @click="emit('close')">{{ t('app.helpClose') }}</AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-md :deep(h1) {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  font-weight: 650;
  color: var(--fg);
}
.help-md :deep(h2) {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--fg);
}
.help-md :deep(h3) {
  margin: 1rem 0 0.4rem;
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--fg);
}
.help-md :deep(p) {
  margin: 0.45rem 0;
}
.help-md :deep(ul) {
  margin: 0.4rem 0 0.6rem;
  padding-left: 1.2rem;
  list-style: disc;
}
.help-md :deep(li) {
  margin: 0.2rem 0;
}
.help-md :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.8em;
  color: var(--fg);
}
.help-md :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
.help-md :deep(strong) {
  color: var(--fg);
  font-weight: 650;
}
</style>
