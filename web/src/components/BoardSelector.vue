<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { type BoardProfile } from '@/fpga/boardTypes'

const props = defineProps<{
  modelValue: string
  listed: BoardProfile[]
  customs: BoardProfile[]
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
  help: [id: string]
  custom: []
}>()

const { t } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const currentTitle = computed(() => {
  const listed = props.listed.find((b) => b.id === props.modelValue)
  if (listed) return listed.title
  const custom = props.customs.find((b) => b.id === props.modelValue)
  if (custom) return custom.title
  return props.modelValue
})

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function pick(id: string) {
  emit('update:modelValue', id)
  close()
}

function addUnlisted() {
  emit('custom')
  close()
}

function onHelp(id: string, ev: Event) {
  ev.stopPropagation()
  ev.preventDefault()
  emit('help', id)
}

function onPointer(ev: PointerEvent) {
  const node = ev.target
  if (!(node instanceof Node) || root.value?.contains(node)) return
  close()
}

onMounted(() => document.addEventListener('pointerdown', onPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointer))
</script>

<template>
  <div ref="root" class="relative" data-board-drop>
    <button
      type="button"
      class="inline-flex max-w-[14rem] items-center gap-1 rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-xs font-semibold tracking-wide text-fg transition-colors hover:bg-surface-2"
      :aria-expanded="open"
      :aria-label="t('board.group')"
      @click="toggle"
    >
      <span class="truncate">{{ currentTitle }}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-3.5 w-3.5 shrink-0 text-muted"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-40 mt-1 min-w-[16rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
      role="listbox"
    >
      <div
        v-for="b in listed"
        :key="b.id"
        class="flex items-center"
      >
        <button
          type="button"
          class="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
          :class="b.id === modelValue ? 'font-semibold' : ''"
          role="option"
          :aria-selected="b.id === modelValue"
          @click="pick(b.id)"
        >
          {{ b.title }}
        </button>
        <button
          type="button"
          class="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-primary"
          :title="t('board.help')"
          :aria-label="t('board.helpNamed', { name: b.title })"
          @click="onHelp(b.id, $event)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" />
            <path
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              d="M9.8 9.6a2.2 2.2 0 1 1 3.4 1.85c-.7.45-1.2.9-1.2 1.85"
            />
            <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </div>
      <template v-if="customs.length">
        <div class="my-1 border-t border-border" />
        <div
          v-for="b in customs"
          :key="b.id"
          class="flex items-center"
        >
          <button
            type="button"
            class="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
            :class="b.id === modelValue ? 'font-semibold' : ''"
            role="option"
            :aria-selected="b.id === modelValue"
            @click="pick(b.id)"
          >
            {{ b.title }}
          </button>
          <button
            type="button"
            class="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-primary"
            :title="t('board.help')"
            :aria-label="t('board.helpNamed', { name: b.title })"
            @click="onHelp(b.id, $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" />
              <path
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                d="M9.8 9.6a2.2 2.2 0 1 1 3.4 1.85c-.7.45-1.2.9-1.2 1.85"
              />
              <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
            </svg>
          </button>
        </div>
      </template>
      <div class="my-1 border-t border-border" />
      <button
        type="button"
        class="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
        @click="addUnlisted"
      >
        {{ t('board.unlisted') }}
      </button>
    </div>
  </div>
</template>
