<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'outline'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    class?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
  },
)

const classes = computed(() => {
  const size =
    props.size === 'sm'
      ? 'h-8 px-3 text-sm'
      : props.size === 'lg'
        ? 'h-11 px-5 text-base'
        : 'h-9 px-4 text-sm'

  const variant = {
    primary:
      'bg-primary text-primary-fg hover:bg-primary-bright disabled:opacity-60',
    secondary:
      'bg-surface-2 text-fg hover:bg-surface-3 border border-border disabled:opacity-60',
    outline:
      'border border-border-strong bg-transparent text-fg hover:bg-surface-2 disabled:opacity-60',
  }[props.variant]

  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold no-underline transition-colors',
    size,
    variant,
    props.class,
  ]
    .filter(Boolean)
    .join(' ')
})
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
