<script setup>
import { categoryLabel } from '@/services/rescueCategories.js'
import { distanceLabel } from '@/services/rescueMap.js'
import FoodIcon from '../FoodIcon.vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  activeRequests: { type: Map, required: true },
  failedImages: { type: Set, required: true },
  index: { type: Number, required: true },
  item: { type: Object, required: true },
  loading: { type: Boolean, required: true },
  openingRequestId: { type: String, default: null },
  selectedId: { type: String, default: null },
  sending: { type: Boolean, required: true },
  useBy: { type: Function, required: true },
})

const emit = defineEmits(['select-item', 'open-request', 'photo-error'])

function selectItem(item) {
  emit('select-item', item)
}

function openRequest(item) {
  emit('open-request', item)
}
</script>

<template>
  <article
    class="food-card d-grid overflow-hidden"
    :class="{ selected: selectedId === item.id }"
    @click="selectItem(item)"
  >
    <img
      v-if="item.image && !failedImages.has(item.id)"
      :src="item.image"
      :alt="item.name"
      class="food-photo w-100 h-100"
      loading="lazy"
      @error="$emit('photo-error', item.id)"
    />

    <div
      v-else
      class="photo-placeholder d-grid"
      aria-hidden="true"
    >
      <FoodIcon :name="item.name" />
    </div>

    <div class="food-details d-grid">
      <div class="food-heading d-flex align-items-center justify-content-between flex-wrap">
        <h3>
          <p
            type="button"
            class="food-title-button p-0 border-0 text-start"
            :aria-pressed="selectedId === item.id"
          >
            <span
              class="card-marker-number"
              aria-hidden="true"
            >
              {{ index + 1 }}
            </span>

            {{ item.name }}
          </p>
        </h3>

        <span class="food-distance text-nowrap">
          ⌖ {{ distanceLabel(item.distanceKm) }}
        </span>
      </div>

      <p
        v-if="item.description"
        class="food-description"
      >
        {{ item.description }}
      </p>

      <dl class="food-facts d-grid">
        <div>
          <dt>Quantity</dt>
          <dd>{{ item.quantity }}</dd>
        </div>

        <div>
          <dt>Use by</dt>
          <dd>{{ useBy(item.raw.expiresAt) }}</dd>
        </div>
      </dl>

      <div class="food-footer d-flex flex-column align-items-stretch gap-3">
        <div>
          <span class="detail-label">
            Pickup · {{ item.raw.pickupLabel }}
          </span>

          <p>{{ item.pickup }}</p>

          <small class="muted text-muted">
            {{
            item.raw.isOwner
            ? 'Your listing'
            : `Shared by ${item.person}`
            }}
            · {{ categoryLabel(item.raw.category) }}
          </small>
        </div>

        <button
          type="button"
          class="primary-button card-action btn rescue-button btn-primary"
          :disabled="
          loading ||
          Boolean(openingRequestId) ||
          sending
          "
          @click="openRequest(item)"
        >
          {{
          openingRequestId === item.id
          ? 'Opening…'
          : item.raw.isOwner
          ? 'Manage listing →'
          : activeRequests.has(item.id)
          ? 'View your request →'
          : 'Request collection →'
          }}
        </button>
      </div>
    </div>
  </article>
</template>
