<script setup>
import { computed, ref, watch } from 'vue'

// Local demo data only. Replace with your inventory/listings API later.
const examples = [
  ['Organic veggie box', '1 box · 1 kg', 'Today, 5–7 pm', '🥬', 2],
  ['Extra sourdough', '1 whole loaf', 'Tomorrow, 6–8 pm', '🍞', 3],
  ['Garden tomatoes', '500 g · 1 punnet', 'Today, 4–7 pm', '🍅', 1],
  ['Fresh spinach', '1 bag · 200 g', 'Tomorrow, 9–11 am', '🥬', 0],
  ['Weekend veggie box', '1 box · 1.5 kg', 'Collected yesterday', '🥕', 0],
  ['Apples', '4 apples', 'Tomorrow, 3–5 pm', '🍎', 0],
  ['Greek yoghurt', '2 pots', 'Today, 6–8 pm', '🥛', 1],
  ['Fresh pesto', '1 jar', 'Tomorrow, 5–7 pm', '🌿', 0],
]

const listings = ref(
  Array.from({ length: 24 }, (_, index) => {
    const [name, quantity, pickup, icon, requests] =
      examples[index % examples.length]

    return {
      id: index + 1,
      name: index < 8 ? name : `${name} ${Math.floor(index / 8) + 1}`,
      quantity,
      pickup,
      icon,
      requests,
      image: '', // Add your local image path, e.g. '/images/veggie-box.jpg'.
      status:
        index === 2 || (index >= 16 && index <= 18)
          ? 'reserved'
          : index === 4 || index >= 21
            ? 'collected'
            : 'available',
    }
  }),
)

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

// Minimal local demo form. No props, emits or backend calls.
const editor = ref(null)
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

  editor.value.showModal()
}

function saveListing() {
  if (
    !form.value.name.trim() ||
    !form.value.quantity.trim() ||
    !form.value.pickup.trim()
  ) {
    return
  }

  if (editingId.value !== null) {
    Object.assign(
      listings.value.find(item => item.id === editingId.value),
      form.value,
    )
  } else {
    listings.value.unshift({
      ...form.value,
      id: Date.now(),
      icon: '🥬',
      image: '',
      requests: 0,
    })

    status.value = 'all'
    search.value = ''
    page.value = 1
  }

  editor.value.close()
}

const removalDialog = ref(null)
const pendingRemoval = ref(null)

function askRemove(item) {
  pendingRemoval.value = item
  removalDialog.value.showModal()
}

function removeListing() {
  listings.value = listings.value.filter(
    item => item.id !== pendingRemoval.value.id,
  )

  removalDialog.value.close()
  pendingRemoval.value = null
}

const requestNotice = ref('')

function viewRequests(item) {
  // TODO: Later select the same item in SharingCorner
  // using props/emits or your store.
  requestNotice.value = `Demo: open requests for ${item.name}.`
}
</script>

<template>
  <section
    class="my-listings container py-4"
    aria-labelledby="my-listings-title"
  >
    <header class="section-heading">
      <h2 id="my-listings-title">
        My listings · {{ listings.length }}
      </h2>

      <button
        type="button"
        class="listing-button primary"
        @click="openEditor()"
      >
        + Add listing
      </button>
    </header>

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
                  {{ item.icon }}
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
    <footer class="pagination-footer">
      <p class="muted">
        Showing {{ rangeStart }}–{{ rangeEnd }} of
        {{ filteredListings.length }}
      </p>

      <nav class="pagination-controls" aria-label="Listing pages">
        <button
          class="listing-button"
          type="button"
          :disabled="page === 1"
          @click="page--"
        >
          ← Previous
        </button>

        <span>Page {{ page }} of {{ pageCount }}</span>

        <button
          class="listing-button"
          type="button"
          :disabled="page === pageCount"
          @click="page++"
        >
          Next →
        </button>
      </nav>
    </footer>

    <p v-if="requestNotice" class="demo-notice" role="status">
      {{ requestNotice }}
    </p>

    <!-- Add / edit listing -->
    <dialog
      ref="editor"
      class="listing-dialog"
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
            @click="editor.close()"
          >
            Cancel
          </button>

          <button class="listing-button primary" type="submit">
            Save listing
          </button>
        </div>
      </form>
    </dialog>

    <!-- Remove listing confirmation -->
    <dialog
      ref="removalDialog"
      class="listing-dialog"
      aria-labelledby="remove-title"
    >
      <h3 id="remove-title">
        Remove {{ pendingRemoval?.name }}?
      </h3>

      <p>This removes the listing from this local demo.</p>

      <div class="row-actions">
        <button
          class="listing-button"
          @click="removalDialog.close()"
        >
          Keep listing
        </button>

        <button
          class="listing-button primary"
          @click="removeListing"
        >
          Remove
        </button>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.my-listings {
  color: var(--ink);
  font: 19px/1.4 var(--font-sans);
}

.my-listings * {
  box-sizing: border-box;
}

h2,
h3 {
  font-family: var(--font-display);
  font-weight: 700;
  margin: 0;
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

.section-heading,
.pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

/* Search and filters */
.listing-toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
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
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
  color: var(--ink);
  padding: 9px 12px;
}

.status-filters,
.row-actions,
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Buttons */
.listing-button {
  min-height: 42px;
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

/* Listings table */
.listing-table-wrapper {
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  padding: 12px;
  background: var(--paper-bright);
  overflow-x: auto;
}

.listing-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0 7px;
}

th {
  font-size: 14px;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 400;
  text-align: left;
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
  border-radius: 10px 0 0 10px;
  width: 34%;
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
  object-fit: cover;
  border-radius: 9px;
}

.food-placeholder {
  display: grid;
  place-items: center;
  background: var(--aqua-soft);
  font-size: 32px;
}

.food-identity p {
  font-size: 17px;
  color: var(--muted);
}

/* Listing status */
.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 7px;
  font-size: 17px;
}

.available {
  background: var(--aqua-soft);
}

.reserved {
  background: var(--yellow);
}

.collected {
  background: #e9eeea;
}

.text-button {
  padding: 7px 0;
  min-height: 40px;
  border: 0;
  background: transparent;
  color: var(--aqua);
  text-align: left;
}

.muted {
  color: var(--muted);
}

/* Pagination and notices */
.pagination-footer {
  margin-top: 18px;
}

.empty-state {
  text-align: center;
  padding: 32px;
}

.demo-notice {
  margin-top: 12px;
  color: var(--muted);
}

/* Add / edit / remove dialogs */
.listing-dialog {
  width: min(480px, calc(100vw - 32px));
  padding: 24px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  color: var(--ink);
  background: var(--paper);
}

.listing-dialog::backdrop {
  background: rgba(18, 63, 59, 0.4);
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

:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* Responsive layout */
@media (max-width: 575px) {
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