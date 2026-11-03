<script setup>
import { computed } from 'vue'
import { DEFAULT_FOOD_ICON, FOOD_ICONS } from '../utils/foodIcons.js'
import { isFoodIcon, resolveFoodIcon } from '../utils/foodIconMap.js'

// The one way to draw a food icon. Give it either:
//   item - a food with name, icon and category (inventory item, receipt row, listing)
//   food - just a name
//   kind - a library icon id, to choose the icon directly
// color replaces the icon's own colour without changing its shape.
const props = defineProps({
  item: { type: Object, default: null },
  food: { type: String, default: '' },
  kind: { type: String, default: '' },
  color: { type: String, default: '' },
})

const id = computed(() => {
  if (isFoodIcon(props.kind)) return props.kind
  return resolveFoodIcon(props.item ?? { name: props.food })
})
const icon = computed(() => FOOD_ICONS[id.value] ?? FOOD_ICONS[DEFAULT_FOOD_ICON])
</script>

<template>
  <svg class="food-icon" :data-food-icon="id" viewBox="0 0 70 70" aria-hidden="true">
    <path class="food-shape" :d="icon.shape" :fill="color || icon.color" />
    <path class="food-line" :d="icon.detail" />
  </svg>
</template>

<style scoped>
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
