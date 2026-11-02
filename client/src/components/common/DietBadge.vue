<script setup>
// A large, high-contrast label showing whether a food is vegan, vegetarian, contains meat or fish,
// or needs its label checked. It never relies on colour alone: every badge has an icon, a word, and
// a different style (solid, outlined or dashed), so it can be read by people with colour-blindness.
// Contrast ratios (text on background) are all above 7:1 (WCAG AAA). Reusable on the Smart Fridge cards.
import { computed } from 'vue'
import { dietByValue } from '../../utils/inventoryOptions.js'

const props = defineProps({
  // 'vegan' | 'vegetarian' | 'other' | 'unknown' (anything else shows nothing)
  value: { type: String, default: '' },
})
const diet = computed(() => dietByValue(props.value))
</script>

<template>
  <span
    v-if="diet"
    class="diet-badge"
    :class="`diet-${diet.value}`"
    :title="diet.description"
    data-testid="diet-badge"
  >
    <span class="diet-icon" aria-hidden="true">{{ diet.icon }}</span>
    <span class="diet-text">{{ diet.label }}</span>
    <span class="visually-hidden">: {{ diet.description }}</span>
  </span>
</template>

<style scoped>
.diet-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  border: 2px solid transparent;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}
.diet-icon {
  font-size: 1.15rem;
}
/* Solid dark green, white text (contrast about 9.4:1) */
.diet-vegan {
  background: #14532d;
  border-color: #14532d;
  color: #ffffff;
}
/* Light green with a dark green outline (contrast about 8.5:1) */
.diet-vegetarian {
  background: #dcfce7;
  border-color: #14532d;
  color: #14532d;
}
/* Solid dark brown-red, white text (contrast about 9.3:1) */
.diet-other {
  background: #7c2d12;
  border-color: #7c2d12;
  color: #ffffff;
}
/* Light grey with a dashed outline (contrast about 12:1) */
.diet-unknown {
  background: #f3f4f6;
  border-color: #374151;
  border-style: dashed;
  color: #1f2937;
}
</style>
