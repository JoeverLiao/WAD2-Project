<script setup>
import { computed } from 'vue'
import { foodIconFor, foodIcons } from '../utils/foodIcons.js'

// Pass a food's name to pick its icon, or kind to choose one directly.
const props = defineProps({
  food: { type: String, default: '' },
  kind: { type: String, default: '' },
})

const icon = computed(() => foodIcons[props.kind || foodIconFor(props.food)])
</script>

<template>
  <svg class="food-icon" viewBox="0 0 70 70" aria-hidden="true">
    <path class="food-shape" :d="icon.shape" :fill="icon.color" />
    <path class="food-line" :d="icon.detail" />
  </svg>
</template>

<style scoped>
/* Sized in em so an icon fills the same space as the emoji font sizes around it. */
.food-icon {
  display: inline-block;
  flex: none;
  width: 1.15em;
  height: 1.15em;
  overflow: visible;
  vertical-align: -0.2em;
}

.food-shape {
  stroke: var(--ink);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3.2px;
}

.food-line {
  fill: none;
  stroke: var(--ink);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5px;
}
</style>
