<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'

import FoodIcon from '../FoodIcon.vue'
import FoodListingEditor from './FoodListingEditor.vue'

import { useInventoryStore } from '@/stores/inventory.js'

import {
  allPages,
  api,
  apiError,
  isCancelled,
  photoUrl,
} from '@/services/rescueApi.js'

import {
  displayStatus,
  summariseRequests,
} from '@/services/rescueForm.js'

import { lockBodyScroll } from '@/services/rescueModal.js'

// Props and events
const props = defineProps({
  activeSection: {
    type: String,
    default: null,
  },

  refreshKey: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'close',
  'changed',
  'view-requests',
  'summary',
])

const inventory = useInventoryStore()

// Dialog references
const dialog = ref(null)
const confirmationDialog = ref(null)

const open = computed(() => props.activeSection === 'listings')

// Listing data
const listings = ref([])
const requests = ref([])
const failedPhotos = ref(new Set())

// Loading and messages
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const working = ref(false)

// Editor and confirmation state
const isEditorOpen = ref(false)
const editingListing = ref(null)
const confirmation = ref(null)

// Search, filters and pagination
const search = ref('')
const status = ref('all')
const page = ref(1)

const pageSize = 5
const now = ref(Date.now())

const statuses = [
  'all',
  'available',
  'claimed',
  'collected',
  'expired',
  'withdrawn',
]

const labels = {
  all: 'All',
  available: 'Available',
  claimed: 'Reserved',
  collected: 'Collected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
}

// Lifecycle references
let timer
let loadController
let releaseScroll
let previouslyFocused
let alive = true

// Computed data
const requestCounts = computed(() =>
  summariseRequests(requests.value),
)

const activeInventoryIds = computed(() =>
  listings.value
    .filter(
      (item) =>
        ['available', 'claimed'].includes(item.status) &&
        item.inventoryItem,
    )
    .map((item) =>
      String(item.inventoryItem?._id || item.inventoryItem),
    ),
)

const filteredListings = computed(() =>
  listings.value.filter(
    (item) =>
      (
        status.value === 'all' ||
        displayStatus(item, now.value) === status.value
      ) &&
      `${item.title} ${item.quantity} ${item.unit} ${item.pickupLabel}`
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
  ),
)

const pageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(filteredListings.value.length / pageSize),
  ),
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
  Math.min(
    page.value * pageSize,
    filteredListings.value.length,
  ),
)

// Display helpers
function label(value) {
  return labels[value] || value
}

function countFor(value) {
  return value === 'all'
    ? listings.value.length
    : listings.value.filter(
        (item) => displayStatus(item, now.value) === value,
      ).length
}

function counts(item) {
  return (
    requestCounts.value.get(String(item._id)) || {
      total: 0,
      pending: 0,
      accepted: 0,
    }
  )
}

function canEdit(item) {
  return (
    item.status === 'available' &&
    counts(item).pending === 0 &&
    counts(item).accepted === 0
  )
}

function editHint(item) {
  if (item.status !== 'available') {
    return 'Only available listings can be edited.'
  }

  if (!canEdit(item)) {
    return 'Resolve pending requests before editing.'
  }

  return 'Edit listing'
}

function dateLabel(value) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return 'Not set'
  }

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function pickupLabel(item) {
  return `${dateLabel(item.pickupStart)} – ${dateLabel(item.pickupEnd)}`
}

// Load listings and incoming requests
async function loadListings() {
  loadController?.abort()

  const controller = new AbortController()
  loadController = controller

  loading.value = true
  loadError.value = ''

  try {
    const [listingData, requestData] = await Promise.all([
      allPages(
        '/rescue/mine',
        'listings',
        {},
        controller.signal,
      ),

      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'received' },
        controller.signal,
      ),
    ])

    if (!alive || controller.signal.aborted) {
      return
    }

    failedPhotos.value.clear()
    listings.value = listingData
    requests.value = requestData
    now.value = Date.now()

    emit('summary', {
      listings: listingData.length,

      available: listingData.filter(
        (item) => displayStatus(item) === 'available',
      ).length,
    })
  } catch (err) {
    if (
      alive &&
      !controller.signal.aborted &&
      !isCancelled(err)
    ) {
      loadError.value = apiError(
        err,
        'Unable to load your listings.',
      )
    }
  } finally {
    if (alive && loadController === controller) {
      loading.value = false
    }
  }
}

// Main dialog controls
function close() {
  if (working.value || isEditorOpen.value) {
    return
  }

  emit('close')
}

// Add/edit listing
function openEditor(item = null) {
  if (
    loading.value ||
    working.value ||
    loadError.value
  ) {
    return
  }

  editingListing.value = item
  actionError.value = ''
  isEditorOpen.value = true
}

async function closeEditor() {
  isEditorOpen.value = false
  editingListing.value = null

  await loadListings()

  // 'add' enters directly into the editor.
  // Closing it closes this whole entry flow.
  if (props.activeSection === 'add') {
    emit('close')
  }
}

async function savedListing(listing) {
  isEditorOpen.value = false
  editingListing.value = null

  notice.value = 'Your listing has been saved.'

  emit('changed', {
    type: 'saved',
    listingId: listing._id,
  })

  await loadListings()

  if (props.activeSection === 'add') {
    emit('close')
  }
}

function listingCommitted(listing) {
  // Inform the parent even if the subsequent photo upload fails.
  emit('changed', {
    type: 'saved',
    listingId: listing._id,
  })
}

// Open the corresponding received requests
function viewRequests(item) {
  emit('close')
  emit('view-requests', String(item._id))
}

// Withdrawal/collection confirmation
async function askConfirmation(type, item) {
  confirmation.value = { type, item }
  actionError.value = ''

  await nextTick()

  confirmationDialog.value.showModal()
}

function cancelConfirmation(event) {
  event?.preventDefault()

  if (working.value) {
    return
  }

  confirmationDialog.value?.close()
  confirmation.value = null
  actionError.value = ''
}

async function confirmAction() {
  if (!confirmation.value || working.value) {
    return
  }

  const { type, item } = confirmation.value

  working.value = true
  actionError.value = ''

  try {
    if (type === 'withdraw') {
      await api.delete(`/rescue/${item._id}`)

      notice.value =
        'Listing withdrawn. Your inventory was kept.'
    } else {
      await api.post(`/rescue/${item._id}/collect`)

      const refreshed = await inventory.loadInventory()

      notice.value = refreshed
        ? 'Collection confirmed. Your inventory is up to date.'
        : 'Collection confirmed. Inventory could not refresh; retry loading it on your fridge page.'
    }

    emit('changed', {
      type,
      listingId: item._id,
    })

    confirmationDialog.value.close()
    confirmation.value = null

    await loadListings()
  } catch (err) {
    actionError.value = apiError(err)

    // A 409 may mean another tab changed this listing.
    // Refresh our state as well.
    if (err.response?.status === 409) {
      await loadListings()
    }
  } finally {
    working.value = false
  }
}

// Search and pagination watchers
watch([search, status], () => {
  page.value = 1
})

watch(pageCount, (value) => {
  if (page.value > value) {
    page.value = value
  }
})

watch(
  () => props.refreshKey,
  () => {
    if (open.value && !isEditorOpen.value) {
      loadListings()
    }
  },
)

// Open or close the relevant dialog
watch(
  () => props.activeSection,

  async (section) => {
    if (section !== 'listings') {
      loadController?.abort()

      isEditorOpen.value = false

      confirmationDialog.value?.close()
      confirmation.value = null

      dialog.value?.close()

      releaseScroll?.()
      releaseScroll = null

      clearInterval(timer)

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }

      return
    }

    await nextTick()

    if (!alive || props.activeSection !== section) {
      return
    }

    if (!dialog.value.open) {
      previouslyFocused = document.activeElement
      releaseScroll = lockBodyScroll()

      dialog.value.showModal()

      timer = setInterval(() => {
        now.value = Date.now()
      }, 30000)
    }

    await loadListings()
  },
  {
    immediate: true,
  },
)

// Cleanup
onBeforeUnmount(() => {
  alive = false

  loadController?.abort()
  clearInterval(timer)

  confirmationDialog.value?.close()
  dialog.value?.close()

  releaseScroll?.()
})

defineExpose({
  refresh: loadListings,
})
</script>

<template>
  <Teleport to="body">
    <!-- Main listings dialog -->
    <dialog
      ref="dialog"
      class="listings-modal my-listings"
      aria-labelledby="my-listings-title"
      @cancel.prevent="close"
      @click="
        (event) => {
          if (event.target === dialog) close()
        }
      "
    >
      <div class="section-heading">
        <h2 id="my-listings-title">
          My listings

          <span v-if="!loading">
            · {{ listings.length }}
          </span>
        </h2>

        <div class="heading-actions">
          <button
            type="button"
            class="listing-button primary"
            :disabled="
              loading ||
              working ||
              Boolean(loadError)
            "
            @click="openEditor()"
          >
            + Add listing
          </button>

          <button
            type="button"
            class="modal-close"
            aria-label="Close my listings"
            :disabled="working"
            @click="close"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Errors and notices -->
      <div
        v-if="loadError"
        class="alert alert-danger mt-3"
        role="alert"
      >
        {{ loadError }}

        <button
          type="button"
          class="listing-button ms-2"
          @click="loadListings"
        >
          Retry
        </button>
      </div>

      <p
        v-if="notice"
        class="success-notice mt-3"
        role="status"
      >
        {{ notice }}
      </p>

      <p
        v-if="loading"
        class="py-4"
        role="status"
      >
        Loading your listings and requests…
      </p>

      <template v-else-if="!loadError">
        <!-- Search and filters -->
        <div class="listing-toolbar">
          <label class="listing-search">
            <span class="visually-hidden">
              Search your listings
            </span>

            <input
              v-model="search"
              type="search"
              placeholder="Search food or pickup location…"
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

          <button
            class="text-button"
            type="button"
            :disabled="working"
            @click="loadListings"
          >
            Refresh
          </button>
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
              <tr
                v-for="item in visibleListings"
                :key="item._id"
              >
                <!-- Food -->
                <td>
                  <div class="food-identity">
                    <img
                      v-if="
                        item.hasPhoto &&
                        !failedPhotos.has(item._id)
                      "
                      :src="photoUrl(item)"
                      :alt="item.title"
                      loading="lazy"
                      @error="failedPhotos.add(item._id)"
                    />

                    <span
                      v-else
                      class="food-placeholder"
                      aria-hidden="true"
                    >
                      <FoodIcon :food="item.title" />
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
                    class="status-badge"
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
                    class="text-button"
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

                  <span v-else class="muted">
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
                  <div class="row-actions">
                    <button
                      v-if="item.status === 'available'"
                      type="button"
                      class="text-button"
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
                      class="text-button muted"
                      :disabled="working"
                      @click="askConfirmation('withdraw', item)"
                    >
                      Withdraw
                    </button>

                    <button
                      v-if="item.status === 'claimed'"
                      type="button"
                      class="listing-button primary"
                      :disabled="working"
                      @click="askConfirmation('collect', item)"
                    >
                      Confirm collection
                    </button>

                    <button
                      v-if="item.status === 'claimed'"
                      type="button"
                      class="text-button"
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
                      class="muted"
                    >
                      Saved in history
                    </span>
                  </div>
                </td>
              </tr>

              <tr v-if="!visibleListings.length">
                <td
                  colspan="5"
                  class="empty-state"
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

        <!-- Pagination -->
        <div class="pagination-footer">
          <p class="muted">
            Showing {{ rangeStart }}–{{ rangeEnd }} of
            {{ filteredListings.length }}
          </p>

          <nav
            class="pagination-controls"
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

            <span>
              Page {{ page }} of {{ pageCount }}
            </span>

            <button
              type="button"
              class="listing-button"
              :disabled="page === pageCount"
              @click="page++"
            >
              Next →
            </button>
          </nav>
        </div>
      </template>
    </dialog>

    <!-- Withdrawal/collection confirmation -->
    <dialog
      ref="confirmationDialog"
      class="listing-dialog my-listings"
      aria-labelledby="listing-confirm-title"
      @cancel="cancelConfirmation"
    >
      <template v-if="confirmation">
        <h3 id="listing-confirm-title">
          {{
            confirmation.type === 'collect'
              ? 'Confirm collection of'
              : 'Withdraw'
          }}

          {{ confirmation.item.title }}?
        </h3>

        <p class="mt-3">
          {{
            confirmation.type === 'collect'
              ? confirmation.item.inventoryItem
                ? 'Confirm only after handing over the food. This completes the accepted request and removes the whole linked item from your inventory.'
                : 'Confirm only after handing over the food. This completes the accepted request.'
              : 'This removes the listing from Explore and declines pending requests. Food stays in your inventory.'
          }}
        </p>

        <div
          v-if="actionError"
          class="alert alert-danger mt-3"
          role="alert"
        >
          {{ actionError }}
        </div>

        <div class="row-actions mt-3">
          <button
            type="button"
            class="listing-button"
            :disabled="working"
            @click="cancelConfirmation"
          >
            Go back
          </button>

          <button
            type="button"
            class="listing-button primary"
            :disabled="working"
            @click="confirmAction"
          >
            {{
              working
                ? 'Saving…'
                : confirmation.type === 'collect'
                  ? 'Yes, collected'
                  : 'Withdraw listing'
            }}
          </button>
        </div>
      </template>
    </dialog>
  </Teleport>

  <!-- Add/edit listing editor -->
  <FoodListingEditor
    v-if="isEditorOpen"
    :listing="editingListing"
    :active-inventory-ids="activeInventoryIds"
    @close="closeEditor"
    @saved="savedListing"
    @committed="listingCommitted"
  />
</template>

<style scoped>
/* Base */
.listings-modal,
.listing-dialog {
  margin: auto;
  max-width: calc(100vw - 32px);
}

.listings-modal::backdrop,
.listing-dialog::backdrop {
  background: rgba(18, 63, 59, 0.45);
}

.listings-modal:not([open]),
.listing-dialog:not([open]) {
  display: none;
}

.my-listings .expiry-label {
  font-size: 14px;
  margin-top: 3px;
}

.pickup-window {
  font-size: 15px;
  color: var(--muted);
  max-width: 240px;
}

.status-badge.claimed {
  background: var(--yellow, #ffdd69);
}

.status-badge.expired {
  background: #ffe3d8;
}

.status-badge.withdrawn {
  background: #eee8e0;
}

.success-notice {
  padding: 12px;
  border: 1px solid var(--aqua);
  border-radius: 10px;
  background: var(--aqua-soft);
  font-size: 16px;
}

.my-listings .listing-button,
.my-listings .text-button {
  font-size: 16px;
}

.my-listings .heading-actions .listing-button {
  font-size: 17px;
}

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

.listings-modal {
  width: min(1200px, calc(100vw - 32px));
}

.listing-dialog {
  width: min(520px, calc(100vw - 32px));
}

@media (max-width: 575px) {
  .listings-modal,
  .listing-dialog {
    width: calc(100vw - 24px);
  }
}
</style>