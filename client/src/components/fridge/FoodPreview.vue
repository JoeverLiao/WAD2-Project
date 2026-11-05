<script setup>
import FoodIcon from '../FoodIcon.vue'

defineProps({
  item: { type: Object, required: true },
  selected: Boolean,
  dragging: Boolean,
  highlighted: Boolean,
  expiry: { type: String, default: null },
  storageWarning: Boolean,
  description: { type: String, default: '' },
})
const emit = defineEmits(['show-name', 'hide-name', 'drag-start', 'drag-end'])

function startDrag(item, event) {
  emit('drag-start', item, event)
  event.dataTransfer?.setData('text/plain', String(item.id))
}
</script>

<template>
  <span
    :data-food-id="item.id"
    tabindex="0"
    role="button"
    :aria-pressed="selected"
    :class="{
      'food-being-dragged': dragging,
      'food-selected': selected,
      'food-location-highlight': highlighted,
    }"
    :title="item.name"
    :aria-label="item.name"
    :aria-description="description"
    draggable="true"
    @pointerenter="$event.pointerType === 'mouse' && emit('show-name', item, $event)"
    @pointerleave="emit('hide-name')"
    @dragstart="startDrag(item, $event)"
    @dragend="emit('drag-end')"
  >
    <FoodIcon :item="item" />
    <span
      v-if="expiry"
      class="food-expiry-badge"
      :class="{ expired: expiry === 'Expired' }"
      aria-hidden="true"
      >!</span
    >
    <span v-else-if="storageWarning" class="food-storage-badge" aria-hidden="true">!</span>
    <span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span>
  </span>
</template>
