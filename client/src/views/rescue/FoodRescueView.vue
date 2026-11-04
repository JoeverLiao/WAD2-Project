<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'

import Header from '@/components/rescue/RescueHeader.vue'
import SharingCorner from '@/components/rescue/SharingCorner.vue'
import MyListings from '@/components/rescue/MyListings.vue'
import RescueMap from '@/components/rescue/RescueMap.vue'
import FoodListingEditor from '@/components/rescue/FoodListingEditor.vue'

import {
  allPages,
  api,
  apiError,
  isCancelled,
} from '@/services/rescueApi.js'

import {
  entityId,
  isPastRequest,
  windowLabel,
} from '@/services/rescueConversations.js'

// Navigation
const sharingSection = ref(null)
const route = useRoute()
watch(() => route.query.inbox, value => {
  if (value === 'received' || value === 'sent') sharingSection.value = value
}, { immediate: true })
const initialListingId = ref(null)
const mapRefreshKey = ref(0)
const rescueMap = ref(null)

const nearbyState = reactive({
  listings: [],
  loading: true,
  error: '',
  searchLabel: '',
})

// Dashboard data
const receivedRequests = ref([])
const sentRequests = ref([])
const ownListings = ref([])

const summaryLoading = ref(false)
const summaryError = ref('')
const hasSummary = ref(false)
const now = ref(Date.now())

let summaryController = null
let refreshTimer = null
let alive = true

// Active listings exclude expired pickup windows and food.
function isActiveListing(item) {
  return (
    ['available', 'claimed'].includes(item.status) &&
    Date.parse(item.expiresAt) > now.value &&
    Date.parse(item.pickupEnd) > now.value
  )
}

const activeReceived = computed(() =>
  receivedRequests.value.filter(
    (request) => !isPastRequest(request, now.value),
  ),
)

const activeSent = computed(() =>
  sentRequests.value.filter(
    (request) => !isPastRequest(request, now.value),
  ),
)

const activeListings = computed(() =>
  ownListings.value.filter(isActiveListing),
)

const activeInventoryIds = computed(() =>
  ownListings.value
    .filter(
      (item) =>
        ['available', 'claimed'].includes(item.status) &&
        item.inventoryItem,
    )
    .map((item) => entityId(item.inventoryItem)),
)

const sharingSummary = computed(() => ({
  received: activeReceived.value.length,

  needsReply: activeReceived.value.filter(
    (request) => request.status === 'pending',
  ).length,

  sent: activeSent.value.length,

  awaitingReply: activeSent.value.filter(
    (request) => request.status === 'pending',
  ).length,

  listings: activeListings.value.length,

  available: activeListings.value.filter(
    (item) => item.status === 'available',
  ).length,

  reserved: activeListings.value.filter(
    (item) => item.status === 'claimed',
  ).length,
}))

function countLabel(value) {
  return hasSummary.value
    ? value
    : summaryError.value
      ? '—'
      : '…'
}

const unavailableDetail = computed(() =>
  summaryError.value ? 'Summary unavailable' : 'Loading…',
)

const receivedDetail = computed(() =>
  !hasSummary.value
    ? unavailableDetail.value
    : sharingSummary.value.needsReply
      ? `${sharingSummary.value.needsReply} awaiting reply`
      : 'All caught up',
)

const sentDetail = computed(() =>
  !hasSummary.value
    ? unavailableDetail.value
    : sharingSummary.value.awaitingReply
      ? `${sharingSummary.value.awaitingReply} awaiting reply`
      : 'No replies pending',
)

const listingsDetail = computed(() =>
  !hasSummary.value
    ? unavailableDetail.value
    : `${sharingSummary.value.available} available · ${sharingSummary.value.reserved} reserved`,
)

async function refreshSummary() {
  summaryController?.abort()

  const controller = new AbortController()
  summaryController = controller

  summaryLoading.value = true
  summaryError.value = ''

  try {
    const [received, sent, listings] = await Promise.all([
      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'received' },
        controller.signal,
      ),
      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'sent' },
        controller.signal,
      ),
      allPages(
        '/rescue/mine',
        'listings',
        {},
        controller.signal,
      ),
    ])

    if (!alive || controller.signal.aborted) return

    receivedRequests.value = received
    sentRequests.value = sent
    ownListings.value = listings

    now.value = Date.now()
    hasSummary.value = true
  } catch (error) {
    if (
      alive &&
      !controller.signal.aborted &&
      !isCancelled(error)
    ) {
      summaryError.value = apiError(
        error,
        'Unable to load your sharing summary.',
      )
    }
  } finally {
    if (alive && summaryController === controller) {
      summaryLoading.value = false
    }
  }
}

// Today's pickup prompts
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function singaporeDay(value) {
  const date = new Date(value)

  return Number.isFinite(date.getTime())
    ? dayFormatter.format(date)
    : ''
}

const todaysPickups = computed(() => {
  const today = singaporeDay(now.value)

  return receivedRequests.value
    .filter(
      (request) =>
        request.status === 'accepted' &&
        request.listing?.status === 'claimed' &&
        singaporeDay(request.pickupStart) === today,
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.pickupStart) - Date.parse(b.pickupStart),
    )
})

const pickupBusyId = ref('')
const pickupError = ref('')
const pickupNotice = ref('')

function pickupHasStarted(request) {
  return Date.parse(request.pickupStart) <= now.value
}

async function answerPickup(request, collected) {
  if (pickupBusyId.value) return

  pickupBusyId.value = entityId(request)
  pickupError.value = ''
  pickupNotice.value = ''

  let saved = false

  try {
    if (collected) {
      await api.post(
        `/rescue/${entityId(request.listing)}/collect`,
      )
    } else {
      await api.post(
        `/rescue/requests/${entityId(request)}/cancel`,
      )
    }

    saved = true

    // Remove the resolved prompt immediately.
    receivedRequests.value = receivedRequests.value.map(
      (item) =>
        entityId(item) === entityId(request)
          ? {
              ...item,
              status: collected ? 'completed' : 'cancelled',
            }
          : item,
    )

    pickupNotice.value = collected
      ? 'Collection confirmed. The shared quantity was deducted from any linked inventory.'
      : 'Pickup cancelled and reservation released. If the expiry and pickup window are still valid, the food is available again.'
  } catch (error) {
    pickupError.value = apiError(
      error,
      'Could not update this pickup. Please refresh before trying again.',
    )
  } finally {
    // Refresh even after an error to reconcile an uncertain response.
    await refreshSummary()

    if (saved) {
      mapRefreshKey.value += 1
    }

    if (alive) pickupBusyId.value = ''
  }
}

// Map and modal navigation
function updateNearbyResults(state) {
  Object.assign(nearbyState, state)
}

function exploreNearby() {
  document.getElementById('explore-map')?.scrollIntoView({
    behavior: window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
      ? 'auto'
      : 'smooth',
    block: 'start',
  })

  document.getElementById('explore-title')?.focus({
    preventScroll: true,
  })
}

async function requestFromHeader(listingId) {
  exploreNearby()
  await rescueMap.value?.requestListing(listingId)
}

function refreshNearby() {
  rescueMap.value?.refresh()
}

function openSharingSection(section) {
  initialListingId.value = null
  sharingSection.value = section
}

function openReceivedRequests(listingId) {
  initialListingId.value = listingId
  sharingSection.value = 'received'
}

function openSentRequests(listingId) {
  initialListingId.value = listingId
  sharingSection.value = 'sent'
}

function onRescueChanged() {
  mapRefreshKey.value += 1
  refreshSummary()
}

function closeSharingSection() {
  sharingSection.value = null
  initialListingId.value = null
  onRescueChanged()
}

function closeNewListing() {
  sharingSection.value = null
}

function onNewListingSaved() {
  sharingSection.value = null
}

// Lifecycle
onMounted(() => {
  refreshSummary()

  refreshTimer = setInterval(() => {
    now.value = Date.now()

    if (
      !document.hidden &&
      !summaryLoading.value &&
      !pickupBusyId.value
    ) {
      refreshSummary()
    }
  }, 30000)
})

onBeforeUnmount(() => {
  alive = false
  clearInterval(refreshTimer)
  summaryController?.abort()
})
</script>

<template>
  <Header
    :nearby-listings="nearbyState.listings"
    :nearby-loading="nearbyState.loading"
    :nearby-error="nearbyState.error"
    :search-label="nearbyState.searchLabel"
    @post-listing="openSharingSection('add')"
    @explore="exploreNearby"
    @request-listing="requestFromHeader"
    @refresh-nearby="refreshNearby"
  />

  <div class="container my-4">
    <section
      class="sharing-dashboard p-3 p-md-4"
      aria-labelledby="sharing-dashboard-title"
    >
      <!-- Heading -->
      <header class="row g-3 align-items-center mb-3">
        <div class="col-12 col-sm">
          <h2 id="sharing-dashboard-title" class="m-0">
            Your sharing
          </h2>
        </div>

        <div class="col-12 col-sm-auto d-grid">
          <button
            type="button"
            class="sharing-dashboard__add d-inline-flex align-items-center justify-content-center gap-2 px-4 py-3 text-nowrap"
            @click="openSharingSection('add')"
          >
            <svg
              class="sharing-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>

            Share food
          </button>
        </div>
      </header>

      <!-- Today's pickups -->
      <section
        v-if="todaysPickups.length"
        class="pickup-check p-3 mb-4"
        aria-labelledby="todays-pickups-title"
      >
        <div
          class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
        >
          <h3 id="todays-pickups-title" class="pickup-check-title m-0">
            Today’s pickups
          </h3>

          <span class="small">
            {{ todaysPickups.length }}
            {{ todaysPickups.length === 1 ? 'pickup' : 'pickups' }}
            to confirm
          </span>
        </div>

        <div class="d-flex flex-column gap-2">
          <article
            v-for="request in todaysPickups"
            :key="request._id"
            class="pickup-check-item p-3"
            :aria-busy="pickupBusyId === String(request._id)"
          >
            <div class="row g-3 align-items-center">
              <div class="col-12 col-md">
                <p class="pickup-check-question mb-1">
                  Did {{ request.requester?.name || 'your neighbour' }}
                  pick up {{ request.listing.title }}?
                </p>

                <p class="small mb-1">
                  {{ request.listing.quantity }}
                  {{ request.listing.unit }}
                </p>

                <p class="small text-muted mb-0">
                  {{ windowLabel(request.pickupStart, request.pickupEnd) }}
                </p>
              </div>

              <div class="col-12 col-md-auto">
                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="pickup-answer pickup-answer--yes px-3 py-2"
                    :disabled="
                      Boolean(pickupBusyId) ||
                      summaryLoading ||
                      !pickupHasStarted(request)
                    "
                    @click="answerPickup(request, true)"
                  >
                    {{
                      pickupBusyId === String(request._id)
                        ? 'Saving…'
                        : 'Yes, collected'
                    }}
                  </button>

                  <button
                    type="button"
                    class="pickup-answer px-3 py-2"
                    :disabled="
                      Boolean(pickupBusyId) ||
                      summaryLoading ||
                      !pickupHasStarted(request)
                    "
                    @click="answerPickup(request, false)"
                  >
                    No, release food
                  </button>
                </div>
              </div>
            </div>

            <p
              v-if="!pickupHasStarted(request)"
              class="small text-muted mt-2 mb-0"
            >
              You can confirm once the pickup window starts.
            </p>
          </article>
        </div>

        <p class="small mt-3 mb-0">
          Choose Yes only after handing over the food.
          No cancels this pickup and releases its reservation.
        </p>
      </section>

      <!-- Keep feedback outside the banner so it remains after the last pickup -->
      <p
        v-if="pickupNotice"
        class="alert alert-success"
        role="status"
      >
        {{ pickupNotice }}
      </p>

      <div
        v-if="pickupError"
        class="alert alert-danger"
        role="alert"
      >
        {{ pickupError }}
      </div>

      <!-- Summary error -->
      <div v-if="summaryError" class="alert alert-danger" role="alert">
        {{ summaryError }}

        <span v-if="hasSummary">
          Showing your last loaded counts.
        </span>

        <button
          type="button"
          class="btn btn-sm btn-outline-dark ms-2"
          :disabled="summaryLoading"
          @click="refreshSummary"
        >
          Retry
        </button>
      </div>

      <!-- Dashboard cards -->
      <div
        class="row row-cols-1 row-cols-md-3 g-3 g-xl-4"
        :aria-busy="summaryLoading"
      >
        <!-- Requests received -->
        <div class="col">
          <button
            type="button"
            class="sharing-stat sharing-stat--received d-flex flex-column gap-2 w-100 h-100 p-3 text-start"
            @click="openSharingSection('received')"
          >
            <span
              class="sharing-stat__heading d-flex flex-wrap align-items-center justify-content-between gap-2"
            >
              <span
                class="sharing-stat__label d-inline-flex align-items-center gap-2"
              >
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path
                    d="m5.45 5.11-3.1 5.34A3 3 0 0 0 2 11.96V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6.04a3 3 0 0 0-.35-1.51l-3.1-5.34A2 2 0 0 0 16.82 4H7.18a2 2 0 0 0-1.73 1.11Z"
                  />
                </svg>

                Requests received
              </span>

              <span
                v-if="hasSummary && sharingSummary.needsReply > 0"
                class="sharing-stat__badge d-inline-flex align-items-center justify-content-center flex-shrink-0 rounded-pill px-2 py-1 text-nowrap"
                :aria-label="`${sharingSummary.needsReply} pending requests`"
              >
                {{ sharingSummary.needsReply }} PENDING
              </span>
            </span>

            <span
              class="d-flex align-items-center justify-content-between gap-3 w-100"
            >
              <span class="sharing-stat__total">
                {{ countLabel(sharingSummary.received) }}

                <span class="visually-hidden">
                  requests received
                </span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail mt-auto">
              {{ receivedDetail }}
            </span>
          </button>
        </div>

        <!-- Requests sent -->
        <div class="col">
          <button
            type="button"
            class="sharing-stat sharing-stat--sent d-flex flex-column gap-2 w-100 h-100 p-3 text-start"
            @click="openSharingSection('sent')"
          >
            <span
              class="sharing-stat__heading d-flex flex-wrap align-items-center justify-content-between gap-2"
            >
              <span
                class="sharing-stat__label d-inline-flex align-items-center gap-2"
              >
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>

                Requests sent
              </span>
            </span>

            <span
              class="d-flex align-items-center justify-content-between gap-3 w-100"
            >
              <span class="sharing-stat__total">
                {{ countLabel(sharingSummary.sent) }}

                <span class="visually-hidden">
                  requests sent
                </span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail mt-auto">
              {{ sentDetail }}
            </span>
          </button>
        </div>

        <!-- My listings -->
        <div class="col">
          <button
            type="button"
            class="sharing-stat sharing-stat--listings d-flex flex-column gap-2 w-100 h-100 p-3 text-start"
            @click="openSharingSection('listings')"
          >
            <span
              class="sharing-stat__heading d-flex flex-wrap align-items-center justify-content-between gap-2"
            >
              <span
                class="sharing-stat__label d-inline-flex align-items-center gap-2"
              >
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="17" rx="2" />
                  <path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5" />
                </svg>

                My listings
              </span>
            </span>

            <span
              class="d-flex align-items-center justify-content-between gap-3 w-100"
            >
              <span class="sharing-stat__total">
                {{ countLabel(sharingSummary.listings) }}

                <span class="visually-hidden">
                  listings
                </span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail mt-auto">
              {{ listingsDetail }}
            </span>
          </button>
        </div>
      </div>
    </section>
  </div>

  <MyListings
    :active-section="sharingSection"
    @close="closeSharingSection"
    @changed="onRescueChanged"
    @view-requests="openReceivedRequests"
  />

  <FoodListingEditor
    v-if="sharingSection === 'add'"
    :active-inventory-ids="activeInventoryIds"
    @close="closeNewListing"
    @committed="onRescueChanged"
    @saved="onNewListingSaved"
  />

  <SharingCorner
    :active-section="sharingSection"
    :initial-listing-id="initialListingId"
    @close="closeSharingSection"
    @changed="onRescueChanged"
  />

  <RescueMap
    ref="rescueMap"
    :refresh-key="mapRefreshKey"
    @changed="refreshSummary"
    @results="updateNearbyResults"
    @view-sent="openSentRequests"
    @manage-listings="openSharingSection('listings')"
  />
</template>

<style scoped>
/* Dashboard appearance */
.sharing-dashboard {
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 5px 6px 0 var(--ink);
  font-family: var(--font-sans);
}

.sharing-dashboard h2 {
  font-family: var(--font-display);
  font-size: clamp(24px, 2.2vw, 29px);
  font-weight: 700;
  line-height: 1.3;
}

/* Icons */
.sharing-icon {
  display: block;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sharing-stat__chevron {
  width: 24px;
  height: 24px;
}

/* Add listing button */
.sharing-dashboard__add {
  border: 2px solid var(--ink);
  border-radius: 14px 11px 16px 10px;
  background: var(--aqua);
  color: white;
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 500;
  box-shadow: var(--shadow-small);
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}

.sharing-dashboard__add:hover:not(:disabled) {
  background: #0d968b;
  box-shadow: 1px 2px 0 var(--ink);
  transform: translate(2px, 2px);
}

.sharing-dashboard__add:active {
  transform: translateY(2px);
}

/* Statistic cards */
.sharing-stat {
  min-width: 0;
  min-height: 182px;
  border: 2px solid transparent;
  border-radius: 16px;
  color: var(--ink);
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}

.sharing-stat--received {
  background: #fff0c2;
}

.sharing-stat--sent {
  background: var(--aqua-soft);
}

.sharing-stat--listings {
  background: #f0f4e5;
}

.sharing-stat__heading {
  width: 100%;
  min-height: 36px;
}

.sharing-stat__label {
  font-family: var(--font-display);
  font-size: clamp(21px, 1.8vw, 23px);
  font-weight: 700;
  line-height: 1.3;
}

.sharing-stat__badge {
  background: var(--coral);
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.2;
}

.sharing-stat__total {
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sharing-stat__detail {
  font-size: clamp(22px, 2vw, 25px);
  line-height: 1.3;
}

.pickup-check {
  border: 1.5px solid var(--ink);
  border-radius: 16px;
  background: var(--yellow-sticky);
}

.pickup-check-title,
.pickup-check-question {
  font-family: var(--font-display);
  font-weight: 700;
}

.pickup-check-title {
  font-size: 25px;
}

.pickup-check-question {
  font-size: 22px;
}

.pickup-check-item {
  border: 1px solid var(--line, var(--ink));
  border-radius: 12px;
  background: var(--paper-bright);
}

.pickup-answer {
  min-height: 44px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.pickup-answer--yes {
  background: var(--aqua);
  color: white;
}

.pickup-answer:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Focus and motion */
.sharing-dashboard button:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 4px;
}

@media (hover: hover) {
  .sharing-stat:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 0 rgba(18, 63, 59, 0.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sharing-stat,
  .sharing-dashboard__add {
    transition: none;
  }

  .sharing-stat:hover,
  .sharing-dashboard__add:hover,
  .sharing-dashboard__add:active {
    transform: none;
  }
}


</style>
