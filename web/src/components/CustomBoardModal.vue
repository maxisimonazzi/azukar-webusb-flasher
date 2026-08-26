<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/ui/AppButton.vue'
import {
  ADBUS_SIGNALS,
  NEXTPRN_DEVICES,
  NEXTPRN_PACKAGES,
  adbusHasDuplicates,
  type AdbusBits,
  type AdbusSignal,
  type CustomBoardDraft,
} from '@/fpga/boardTypes'
import { PROJECT_PCF } from '@/fpga/files'

const props = defineProps<{
  open: boolean
  initial: CustomBoardDraft
}>()

const emit = defineEmits<{
  save: [draft: CustomBoardDraft]
  close: []
}>()

const { t } = useI18n()

const title = ref('')
const device = ref('hx8k')
const packageName = ref('tq144:4k')
const adbus = ref<AdbusBits>({ sck: 0, mosi: 1, cs: 4, cdone: 6, creset: 7 })
const vid = ref('')
const pid = ref('')
const bumping = ref(false)
const dup = computed(() => adbusHasDuplicates(adbus.value))

const adbusPins = [0, 1, 2, 3, 4, 5, 6, 7]
const pcfName = PROJECT_PCF

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

/** Acepta `0x0403` o `1027`. Fuera de 16 bits no es un ID USB. */
function parseUsbId(raw: string): number | null {
  const text = raw.trim()
  let n: number
  if (/^0[xX][0-9a-fA-F]{1,4}$/.test(text)) n = Number.parseInt(text.slice(2), 16)
  else if (/^[0-9]{1,5}$/.test(text)) n = Number.parseInt(text, 10)
  else return null
  return n >= 0 && n <= 0xffff ? n : null
}

function usbIdText(value: number): string {
  return `0x${value.toString(16).padStart(4, '0')}`
}

const vidValue = computed(() => parseUsbId(vid.value))
const pidValue = computed(() => parseUsbId(pid.value))
const badUsb = computed(() => vidValue.value == null || pidValue.value == null)

function hydrate(draft: CustomBoardDraft) {
  title.value = draft.title
  device.value = draft.device
  packageName.value = draft.package
  adbus.value = { ...draft.adbus }
  vid.value = usbIdText(draft.vid)
  pid.value = usbIdText(draft.pid)
  bumping.value = false
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) hydrate(props.initial)
  },
)

function onAdbus(key: AdbusSignal, ev: Event) {
  const el = ev.target
  if (!(el instanceof HTMLSelectElement)) return
  adbus.value = { ...adbus.value, [key]: Number(el.value) }
}

function onSave() {
  const nextVid = vidValue.value
  const nextPid = pidValue.value
  if (dup.value || nextVid == null || nextPid == null) return
  emit('save', {
    title: title.value,
    device: device.value,
    package: packageName.value,
    vid: nextVid,
    pid: nextPid,
    adbus: { ...adbus.value },
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

const canSave = computed(() => !dup.value && !badUsb.value)
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
      <p class="mt-2 rounded-md border border-border bg-surface-2/70 px-3 py-2 text-sm leading-relaxed text-muted">
        {{ t('board.pcfInProject', { name: pcfName }) }}
      </p>
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

      <p class="mt-4 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
        {{ t('board.fpgaPart') }}
      </p>
      <p class="mt-1 text-xs text-muted">{{ t('board.fpgaPartHint') }}</p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
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
        {{ t('board.usb') }}
      </p>
      <p class="mt-1 text-xs text-muted">{{ t('board.usbHint') }}</p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('board.vid') }}
          <input
            v-model="vid"
            spellcheck="false"
            class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm font-normal tracking-normal text-fg normal-case"
          >
        </label>
        <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('board.pid') }}
          <input
            v-model="pid"
            spellcheck="false"
            class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm font-normal tracking-normal text-fg normal-case"
          >
        </label>
      </div>
      <p v-if="badUsb" class="mt-2 text-xs text-error">{{ t('board.usbBad') }}</p>

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
      </div>

      <div class="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-3">
        <AppButton :disabled="!canSave" @click="onSave">{{ t('board.saveCustom') }}</AppButton>
        <AppButton variant="outline" @click="emit('close')">{{ t('fpga.cancel') }}</AppButton>
      </div>
    </div>
  </div>
</template>
