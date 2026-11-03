<script setup>
import { computed, ref, watch } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// Modal visibility
const props = defineProps({
  activeSection: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['close'])

const isEditorOpen = ref(false)
const isRemovalOpen = ref(false)

function close() {
  isEditorOpen.value = false
  isRemovalOpen.value = false
  pendingRemoval.value = null

  emit('close')
}
// Local demo data
const examples = [
  ['Organic veggie box', '1 box · 1 kg', 'Today, 5–7 pm', 2],
  ['Extra sourdough', '1 whole loaf', 'Tomorrow, 6–8 pm', 3],
  ['Garden tomatoes', '500 g · 1 punnet', 'Today, 4–7 pm', 1],
  ['Fresh spinach', '1 bag · 200 g', 'Tomorrow, 9–11 am', 0],
  ['Weekend veggie box', '1 box · 1.5 kg', 'Collected yesterday', 0],
  ['Apples', '4 apples', 'Tomorrow, 3–5 pm', 0],
  ['Greek yoghurt', '2 pots', 'Today, 6–8 pm', 1],
  ['Fresh pesto', '1 jar', 'Tomorrow, 5–7 pm', 0],
]

const listings = ref(
  Array.from({ length: 24 }, (_, index) => {
    const [name, quantity, pickup, requests] =
      examples[index % examples.length]

    return {
      id: index + 1,
      name: index < 8 ? name : `${name} ${Math.floor(index / 8) + 1}`,
      quantity,
      pickup,
      requests,
      image: '',
      status:
        index === 2 || (index >= 16 && index <= 18)
          ? 'reserved'
          : index === 4 || index >= 21
            ? 'collected'
            : 'available',
    }
  }),
)

// Search, filters and pagination
const search = ref('')
const status = ref('all')
const page = ref(1)
const pageSize = 5

const statuses = ['all', 'available', 'reserved', 'collected']

const filteredListings = computed(() =>
  listings.value.filter(
    item =>
      (status.value === 'all' || item.status === status.value) &&
      `${item.name} ${item.quantity}`
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
  ),
)

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredListings.value.length / pageSize)),
)

const visibleListings = computed(() =>
  filteredListings.value.slice(
    (page.value - 1) * pageSize,
    page.value * pageSize,
  ),
)

const rangeStart = computed(() =>
  filteredListings.value.length
    ? (page.value - 1) * pageSize + 1
    : 0,
)

const rangeEnd = computed(() =>
  Math.min(page.value * pageSize, filteredListings.value.length),
)

function countFor(value) {
  return value === 'all'
    ? listings.value.length
    : listings.value.filter(item => item.status === value).length
}

function label(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

watch([search, status], () => {
  page.value = 1
})

watch(pageCount, count => {
  if (page.value > count) {
    page.value = count
  }
})

// Add / edit listing
const editingId = ref(null)

const form = ref({
  name: '',
  quantity: '',
  pickup: '',
  status: 'available',
})

function openEditor(item) {
  editingId.value = item?.id ?? null

  form.value = item
    ? {
        name: item.name,
        quantity: item.quantity,
        pickup: item.pickup,
        status: item.status,
      }
    : {
        name: '',
        quantity: '',
        pickup: '',
        status: 'available',
      }

  isRemovalOpen.value = false
  pendingRemoval.value = null
  isEditorOpen.value = true
}

function saveListing() {
  const values = {
    name: form.value.name.trim(),
    quantity: form.value.quantity.trim(),
    pickup: form.value.pickup.trim(),
    status: form.value.status,
  }

  if (!values.name || !values.quantity || !values.pickup) {
    return
  }

  if (editingId.value !== null) {
    const item = listings.value.find(
      item => item.id === editingId.value,
    )

    if (!item) return

    Object.assign(item, values)
  } else {
    listings.value.unshift({
      ...values,
      id: Date.now(),
      image: '',
      requests: 0,
    })

    status.value = 'all'
    search.value = ''
    page.value = 1
  }

  isEditorOpen.value = false
}

// Remove listing
const pendingRemoval = ref(null)

function askRemove(item) {
  pendingRemoval.value = item
  isEditorOpen.value = false
  isRemovalOpen.value = true
}

function cancelRemoval() {
  isRemovalOpen.value = false
  pendingRemoval.value = null
}

function removeListing() {
  if (!pendingRemoval.value) return

  listings.value = listings.value.filter(
    item => item.id !== pendingRemoval.value.id,
  )

  cancelRemoval()
}

// Request preview placeholder
const requestNotice = ref('')

function viewRequests(item) {
  // Connect this to your sharing corner later.
  requestNotice.value = `Demo: open requests for ${item.name}.`
}
watch(
  () => props.activeSection,
  section => {
    isEditorOpen.value = false
    isRemovalOpen.value = false
    pendingRemoval.value = null

    if (section === 'add') {
      openEditor()
    }
  },
  { immediate: true },
)
</script>

<template>
  <!-- Main listings modal -->
  <div
    v-if="activeSection === 'listings' || activeSection === 'add'"
    class="listings-overlay"
    @click.self="close"
  >
    <div
      class="listings-modal my-listings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-listings-title"
    >
      <div class="section-heading">
        <h2 id="my-listings-title">
          My listings · {{ listings.length }}
        </h2>

        <div class="heading-actions">
          <button
            type="button"
            class="listing-button primary"
            @click="openEditor()"
          >
            + Add listing
          </button>

          <button
            type="button"
            class="modal-close"
            aria-label="Close my listings"
            @click="close"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Search and status filters -->
      <div class="listing-toolbar">
        <label class="listing-search">
          <span class="visually-hidden">Search your listings</span>

          <input
            v-model="search"
            type="search"
            placeholder="Search your food…"
          />
        </label>

        <div
          class="status-filters"
          aria-label="Filter listings by status"
        >
          <button
            v-for="value in statuses"
            :key="value"
            type="button"
            class="listing-button"
            :class="{ primary: status === value }"
            :aria-pressed="status === value"
            @click="status = value"
          >
            {{ label(value) }} · {{ countFor(value) }}
          </button>
        </div>
      </div>

      <!-- Listings table -->
      <div
        class="listing-table-wrapper"
        tabindex="0"
        aria-label="Your listings table, scroll horizontally on small screens"
      >
        <table class="listing-table">
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
            <tr v-for="item in visibleListings" :key="item.id">
              <td>
                <div class="food-identity">
                  <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                  />

                  <span
                    v-else
                    class="food-placeholder"
                    aria-hidden="true"
                  >
                    <FoodIcon :food="item.name" />
                  </span>

                  <div>
                    <h3>{{ item.name }}</h3>
                    <p>{{ item.quantity }}</p>
                  </div>
                </div>
              </td>

              <td>{{ item.pickup }}</td>

              <td>
                <span class="status-badge" :class="item.status">
                  {{ label(item.status) }}
                </span>
              </td>

              <td>
                <span
                  v-if="item.status === 'collected'"
                  class="muted"
                >
                  Completed
                </span>

                <button
                  v-else-if="item.requests"
                  type="button"
                  class="text-button"
                  @click="viewRequests(item)"
                >
                  {{ item.requests }}
                  {{ item.requests === 1 ? 'request' : 'requests' }} →
                </button>

                <span v-else class="muted">No requests</span>
              </td>

              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="text-button"
                    :aria-label="`Edit ${item.name}`"
                    @click="openEditor(item)"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="text-button muted"
                    :aria-label="`Remove ${item.name}`"
                    @click="askRemove(item)"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!visibleListings.length">
              <td colspan="5" class="empty-state">
                No matching listings.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination-footer">
        <p class="muted">
          Showing {{ rangeStart }}–{{ rangeEnd }} of
          {{ filteredListings.length }}
        </p>

        <div
          class="pagination-controls"
          role="navigation"
          aria-label="Listing pages"
        >
          <button
            type="button"
            class="listing-button"
            :disabled="page === 1"
            @click="page--"
          >
            ← Previous
          </button>

          <span>Page {{ page }} of {{ pageCount }}</span>

          <button
            type="button"
            class="listing-button"
            :disabled="page === pageCount"
            @click="page++"
          >
            Next →
          </button>
        </div>
      </div>

      <p v-if="requestNotice" class="demo-notice" role="status">
        {{ requestNotice }}
      </p>
    </div>

    <!-- Add / edit modal -->
    <div
      v-if="isEditorOpen"
      class="listings-overlay listings-overlay--nested"
      @click.self="isEditorOpen = false"
    >
      <div
        class="listing-dialog my-listings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-editor-title"
      >
        <form class="editor-form" @submit.prevent="saveListing">
          <h3 id="listing-editor-title">
            {{ editingId !== null ? 'Edit listing' : 'Add listing' }}
          </h3>

          <label>
            Food name
            <input v-model="form.name" required />
          </label>

          <label>
            Quantity
            <input
              v-model="form.quantity"
              required
              placeholder="1 box · 1 kg"
            />
          </label>

          <label>
            Preferred pickup
            <input
              v-model="form.pickup"
              required
              placeholder="Tomorrow, 5–7 pm"
            />
          </label>

          <label>
            Status
            <select v-model="form.status">
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="collected">Collected</option>
            </select>
          </label>

          <div class="row-actions">
            <button
              type="button"
              class="listing-button"
              @click="isEditorOpen = false"
            >
              Cancel
            </button>

            <button
              type="submit"
              class="listing-button primary"
            >
              Save listing
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Removal confirmation modal -->
    <div
      v-if="isRemovalOpen"
      class="listings-overlay listings-overlay--nested"
      @click.self="cancelRemoval"
    >
      <div
        class="listing-dialog my-listings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-title"
      >
        <h3 id="remove-title">
          Remove {{ pendingRemoval?.name }}?
        </h3>

        <p>This removes the listing from this local demo.</p>

        <div class="row-actions">
          <button
            type="button"
            class="listing-button"
            @click="cancelRemoval"
          >
            Keep listing
          </button>

          <button
            type="button"
            class="listing-button primary"
            @click="removeListing"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Base */
.my-listings {
  color: var(--ink);
  font: 19px/1.4 var(--font-sans);
}

.listings-overlay,
.listings-overlay * {
  box-sizing: border-box;
}

h2,
h3 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
}

h2 {
  font-size: clamp(28px, 3vw, 34px);
}

h3 {
  font-size: 23px;
}

p {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Modal overlay */
.listings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(18, 63, 59, 0.45);
}

.listings-overlay--nested {
  z-index: 1060;
}

/* Main listings modal */
.listings-modal {
  width: 100%;
  max-width: 1200px;
  max-height: calc(100dvh - 48px);
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 2px solid var(--ink);
  border-radius: 22px;
  background: var(--paper);
  box-shadow: var(--shadow-paper);
}

/* Heading */
.section-heading,
.pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 30px;
  line-height: 1;
}

.modal-close:hover {
  background: var(--aqua-soft);
}

/* Search and filters */
.listing-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 22px 0;
}

.listing-search {
  flex: 1 1 280px;
  max-width: 360px;
}

input,
select {
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
  color: var(--ink);
}

.status-filters,
.row-actions,
.pagination-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

/* Buttons */
.listing-button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper);
  color: var(--ink);
}

.listing-button.primary {
  background: var(--aqua);
  color: var(--paper-bright);
}

.listing-button:hover:not(:disabled) {
  background: var(--aqua-soft);
}

.listing-button.primary:hover:not(:disabled) {
  background: #0d968b;
}

.text-button {
  min-height: 44px;
  padding: 7px 0;
  border: 0;
  background: transparent;
  color: var(--aqua);
  text-align: left;
}

.text-button:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.muted {
  color: var(--muted);
}

/* Listings table */
.listing-table-wrapper {
  max-width: 100%;
  padding: 12px;
  overflow-x: auto;
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  background: var(--paper-bright);
}

.listing-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0 7px;
}

th {
  color: var(--muted);
  font-size: 14px;
  font-weight: 400;
  text-align: left;
  text-transform: uppercase;
}

th,
td {
  padding: 10px 12px;
  vertical-align: middle;
}

tbody tr:nth-child(odd) td {
  background: var(--paper);
}

td:first-child {
  width: 34%;
  border-radius: 10px 0 0 10px;
}

td:last-child {
  border-radius: 0 10px 10px 0;
}

/* Food details */
.food-identity {
  display: flex;
  align-items: center;
  gap: 14px;
}

.food-identity img,
.food-placeholder {
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  border-radius: 9px;
  object-fit: cover;
}

.food-placeholder {
  display: grid;
  place-items: center;
  background: var(--aqua-soft);
  font-size: 32px;
}

.food-identity p {
  color: var(--muted);
  font-size: 17px;
}

/* Listing status */
.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 7px;
  font-size: 17px;
  white-space: nowrap;
}

.status-badge.available {
  background: var(--aqua-soft);
}

.status-badge.reserved {
  background: var(--yellow);
}

.status-badge.collected {
  background: #e9eeea;
}

/* Pagination and notices */
.pagination-footer {
  margin-top: 18px;
}

.empty-state {
  padding: 32px;
  text-align: center;
}

.demo-notice {
  margin-top: 12px;
  color: var(--muted);
}

/* Add / edit / removal modals */
.listing-dialog {
  width: 100%;
  max-width: 480px;
  max-height: calc(100dvh - 48px);
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow-paper);
}

.editor-form {
  display: grid;
  gap: 16px;
}

.editor-form label {
  display: grid;
  gap: 5px;
}

.listing-dialog > p,
.listing-dialog > .row-actions {
  margin-top: 18px;
}

/* Keyboard focus */
:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* Responsive layout */
@media (max-width: 575px) {
  .listings-overlay {
    padding: 12px;
  }

  .listings-modal,
  .listing-dialog {
    max-height: calc(100dvh - 24px);
    padding: 16px;
    border-radius: 18px;
  }

  .heading-actions {
    gap: 8px;
  }

  .listing-search {
    max-width: none;
  }

  .status-filters {
    gap: 8px;
  }

  .listing-button {
    padding-inline: 12px;
  }

  .pagination-controls {
    width: 100%;
    justify-content: space-between;
    font-size: 17px;
  }
}
</style>