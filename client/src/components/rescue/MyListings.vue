<script setup>
import '@/assets/rescue.css'
import ListingsTable from './ListingsTable.vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'

import FoodListingEditor from './FoodListingEditor.vue'

import { useInventoryStore } from '@/stores/inventory.js'

import { allPages, api, apiError, isCancelled } from '@/services/rescueApi.js'

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
function markPhotoFailed(listingId) {
  failedPhotos.value.add(listingId)
}
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
      <div class="section-heading d-flex align-items-center justify-content-between flex-wrap gap-3">
        <h2 id="my-listings-title">
          My listings

          <span v-if="!loading">
            · {{ listings.length }}
          </span>
        </h2>

        <div class="heading-actions d-flex align-items-center">
          <button
            type="button"
            class="listing-button primary btn rescue-button btn-primary"
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
            class="modal-close btn rescue-close rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 p-0"
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
          class="listing-button ms-2 btn rescue-button btn-outline-dark"
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
        <div class="listing-toolbar d-flex flex-wrap">
          <label class="listing-search">
            <span class="visually-hidden">
              Search your listings
            </span>

            <input class="form-control"
              v-model="search"
              type="search"
              placeholder="Search food or pickup location…"
            />
          </label>

          <div
            class="status-filters d-flex align-items-center flex-wrap"
            aria-label="Filter listings by status"
          >
            <button
              v-for="value in statuses"
              :key="value"
              type="button"
              class="listing-button btn rescue-button btn-outline-dark"
              :class="{ primary: status === value, 'btn-primary': status === value, 'btn-outline-dark': status !== value }"
              :aria-pressed="status === value"
              @click="status = value"
            >
              {{ label(value) }} · {{ countFor(value) }}
            </button>
          </div>

          <button
            class="text-button btn btn-link rescue-text-button p-0"
            type="button"
            :disabled="working"
            @click="loadListings"
          >
            Refresh
          </button>
        </div>

        <!-- Listings table -->
        <ListingsTable
          :can-edit="canEdit"
          :counts="counts"
          :date-label="dateLabel"
          :edit-hint="editHint"
          :failed-photos="failedPhotos"
          :label="label"
          :listings="listings"
          :now="now"
          :pickup-label="pickupLabel"
          :visible-listings="visibleListings"
          :working="working"
          @view-requests="viewRequests"
          @open-editor="openEditor"
          @ask-confirmation="askConfirmation"
          @photo-error="markPhotoFailed"
        />

        <!-- Pagination -->
        <div class="pagination-footer d-flex align-items-center justify-content-between flex-wrap gap-3">
          <p class="muted text-muted">
            Showing {{ rangeStart }}–{{ rangeEnd }} of
            {{ filteredListings.length }}
          </p>

          <nav
            class="pagination-controls d-flex align-items-center flex-wrap"
            aria-label="Listing pages"
          >
            <button
              type="button"
              class="listing-button btn rescue-button btn-outline-dark"
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
              class="listing-button btn rescue-button btn-outline-dark"
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

        <div class="row-actions mt-3 d-flex align-items-center flex-wrap">
          <button
            type="button"
            class="listing-button btn rescue-button btn-outline-dark"
            :disabled="working"
            @click="cancelConfirmation"
          >
            Go back
          </button>

          <button
            type="button"
            class="listing-button primary btn rescue-button btn-primary"
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
