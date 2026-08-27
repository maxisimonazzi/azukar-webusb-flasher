<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Problem } from '@/fpga/problems'

defineProps<{
  items: Problem[]
  /** Mientras corre la revisión, para no mostrar "sin problemas" de más. */
  checking?: boolean
}>()

const emit = defineEmits<{
  /** Click en un problema: abrir ese archivo en esa línea. */
  select: [problem: Problem]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <p v-if="items.length === 0" class="p-3 font-mono text-xs text-muted">
      {{ checking ? t('ide.checking') : t('ide.noProblems') }}
    </p>
    <ul v-else class="divide-y divide-border">
      <li v-for="problem in items" :key="problem.id">
        <button
          type="button"
          class="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-surface-2"
          :disabled="!problem.file"
          :class="problem.file ? '' : 'cursor-default'"
          @click="problem.file && emit('select', problem)"
        >
          <span
            class="mt-0.5 shrink-0 rounded px-1 py-0.5 text-[0.625rem] font-bold uppercase"
            :class="
              problem.severity === 'error'
                ? 'bg-error/15 text-error'
                : 'bg-warning/20 text-warning'
            "
          >{{ problem.severity === 'error' ? t('ide.error') : t('ide.warning') }}</span>
          <span class="min-w-0 flex-1">
            <span class="block font-mono text-xs leading-relaxed break-words text-fg">{{ problem.message }}</span>
            <span
              v-if="problem.hint"
              class="mt-1 block border-l-2 border-border-strong pl-2 text-[0.6875rem] leading-relaxed text-muted"
            >{{ problem.hint }}</span>
            <span class="mt-0.5 block font-mono text-[0.6875rem] text-muted">
              <template v-if="problem.file">
                {{ problem.file }}<template v-if="problem.line">:{{ problem.line }}</template>
              </template>
              <template v-else>{{ t('ide.noLocation') }}</template>
              <span v-if="problem.origin === 'pcf'" class="ml-2 text-subtle">{{ t('ide.fromPcfCheck') }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
