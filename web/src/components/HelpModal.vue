<script setup lang="ts">
import { computed } from 'vue'
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

const html = computed(() => {
  const src = locale.value === 'es' ? esHelp : enHelp
  return renderHelpMarkdown(src)
})
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      role="dialog"
      aria-modal="true"
      :aria-label="t('app.help')"
    >
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p class="text-sm font-semibold text-fg">{{ t('app.help') }}</p>
        <div class="flex items-center gap-2">
          <AppButton variant="outline" size="sm" @click="emit('close')">{{ t('app.helpClose') }}</AppButton>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
            :aria-label="t('app.helpClose')"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div class="help-md text-sm leading-relaxed text-muted" v-html="html" />
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
