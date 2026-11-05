<script setup>
import { displayStatus } from '@/services/rescueForm.js'
import { photoUrl } from '@/services/rescueApi.js'
import FoodIcon from '../FoodIcon.vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  canEdit: { type: Function, required: true },
  counts: { type: Function, required: true },
  dateLabel: { type: Function, required: true },
  editHint: { type: Function, required: true },
  failedPhotos: { type: Set, required: true },
  label: { type: Function, required: true },
  listings: { type: Array, required: true },
  now: { type: Number, required: true },
  pickupLabel: { type: Function, required: true },
  visibleListings: { type: Array, required: true },
  working: { type: Boolean, required: true },
})

const emit = defineEmits(['view-requests', 'open-editor', 'ask-confirmation', 'photo-error'])

function viewRequests(item) {
  emit('view-requests', item)
}

function openEditor(item) {
  emit('open-editor', item)
}

function askConfirmation(type, item) {
  emit('ask-confirmation', type, item)
}
</script>

<template>
  <div
    class="listing-table-wrapper"
    tabindex="0"
    aria-label="Your listings table, scroll horizontally on small screens"
  >
    <table class="listing-table w-100">
      <thead>
        <tr>
          <th scope="col">Food</th>
          <th scope="col">Pickup</th>
          <th scope="col">Status</th>
          <th scope="col">Requests</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="item in visibleListings"
          :key="item._id"
        >
          <!-- Food -->
          <td>
            <div class="food-identity d-flex align-items-center">
              <img
                v-if="
                item.hasPhoto &&
                !failedPhotos.has(item._id)
                "
                :src="photoUrl(item)"
                :alt="item.title"
                loading="lazy"
                @error="$emit('photo-error', item._id)"
              />

              <span
                v-else
                class="food-placeholder d-grid"
                aria-hidden="true"
              >
                <FoodIcon :name="item.title" />
              </span>

              <div>
                <h3>{{ item.title }}</h3>

                <p>
                  {{ item.quantity }} {{ item.unit }}
                </p>

                <p class="expiry-label">
                  Use by {{ dateLabel(item.expiresAt) }}
                </p>
              </div>
            </div>
          </td>

          <!-- Pickup -->
          <td>
            <p>{{ item.pickupLabel }}</p>

            <p class="pickup-window">
              {{ pickupLabel(item) }}
            </p>
          </td>

          <!-- Status -->
          <td>
            <span
              class="status-badge d-inline-block text-nowrap"
              :class="displayStatus(item, now)"
            >
              {{ label(displayStatus(item, now)) }}
            </span>
          </td>

          <!-- Requests -->
          <td>
            <button
              v-if="counts(item).total"
              type="button"
              class="text-button btn btn-link rescue-text-button p-0"
              :disabled="working"
              @click="viewRequests(item)"
            >
              {{ counts(item).total }}
              {{
              counts(item).total === 1
              ? 'request'
              : 'requests'
              }}
              →
            </button>

            <span v-else class="muted text-muted">
              No requests
            </span>

            <p
              v-if="counts(item).pending"
              class="pickup-window"
            >
              {{ counts(item).pending }} awaiting reply
            </p>
          </td>

          <!-- Actions -->
          <td>
            <div class="row-actions d-flex align-items-center flex-wrap">
              <button
                v-if="item.status === 'available'"
                type="button"
                class="text-button btn btn-link rescue-text-button p-0"
                :disabled="working || !canEdit(item)"
                :title="editHint(item)"
                :aria-label="
                `Edit ${item.title}: ${editHint(item)}`
                "
                @click="openEditor(item)"
              >
                Edit
              </button>

              <button
                v-if="item.status === 'available'"
                type="button"
                class="text-button muted btn btn-link rescue-text-button p-0 text-muted"
                :disabled="working"
                @click="askConfirmation('withdraw', item)"
              >
                Withdraw
              </button>

              <button
                v-if="item.status === 'claimed'"
                type="button"
                class="listing-button primary btn rescue-button btn-primary"
                :disabled="working"
                @click="askConfirmation('collect', item)"
              >
                Confirm collection
              </button>

              <button
                v-if="item.status === 'claimed'"
                type="button"
                class="text-button btn btn-link rescue-text-button p-0"
                :disabled="working"
                @click="viewRequests(item)"
              >
                Manage request →
              </button>

              <span
                v-if="
                ['collected', 'withdrawn'].includes(
                item.status,
                )
                "
                class="muted text-muted"
              >
                Saved in history
              </span>
            </div>
          </td>
        </tr>

        <tr v-if="!visibleListings.length">
          <td
            colspan="5"
            class="empty-state text-center"
          >
            {{
            listings.length
            ? 'No matching listings. Try another search or filter.'
            : 'Nothing listed yet. Share something from your fridge or pantry.'
            }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
