<script setup>
import { computed } from 'vue'
import { DEFAULT_FOOD_ICON, FOOD_ICONS, foodTypeIcon } from '../utils/foodIcons.js'
import { isFoodIcon } from '../utils/foodIconMap.js'
import { classifyFood } from '../utils/foodIconClassifier.js'

// The one way to draw a food icon. Give it either:
//   item - a food with name, icon and category (inventory item, receipt row, listing)
//   food - just a name
//   kind - a library icon id, to choose the icon directly (drawn in its own library colour)
// A food is drawn with its type's one shape (every fruit is the round fruit, every drink the bottle)
// filled with its natural colour (foodIconClassifier.js). color replaces that colour.
const props = defineProps({
  item: { type: Object, default: null },
  food: { type: String, default: '' },
  kind: { type: String, default: '' },
  color: { type: String, default: '' },
})

const look = computed(() => {
  if (isFoodIcon(props.kind)) return { icon: props.kind, color: FOOD_ICONS[props.kind].color }
  return classifyFood(props.item ?? { name: props.food })
})
// id names the food (banana); shape is what is drawn (the round fruit).
const id = computed(() => look.value.icon)
const shape = computed(() => (isFoodIcon(props.kind) ? props.kind : foodTypeIcon(id.value)))
const icon = computed(() => FOOD_ICONS[shape.value] ?? FOOD_ICONS[DEFAULT_FOOD_ICON])
const fill = computed(() => props.color || look.value.color || icon.value.color)
</script>

<template>
  <svg class="food-icon" :data-food-icon="id" :data-food-shape="shape" :data-food-color="fill" viewBox="0 0 70 70" aria-hidden="true">
    <path class="food-shape" :d="icon.shape" :fill="fill" />
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
