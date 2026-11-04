<script setup>
import { computed } from 'vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  addressError: { type: String, required: true },
  addressLoading: { type: Boolean, required: true },
  addressPage: { type: Number, required: true },
  addressQuery: { type: String, required: true },
  addressResults: { type: Array, required: true },
  addressTotalPages: { type: Number, required: true },
  editing: { type: Boolean, required: true },
  geolocating: { type: Boolean, required: true },
  locked: { type: Boolean, required: true },
  savedLocationError: { type: String, required: true },
  savedLocationLoading: { type: Boolean, required: true },
  selectedAddress: { type: Object, default: null },
  usingSavedLocation: { type: Boolean, required: true },
})

const emit = defineEmits(['use-my-location', 'search-pickup-addresses', 'choose-pickup-address', 'update:addressQuery'])

const addressQuery = computed({
  get() {
    return props.addressQuery
  },
  set(value) {
    emit('update:addressQuery', value)
  },
})

function useMyLocation() {
  emit('use-my-location')
}

function searchPickupAddresses(page = 1) {
  emit('search-pickup-addresses', page)
}

function choosePickupAddress(address) {
  emit('choose-pickup-address', address)
}
</script>

<template>
  <div class="mt-4">
    <div
      class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2"
    >
      <label for="pickup-address-search" class="form-label mb-0">
        Pickup address *
      </label>

      <button
        type="button"
        class="btn btn-link p-0 editor-link rescue-text-button"
        :disabled="locked || geolocating || addressLoading"
        @click="useMyLocation"
      >
        {{
        geolocating
        ? 'Finding your address…'
        : '⌖ Get my location'
        }}
      </button>
    </div>

    <div class="row g-2">
      <div class="col">
        <input
          id="pickup-address-search"
          v-model="addressQuery"
          class="form-control"
          type="search"
          maxlength="160"
          placeholder="Building, street or postal code"
          @keydown.enter.prevent="searchPickupAddresses(1)"
        />
      </div>

      <div class="col-auto">
        <button
          type="button"
          class="btn btn-outline-dark editor-button rescue-button"
          :disabled="
          addressLoading ||
          geolocating ||
          addressQuery.trim().length < 2
          "
          @click="searchPickupAddresses(1)"
        >
          {{ addressLoading ? 'Searching…' : 'Search' }}
        </button>
      </div>
    </div>

    <p class="small text-muted mb-0 mt-2">
      Search and select an address, or use your current location.
    </p>

    <p
      v-if="geolocating"
      class="small text-muted mb-0 mt-2"
      role="status"
    >
      Finding your current location and nearby addresses…
    </p>

    <p
      v-if="addressError"
      class="small text-muted mb-0 mt-2"
      role="status"
    >
      {{ addressError }}
    </p>

    <!-- Address results -->
    <div
      v-if="addressResults.length"
      class="address-results list-group overflow-auto mt-2"
      aria-label="Matching pickup addresses"
    >
      <button
        v-for="address in addressResults"
        :key="`${address.address}-${address.latitude}-${address.longitude}`"
        type="button"
        class="address-result list-group-item list-group-item-action text-start"
        @click="choosePickupAddress(address)"
      >
        <strong v-if="address.building" class="d-block">
          {{ address.building }}
        </strong>

        <span class="d-block">
          {{ address.address }}
        </span>
      </button>
    </div>

    <p
      v-if="addressResults.length && !addressTotalPages"
      class="small text-muted mb-0 mt-2"
    >
      The nearest address has been selected. Choose another
      nearby result if needed.
    </p>

    <!-- Result pages -->
    <div
      v-if="addressTotalPages > 1"
      class="d-flex align-items-center justify-content-between gap-2 mt-2"
    >
      <button
        type="button"
        class="btn btn-outline-dark editor-button rescue-button"
        :disabled="
        addressLoading ||
        geolocating ||
        addressPage <= 1
        "
        @click="searchPickupAddresses(addressPage - 1)"
      >
        Previous
      </button>

      <span class="small text-muted mb-0">
        Page {{ addressPage }} of {{ addressTotalPages }}
      </span>

      <button
        type="button"
        class="btn btn-outline-dark editor-button rescue-button"
        :disabled="
        addressLoading ||
        geolocating ||
        addressPage >= addressTotalPages
        "
        @click="searchPickupAddresses(addressPage + 1)"
      >
        Next
      </button>
    </div>

    <!-- Selected address -->
    <p
      v-if="savedLocationLoading"
      class="small text-muted mb-0 mt-2"
      role="status"
    >
      Loading your usual pickup address…
    </p>

    <p
      v-if="savedLocationError"
      class="small text-muted mb-0 mt-2"
      role="status"
    >
      {{ savedLocationError }}
    </p>

    <!-- Selected address -->
    <div
      v-if="selectedAddress"
      class="linked-note rounded-3 p-3 mt-3"
      aria-live="polite"
    >
      <strong class="d-block">
        {{
        usingSavedLocation
        ? 'Your usual pickup address'
        : 'Selected meeting point'
        }}
      </strong>

      <p class="mb-0 mt-1">
        {{ selectedAddress.address }}
      </p>

      <p v-if="!editing" class="small text-muted mb-0 mt-2">
        {{
        usingSavedLocation
        ? 'Already selected. Search above to choose a different address.'
        : 'Posting this listing will save this as your usual pickup address.'
        }}
      </p>
    </div>
  </div>
</template>
