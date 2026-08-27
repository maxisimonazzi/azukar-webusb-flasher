<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ProjectMeta } from '@/fpga/projectStore'

const props = defineProps<{
  projects: ProjectMeta[]
  currentId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
  rename: [name: string]
  remove: []
}>()

const { t } = useI18n()

const renaming = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

async function startRename() {
  draft.value = props.projects.find((p) => p.id === props.currentId)?.name ?? ''
  renaming.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  if (!renaming.value) return
  renaming.value = false
  const name = draft.value.trim()
  if (name) emit('rename', name)
}

function cancel() {
  renaming.value = false
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commit()
    return
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancel()
  }
}

const iconBtn =
  'inline-flex h-6 flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-2 text-xs text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30'
</script>

<template>
  <div class="px-2 pt-3">
    <label
      class="mb-1 block text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase"
      for="project-select"
    >
      {{ t('project.label') }}
    </label>

    <input
      v-if="renaming"
      ref="input"
      v-model="draft"
      class="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg outline-none"
      :aria-label="t('project.renameHint')"
      @keydown="onKey"
      @blur="commit"
    >
    <select
      v-else
      id="project-select"
      class="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-fg"
      :value="currentId"
      :title="t('project.selectHint')"
      @change="emit('select', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="project in projects" :key="project.id" :value="project.id">
        {{ project.name }}
      </option>
    </select>

    <div class="mt-1 flex gap-1">
      <button type="button" :class="iconBtn" :title="t('project.new')" @click="emit('create')">
        + {{ t('project.newShort') }}
      </button>
      <button
        type="button"
        :class="iconBtn"
        :title="t('project.rename')"
        :aria-label="t('project.rename')"
        @click="startRename"
      >
        ✎
      </button>
      <button
        type="button"
        :class="iconBtn"
        :title="t('project.remove')"
        :aria-label="t('project.remove')"
        :disabled="projects.length <= 1"
        @click="emit('remove')"
      >
        🗑
      </button>
    </div>
  </div>
</template>
