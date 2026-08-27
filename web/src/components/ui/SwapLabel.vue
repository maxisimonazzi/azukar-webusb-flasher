<script setup lang="ts">
/**
 * Leyenda que cambia sin mover el botón. Todas las variantes se apilan en la
 * misma celda de grid: el ancho lo fija la más larga, y el navegador lo
 * recalcula solo al cambiar de idioma. Sin números mágicos ni medir con JS.
 */
defineProps<{
  options: string[]
  /** Índice de la que se ve. */
  index: number
}>()
</script>

<template>
  <span class="inline-grid place-items-center">
    <span
      v-for="(option, i) in options"
      :key="i"
      class="col-start-1 row-start-1 whitespace-nowrap"
      :class="i === index ? '' : 'invisible'"
      :aria-hidden="i === index ? undefined : 'true'"
    >{{ option }}</span>
  </span>
</template>
