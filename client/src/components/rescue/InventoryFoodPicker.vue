<script setup>
import { computed } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  editing: { type: Boolean, required: true },
  form: { type: Object, required: true },
  inventory: { type: Object, required: true },
  inventoryDisabledReason: { type: Function, required: true },
  inventoryExpiryLabel: { type: Function, required: true },
  inventoryOptions: { type: Array, required: true },
  inventorySearch: { type: String, required: true },
  inventorySort: { type: String, required: true },
  inventoryStorageLabel: { type: Function, required: true },
  locked: { type: Boolean, required: true },
  maxShareQuantity: { type: Number, required: true },
  selectedInventory: { type: Object, default: null },
  selectedInventoryId: { type: String, required: true },
  source: { type: String, required: true },
  validShareQuantity: { type: Boolean, required: true },
})

const emit = defineEmits([
  'change-source',
  'choose-inventory',
  'change-share-quantity',
  'clamp-share-quantity',
  'continue-to-food-details',
  'update:inventorySearch',
  'update:inventorySort',
  'update-field',
  'reload',
])

const fieldQuantity = computed({
  get() {
    return props.form.quantity
  },
  set(value) {
    emit('update-field', 'quantity', value)
  },
})

const inventorySearch = computed({
  get() {
    return props.inventorySearch
  },
  set(value) {
    emit('update:inventorySearch', value)
  },
})

const inventorySort = computed({
  get() {
    return props.inventorySort
  },
  set(value) {
    emit('update:inventorySort', value)
  },
})

function changeSource(value) {
  emit('change-source', value)
}

function chooseInventory(item) {
  emit('choose-inventory', item)
}

function changeShareQuantity(change) {
  emit('change-share-quantity', change)
}

function clampShareQuantity() {
  emit('clamp-share-quantity')
}

function continueToFoodDetails() {
  emit('continue-to-food-details')
}
</script>

<template>
  <section v-if="!editing" class="editor-section rounded-4 p-3 mb-3">
    <div class="row g-2 align-items-center mb-3">
      <div class="col-12 col-sm">
        <h3 class="mb-1">Choose what to share</h3>

        <p class="small text-muted mb-0">
          One item, one neighbour, less food wasted.
        </p>
      </div>

      <div class="col-12 col-sm-auto">
        <button
          type="button"
          :class="
          source === 'inventory'
          ? 'primary-button'
          : 'btn btn-link editor-link p-0'
          "
          :disabled="locked"
          @click="
          changeSource(
          source === 'inventory' ? 'manual' : 'inventory',
          )
          "
        >
          {{
          source === 'inventory'
          ? '+ Add food manually'
          : '← Choose from my food'
          }}
        </button>
      </div>
    </div>

    <template v-if="source === 'inventory'">
      <p
        v-if="inventory.loading"
        class="small text-muted mb-0 text-center py-4"
        role="status"
      >
        Finding food in your fridge and pantry…
      </p>

      <div
        v-else-if="inventory.error"
        class="picker-feedback rounded-3 p-3"
        role="alert"
      >
        <p class="mb-0">{{ inventory.error }}</p>

        <button
          type="button"
          class="btn btn-outline-dark editor-button mt-2 rescue-button"
          @click="$emit('reload')"
        >
          Try again
        </button>
      </div>

      <template v-else>
        <div class="row g-2 mb-3">
          <div class="col-12 col-sm-7">
            <label for="inventory-search" class="visually-hidden">
              Search your food
            </label>

            <input
              id="inventory-search"
              v-model="inventorySearch"
              type="search"
              class="form-control"
              placeholder="Search your fridge or pantry…"
            />
          </div>

          <div class="col-12 col-sm-5">
            <label for="inventory-sort" class="visually-hidden">
              Sort your food
            </label>

            <select
              id="inventory-sort"
              v-model="inventorySort"
              class="form-select"
            >
              <option value="expiry">Soonest expiry first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        <fieldset class="border-0 p-0 m-0">
          <legend class="visually-hidden">
            Choose one food item to share
          </legend>

          <div class="picker-scroll overflow-auto p-1">
            <div class="row g-2">
              <div
                v-for="item in inventoryOptions"
                :key="item.id"
                class="col-6 col-sm-4"
              >
                <label
                  class="food-choice position-relative d-flex flex-column gap-1 h-100 p-3 mb-0"
                  :class="{
                  selected: selectedInventoryId === item.id,
                  unavailable: Boolean(inventoryDisabledReason(item)),
                  }"
                >
                  <input
                    class="visually-hidden"
                    type="radio"
                    name="share-food"
                    :value="item.id"
                    :checked="selectedInventoryId === item.id"
                    :disabled="Boolean(inventoryDisabledReason(item))"
                    required
                    @change="chooseInventory(item)"
                  />

                  <span
                    class="d-flex align-items-center justify-content-between gap-2"
                  >
                    <span class="small text-muted">
                      {{ inventoryStorageLabel(item) }}
                    </span>

                    <span
                      class="choice-indicator d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle"
                      aria-hidden="true"
                    >
                      {{ selectedInventoryId === item.id ? '✓' : '' }}
                    </span>
                  </span>

                  <span
                    class="choice-icon d-flex align-items-center justify-content-center my-1"
                    aria-hidden="true"
                  >
                    <FoodIcon :food="item.name" />
                  </span>

                  <span class="food-name">{{ item.name }}</span>

                  <span class="small text-muted">
                    {{ item.quantity ?? '—' }} {{ item.unit }}
                  </span>

                  <span
                    class="food-expiry mt-auto pt-1"
                    :class="{
                    'text-muted':
                    Boolean(inventoryDisabledReason(item)),
                    }"
                  >
                    {{
                    inventoryDisabledReason(item) ||
                    inventoryExpiryLabel(item)
                    }}
                  </span>
                </label>
              </div>

              <div v-if="!inventoryOptions.length" class="col-12">
                <div class="picker-empty rounded-3 text-center px-3 py-4">
                  <p class="mb-0 picker-empty-title">
                    {{
                    inventorySearch.trim()
                    ? 'No matching food'
                    : 'No food available to share'
                    }}
                  </p>

                  <p class="small text-muted mb-0 mt-1">
                    Try another search or add food manually.
                  </p>

                  <button
                    type="button"
                    class="btn btn-link p-0 editor-link mt-2 rescue-text-button"
                    @click="changeSource('manual')"
                  >
                    + Add food manually
                  </button>
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        <!-- Selected item and quantity -->
        <div
          v-if="selectedInventory"
          class="selection-bar rounded-3 p-3 mt-3"
        >
          <div class="row g-3 align-items-center">
            <div class="col-12 col-lg">
              <span class="selection-label d-block mb-1">
                Ready to share
              </span>

              <p class="mb-0 selected-name">
                {{ selectedInventory.name }}
              </p>

              <p class="small text-muted mb-0 mt-1">
                {{ selectedInventory.quantity }}
                {{ selectedInventory.unit }} available
              </p>
            </div>

            <div class="col-12 col-lg-auto">
              <div class="row g-2 align-items-end">
                <div class="col-auto">
                  <label
                    for="share-picker-quantity"
                    class="form-label quantity-label d-block mb-1"
                  >
                    Quantity to share
                  </label>

                  <div
                    class="quantity-stepper input-group flex-nowrap align-items-center overflow-hidden flex-shrink-0"
                  >
                    <button
                      type="button"
                      class="btn btn-outline-dark flex-shrink-0"
                      aria-label="Decrease quantity"
                      :disabled="
                      locked ||
                      maxShareQuantity < 1 ||
                      Number(form.quantity) <= 1
                      "
                      @click="changeShareQuantity(-1)"
                    >
                      −
                    </button>

                    <input
                      id="share-picker-quantity"
                      v-model.number="fieldQuantity"
                      class="form-control text-center"
                      type="number"
                      min="1"
                      :max="maxShareQuantity"
                      step="1"
                      inputmode="numeric"
                      aria-label="Quantity to share"
                      required
                      @change="clampShareQuantity"
                    />

                    <button
                      type="button"
                      class="btn btn-outline-dark flex-shrink-0"
                      aria-label="Increase quantity"
                      :disabled="
                      locked ||
                      maxShareQuantity < 1 ||
                      Number(form.quantity) >= maxShareQuantity
                      "
                      @click="changeShareQuantity(1)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div class="col-auto">
                  <button
                    type="button"
                    class="btn btn-primary editor-button rescue-button"
                    :disabled="!validShareQuantity"
                    @click="continueToFoodDetails"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-else class="small text-muted mb-0 mt-3">
          Choose one item above. We’ll fill in its details below.
        </p>
      </template>
    </template>

    <div v-else class="manual-entry-note rounded-3 p-3">
      <p class="mb-0 selected-name">
        Something outside your inventory?
      </p>

      <p class="small text-muted mb-0 mt-1">
        Enter its name, quantity and use-by date below.
      </p>
    </div>
  </section>
</template>
