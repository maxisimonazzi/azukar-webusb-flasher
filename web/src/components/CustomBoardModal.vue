<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import {
  ADBUS_SIGNALS,
  NEXTPRN_DEVICES,
  NEXTPRN_PACKAGES,
  adbusHasDuplicates,
  pcfRowsToText,
  pcfTextToRows,
  type AdbusBits,
  type AdbusSignal,
  type CustomBoardDraft,
  type PcfDir,
  type PcfRow,
} from '@/fpga/boardTypes'

const props = defineProps<{
  open: boolean
  initial: CustomBoardDraft
}>()

const emit = defineEmits<{
  save: [draft: CustomBoardDraft]
  close: []
}>()

const { t } = useI18n()

type PcfTab = 'file' | 'form' | 'text'

const title = ref('')
const device = ref('hx8k')
const packageName = ref('tq144:4k')
const adbus = ref<AdbusBits>({ sck: 0, mosi: 1, cs: 4, cdone: 6, creset: 7 })
const pcf = ref('')
const rows = ref<PcfRow[]>([])
const tab = ref<PcfTab>('text')
const pcfFile = ref<HTMLInputElement | null>(null)
const bumping = ref(false)
const dup = computed(() => adbusHasDuplicates(adbus.value))

const dirs: PcfDir[] = ['input', 'output', 'inout']
const adbusPins = [0, 1, 2, 3, 4, 5, 6, 7]

function signalLabel(key: AdbusSignal): string {
  switch (key) {
    case 'sck':
      return 'SCK'
    case 'mosi':
      return 'MOSI'
    case 'cs':
      return 'CS#'
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

function dirLabel(dir: PcfDir): string {
  switch (dir) {
    case 'input':
      return t('board.dirIn')
    case 'output':
      return t('board.dirOut')
    case 'inout':
      return t('board.dirInout')
    default: {
      const _exhaustive: never = dir
      return _exhaustive
    }
  }
}

function hydrate(draft: CustomBoardDraft) {
  title.value = draft.title
  device.value = draft.device
  packageName.value = draft.package
  adbus.value = { ...draft.adbus }
  pcf.value = draft.pcf
  rows.value = pcfTextToRows(draft.pcf)
  if (!rows.value.length) {
    rows.value = [{ name: '', pin: '', dir: 'inout' }]
  }
  tab.value = 'text'
  bumping.value = false
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) hydrate(props.initial)
  },
)

function setTab(next: PcfTab) {
  switch (next) {
    case 'form':
      rows.value = pcfTextToRows(pcf.value)
      if (!rows.value.length) rows.value = [{ name: '', pin: '', dir: 'inout' }]
      break
    case 'text':
    case 'file':
      if (tab.value === 'form') pcf.value = pcfRowsToText(rows.value)
      break
    default: {
      const _exhaustive: never = next
      return _exhaustive
    }
  }
  tab.value = next
}

function addRow() {
  rows.value = [...rows.value, { name: '', pin: '', dir: 'inout' }]
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index)
}

function onPcfFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void file.text().then((text) => {
    pcf.value = text
    rows.value = pcfTextToRows(text)
    tab.value = 'text'
  })
}

function onAdbus(key: AdbusSignal, ev: Event) {
  const el = ev.target
  if (!(el instanceof HTMLSelectElement)) return
  adbus.value = { ...adbus.value, [key]: Number(el.value) }
}

function onSave() {
  if (dup.value) return
  if (tab.value === 'form') pcf.value = pcfRowsToText(rows.value)
  if (!pcf.value.trim()) return
  emit('save', {
    title: title.value,
    device: device.value,
    package: packageName.value,
    vid: props.initial.vid,
    pid: props.initial.pid,
    adbus: { ...adbus.value },
    pcf: pcf.value,
  })
}

function onBackdrop() {
  bumping.value = false
  requestAnimationFrame(() => {
    bumping.value = true
  })
}

function onNudgeEnd() {
  bumping.value = false
}

const canSave = computed(() => {
  if (dup.value) return false
  if (tab.value === 'form') {
    return rows.value.some((row) => row.name.trim() && row.pin.trim())
  }
  return pcf.value.trim().length > 0
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="onBackdrop"
  >
    <div
      class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="bumping ? 'modal-nudge' : ''"
      @animationend="onNudgeEnd"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
        <p class="text-sm font-semibold text-fg">{{ t('board.customTitle') }}</p>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          :title="t('board.closeCustom')"
          :aria-label="t('board.closeCustom')"
          @click="emit('close')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
            <path
              d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z"
            />
          </svg>
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-4">
      <p class="text-sm leading-relaxed text-muted">{{ t('board.customIntro') }}</p>
      <p class="mt-2 text-sm leading-relaxed text-muted">{{ t('board.customRemind') }}</p>
      <p class="mt-2 rounded-md border border-border bg-surface-2/70 px-3 py-2 text-sm leading-relaxed text-muted">
        {{ t('board.storageNotice') }}
      </p>

      <label class="mt-4 block text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.name') }}
        <input
          v-model="title"
          class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-sans text-sm font-normal tracking-normal text-fg normal-case"
        >
      </label>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('board.device') }}
          <select
            v-model="device"
            class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm font-normal tracking-normal text-fg normal-case"
          >
            <option v-for="d in NEXTPRN_DEVICES" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('board.package') }}
          <select
            v-model="packageName"
            class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm font-normal tracking-normal text-fg normal-case"
          >
            <option v-for="p in NEXTPRN_PACKAGES" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
      </div>

      <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.adbus') }}
      </p>
      <p class="mt-1 text-xs text-muted">{{ t('board.adbusHint') }}</p>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <label
          v-for="key in ADBUS_SIGNALS"
          :key="key"
          class="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-fg"
        >
          <span class="font-mono font-semibold">{{ signalLabel(key) }}</span>
          <select
            :value="adbus[key]"
            class="rounded-md border border-border bg-surface px-1 py-0.5 font-mono text-xs"
            @change="onAdbus(key, $event)"
          >
            <option v-for="n in adbusPins" :key="n" :value="n">ADBUS{{ n }}</option>
          </select>
        </label>
      </div>
      <p v-if="dup" class="mt-2 text-xs text-error">{{ t('board.adbusDup') }}</p>

      <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.pcf') }}
      </p>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">
        <li>{{ t('board.pcfFileHint') }}</li>
        <li>{{ t('board.pcfFormHint') }}</li>
        <li>{{ t('board.pcfTextHint') }}</li>
      </ul>
      <div class="mt-2 inline-flex rounded-lg border border-border bg-surface-2/60 p-0.5">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs font-semibold"
          :class="tab === 'file' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-fg'"
          @click="setTab('file')"
        >
          {{ t('board.pcfFile') }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs font-semibold"
          :class="tab === 'form' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-fg'"
          @click="setTab('form')"
        >
          {{ t('board.pcfForm') }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs font-semibold"
          :class="tab === 'text' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-fg'"
          @click="setTab('text')"
        >
          {{ t('board.pcfText') }}
        </button>
      </div>

      <div v-if="tab === 'file'" class="mt-3">
        <input
          ref="pcfFile"
          type="file"
          accept=".pcf,text/plain"
          class="text-sm"
          @change="onPcfFile"
        >
      </div>

      <div v-else-if="tab === 'form'" class="mt-3 space-y-2">
        <div
          v-for="(row, i) in rows"
          :key="i"
          class="grid grid-cols-[1fr_5rem_8rem_2rem] items-center gap-1"
        >
          <input
            v-model="row.name"
            class="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
            :placeholder="t('board.signal')"
          >
          <input
            v-model="row.pin"
            class="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
            :placeholder="t('board.pin')"
          >
          <select
            v-model="row.dir"
            class="rounded-md border border-border bg-surface-2 px-1 py-1 text-xs"
          >
            <option v-for="d in dirs" :key="d" :value="d">{{ dirLabel(d) }}</option>
          </select>
          <button type="button" class="text-muted hover:text-error" @click="removeRow(i)">×</button>
        </div>
        <AppButton variant="outline" size="sm" @click="addRow">{{ t('board.addPin') }}</AppButton>
      </div>

      <textarea
        v-else
        v-model="pcf"
        class="mt-3 min-h-32 w-full resize-y rounded-md border border-border bg-surface-2 p-2 font-mono text-[0.7rem] text-fg"
        rows="12"
        spellcheck="false"
      />
      </div>

      <div class="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-3">
        <AppButton :disabled="!canSave" @click="onSave">{{ t('board.saveCustom') }}</AppButton>
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
      </div>
    </div>
  </div>
</template>
