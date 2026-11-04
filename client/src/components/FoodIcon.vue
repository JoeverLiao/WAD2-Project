<script setup>
import { computed, watch } from 'vue'
import { iconEntry, iconSvg, isIconId } from '../icons/manifest.js'
import { foodIconState, resolveFoodIcon } from '../icons/iconResolver.js'

// The one way to draw a food icon. Give it one of:
//   name - a food name; Claude chooses the icon and colour (see icons/iconResolver.js)
//   item - anything with a name field (inventory item, receipt row, listing)
//   kind - an icon id from icons/manifest.json, drawn in that entry's own colour
// color replaces the chosen colour. Size and line style come from the CSS variables below.
const props = defineProps({
  name: { type: String, default: '' },
  item: { type: Object, default: null },
  kind: { type: String, default: '' },
  color: { type: String, default: '' },
})

const foodName = computed(() => props.item?.name ?? props.name)
const fixed = computed(() => isIconId(props.kind))

watch(
  [foodName, fixed],
  ([name, isFixed]) => {
    if (!isFixed) resolveFoodIcon(name)
  },
  { immediate: true },
)

const state = computed(() =>
  fixed.value
    ? { loading: false, icon: props.kind, color: iconEntry(props.kind).color }
    : foodIconState(foodName.value),
)
const svg = computed(() => (state.value.loading ? '' : iconSvg(state.value.icon)))
const fill = computed(() => props.color || state.value.color)
</script>

<template>
  <span
    v-if="state.loading"
    class="food-icon food-icon--loading"
    data-food-icon-loading
    aria-hidden="true"
  />
  <!-- SVG markup comes only from the app's own files in icons/svg, never from user input. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span
    v-else
    class="food-icon"
    :data-food-icon="state.icon"
    :data-food-color="fill"
    :style="{ color: fill }"
    aria-hidden="true"
    v-html="svg"
  />
</template>

<style scoped>
.food-icon {
  --food-icon-size: 1.15em;
  --food-icon-outline: 3.2px;
  --food-icon-detail: 2.5px;
  display: inline-block;
  flex: none;
  width: var(--food-icon-size);
  height: var(--food-icon-size);
  vertical-align: -0.2em;
}

.food-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.food-icon :deep(.food-shape) {
  fill: currentColor;
  stroke: var(--ink);
  stroke-width: var(--food-icon-outline);
}

.food-icon :deep(.food-line) {
  fill: none;
  stroke: var(--ink);
  stroke-width: var(--food-icon-detail);
}

.food-icon--loading {
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 14%, transparent);
  animation: food-icon-pulse 1.1s ease-in-out infinite;
}

@keyframes food-icon-pulse {
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .food-icon--loading {
    animation: none;
  }
}
</style>
