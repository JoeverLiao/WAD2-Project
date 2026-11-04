<script setup>
import FoodIcon from '../FoodIcon.vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  activeTab: { type: String, required: true },
  failedImages: { type: Set, required: true },
  selectedGroup: { type: Object, default: null },
  selectedRequest: { type: Object, default: null },
})

const emit = defineEmits(['photo-error'])
</script>

<template>
  <div
    class="listing-summary d-flex align-items-center gap-3 p-3"
  >
    <img
      v-if="
      selectedGroup.image &&
      !failedImages.has(selectedRequest.listingId)
      "
      :src="selectedGroup.image"
      :alt="selectedGroup.food"
      class="listing-photo flex-shrink-0 rounded"
      @error="
      $emit('photo-error', selectedRequest.listingId)
      "
    />

    <span
      v-else
      class="listing-placeholder d-flex align-items-center justify-content-center flex-shrink-0 rounded"
      aria-hidden="true"
    >
      <FoodIcon :food="selectedGroup.food" />
    </span>

    <div>
      <h4>
        {{ selectedGroup.food }} ·
        {{ selectedGroup.quantity }}
      </h4>

      <p class="muted mt-2 text-muted">
        {{ activeTab === 'received' ? 'Your' : 'Owner’s' }}
        pickup window:
        {{ selectedGroup.preferredPickup }}
      </p>
    </div>
  </div>
</template>
