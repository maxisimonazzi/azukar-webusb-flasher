<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import { ADBUS_SIGNALS, isCustomBoardId, type AdbusSignal, type BoardProfile } from '@/fpga/boardTypes'

const props = defineProps<{
  board: BoardProfile | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const adbusRows = computed(() => {
  const map = props.board?.programmer.adbus
  if (!map) return []
  return ADBUS_SIGNALS.map((key) => ({
    key,
    label: signalLabel(key),
    pin: map[key],
  }))
})

function signalLabel(key: AdbusSignal): string {
  switch (key) {
    case 'sck':
      return 'SCK'
    case 'mosi':
      return 'MOSI'
    case 'cs':
      return 'CS'
    case 'cdone':
      return 'CDONE'
    case 'creset':
      return 'CRESET'
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

function blurb(id: string): string {
  if (isCustomBoardId(id)) return t('board.customBlurb')
  switch (id) {
    case 'azukar-v2':
      return t('board.azukarBlurb')
    case 'edu-ciaa-fpga':
      return t('board.eduCiaaBlurb')
    default:
      return t('board.genericBlurb')
  }
}
</script>

<template>
  <div
    v-if="board"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="emit('close')"
  >
    <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-lg">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-fg">{{ board.title }}</p>
          <p class="mt-1 text-xs text-muted">
            {{ board.help?.fpgaLabel || `${board.fpga.nextpnr_device} / ${board.fpga.nextpnr_package}` }}
          </p>
        </div>
        <AppButton variant="outline" size="sm" @click="emit('close')">{{ t('fpga.dismissError') }}</AppButton>
      </div>
      <p class="mt-3 text-sm leading-relaxed text-muted">{{ blurb(board.id) }}</p>
      <dl class="mt-4 grid gap-2 text-sm">
        <div v-if="board.help?.clock" class="flex gap-2">
          <dt class="w-20 shrink-0 font-semibold text-fg">{{ t('board.clock') }}</dt>
          <dd class="text-muted">{{ board.help.clock }}</dd>
        </div>
        <div v-if="board.help?.uart" class="flex gap-2">
          <dt class="w-20 shrink-0 font-semibold text-fg">{{ t('board.uart') }}</dt>
          <dd class="text-muted">{{ board.help.uart }}</dd>
        </div>
      </dl>
      <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.adbus') }}
      </p>
      <table class="mt-1 w-full text-left text-sm">
        <tbody>
          <tr v-for="row in adbusRows" :key="row.key" class="border-b border-border/60">
            <th class="py-1 font-mono font-medium text-fg">{{ row.label }}</th>
            <td class="py-1 font-mono text-muted">ADBUS{{ row.pin }}</td>
          </tr>
        </tbody>
      </table>
      <div class="mt-4 flex flex-col gap-1 text-sm">
        <a
          v-if="board.help?.pinoutUrl"
          class="text-primary underline"
          :href="board.help.pinoutUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('board.pinoutLink') }}</a>
        <a
          v-if="board.help?.repoUrl"
          class="text-primary underline"
          :href="board.help.repoUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('board.repoLink') }}</a>
        <a
          v-if="board.help?.siteUrl"
          class="text-primary underline"
          :href="board.help.siteUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ board.help.siteUrl }}</a>
      </div>
      <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.pcf') }}
      </p>
      <pre class="mt-1 max-h-56 overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[0.7rem] leading-relaxed text-fg">{{ board.pcfText || t('board.pcfEmpty') }}</pre>
    </div>
  </div>
</template>
