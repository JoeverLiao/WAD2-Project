<script setup>
import { singaporeDateKey } from '@/services/rescueDates.js'
import '@/assets/rescue.css'
import CollectionRequestForm from './CollectionRequestForm.vue'
import NearbyFilters from './NearbyFilters.vue'
import NearbyFoodCard from './NearbyFoodCard.vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  api,
  apiError,
  allPages,
  isCancelled,
  photoUrl,
} from '@/services/rescueApi.js'

import { toLocalInput } from '@/services/rescueForm.js'

import { windowLabel } from '@/services/rescueConversations.js'

import { lockBodyScroll } from '@/services/rescueModal.js'

import {
  DEFAULT_CENTRE,
  validPoint,
  distanceKm,
  distanceLabel,
  dayWindow,
  boundsForApi,
  requestPayload,
} from '@/services/rescueMap.js'

// Props and events
const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'changed',
  'view-sent',
  'manage-listings',
  'results',
])

// Listings and filters
const rawListings = ref([])
const sentRequests = ref([])

const search = ref('')
const category = ref('all')
const distance = ref('2')
const pickupDay = ref('any')
const scope = ref('all')

// Search location
const centre = ref({ ...DEFAULT_CENTRE })
const centreLabel = ref('Singapore map centre')
const searchMode = ref('nearby')
const viewport = ref(null)

// Map and page state
const selectedId = ref(null)
const mapContainer = ref(null)

const loading = ref(true)
const error = ref('')
const notice = ref('')
const mapNotice = ref('')

const geolocating = ref(false)
const openingRequestId = ref(null)
const mapMoved = ref(false)
const clock = ref(Date.now())

const failedImages = ref(new Set())

// Collection request form
const requestDialog = ref(null)
const requestItem = ref(null)

const requestedStart = ref('')
const requestedEnd = ref('')
const requestMessage = ref('')
const requestError = ref('')

const sending = ref(false)
const requestSaved = ref(false)
const uncertainRequest = ref(false)

// DOM and Leaflet references
const cardElements = new Map()
const markers = new Map()

const timezone = 'Asia/Singapore'

let map = null
let layer = null
let resizeObserver = null
let loadController = null

let debounceTimer
let pollTimer
let releaseScroll
let previousFocus

let alive = true
let geolocationAttempt = 0

// Map tiles
const tiles =
  'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=a3soRYRrrsDYTIFau8f0'||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

const attribution =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>' ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'

// Active requests indexed by listing ID
const activeRequests = computed(
  () =>
    new Map(
      sentRequests.value
        .filter((request) =>
          ['pending', 'accepted'].includes(request.status),
        )
        .map((request) => [
          String(request.listing?._id || request.listing),
          request,
        ]),
    ),
)

// Listings displayed in the cards and on the map
const filteredItems = computed(() =>
  rawListings.value
    .filter(
      (raw) =>
        raw.status === 'available' &&
        Date.parse(raw.expiresAt) > clock.value &&
        Date.parse(raw.pickupEnd) > clock.value &&
        validPoint(raw.location?.coordinates),
    )
    .filter(
      (raw) =>
        scope.value === 'all' ||
        (
          scope.value === 'mine'
            ? raw.isOwner === true
            : raw.isOwner !== true
        ),
    )
    .map((raw) => ({
      id: String(raw._id),
      name: raw.title,
      description: raw.description || '',
      quantity: `${raw.quantity} ${raw.unit}`,
      pickup: windowLabel(raw.pickupStart, raw.pickupEnd),
      person: raw.user?.name || 'A neighbour',
      image: photoUrl(raw),

      lat: raw.location.coordinates[1],
      lng: raw.location.coordinates[0],

      distanceKm: Number.isFinite(raw.distanceMeters)
        ? raw.distanceMeters / 1000
        : distanceKm(centre.value, raw.location.coordinates),

      raw,
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        a.id.localeCompare(b.id),
    ),
)

const areaLabel = computed(() =>
  searchMode.value === 'viewport'
    ? 'Visible map area'
    : `Within ${distanceLabel(Number(distance.value))} of the search centre`,
)

// Formatting
function useBy(value) {
  const date = new Date(value)
  const today = singaporeDateKey(clock.value)
  const tomorrow = singaporeDateKey(clock.value + 86400000)

  const day =
    singaporeDateKey(date) === today
      ? 'Today'
      : singaporeDateKey(date) === tomorrow
        ? 'Tomorrow'
        : new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
            day: 'numeric',
            month: 'short',
          }).format(date)

  const time = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)

  return `${day}, ${time}`
}

// Search and data loading
function setCardElement(id, element) {
  if (element) {
    cardElements.set(id, element)
  } else {
    cardElements.delete(id)
  }
}

function queryParams() {
  return {
    ...(search.value.trim()
      ? { q: search.value.trim() }
      : {}),

    ...(category.value !== 'all'
      ? { category: category.value }
      : {}),

    ...dayWindow(pickupDay.value),

    ...(searchMode.value === 'viewport'
      ? viewport.value
      : {
          latitude: centre.value.lat,
          longitude: centre.value.lng,
          radiusKm: Number(distance.value),
        }),
  }
}

async function loadResults() {
  loadController?.abort()

  const controller = new AbortController()
  loadController = controller

  loading.value = true
  error.value = ''

  try {
    const params = queryParams()

    const [listings, requests] = await Promise.all([
      allPages(
        '/rescue',
        'listings',
        params,
        controller.signal,
      ),

      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'sent' },
        controller.signal,
      ),
    ])

    if (!alive || controller.signal.aborted) {
      return
    }

    rawListings.value = listings
    sentRequests.value = requests
    failedImages.value.clear()
    clock.value = Date.now()

    const selectionStillExists = filteredItems.value.some(
      (item) => item.id === selectedId.value,
    )

    if (!selectionStillExists) {
      selectedId.value = filteredItems.value[0]?.id || null
    }
  } catch (err) {
    if (
      alive &&
      !controller.signal.aborted &&
      !isCancelled(err)
    ) {
      error.value = apiError(
        err,
        'Unable to load nearby food.',
      )
    }
  } finally {
    if (alive && loadController === controller) {
      loading.value = false
    }
  }
}

function queueSearch() {
  clearTimeout(debounceTimer)
  loadController?.abort()

  debounceTimer = setTimeout(() => loadResults(), 300)
}

function refreshResults() {
  clearTimeout(debounceTimer)
  return loadResults()
}

// Map markers and card selection
function markerIcon(index, selected, own) {
  return L.divIcon({
    className: 'rescue-marker-wrapper',

    html: `
      <span class="rescue-marker-bubble${selected ? ' is-selected' : ''}${own ? ' is-own' : ''}">${index + 1}</span>
    `.trim(),

    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function syncMarkers() {
  if (!map || !layer) {
    return
  }

  layer.clearLayers()
  markers.clear()

  filteredItems.value.forEach((item, index) => {
    const label = document.createElement('span')
    label.textContent = `${item.name} · ${item.quantity}`

    const marker = L.marker([item.lat, item.lng], {
      icon: markerIcon(
        index,
        item.id === selectedId.value,
        item.raw.isOwner,
      ),
      title: item.name,
      keyboard: true,
    }).addTo(layer)

    marker.bindTooltip(label)

    marker.on('click', () => {
      selectItem(item, true, false)
    })

    markers.set(item.id, marker)
  })
}

async function selectItem(
  item,
  scrollToCard = false,
  pan = true,
) {
  selectedId.value = item.id

  if (map && pan) {
    map.panTo([item.lat, item.lng])
  }

  if (scrollToCard) {
    await nextTick()

    cardElements.get(item.id)?.scrollIntoView({
      behavior: window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
        ? 'auto'
        : 'smooth',

      block: 'nearest',
    })
  }
}

// Location and map-area searches
function searchThisArea() {
  if (!map) {
    return
  }

  geolocationAttempt++
  geolocating.value = false

  try {
    viewport.value = boundsForApi(map.getBounds())

    const point = map.getCenter()

    centre.value = {
      lat: point.lat,
      lng: point.lng,
    }

    centreLabel.value = 'Selected map area'
    searchMode.value = 'viewport'
    mapMoved.value = false

    refreshResults()
  } catch (err) {
    mapNotice.value = err.message
  }
}

function searchNearCentre() {
  geolocationAttempt++
  geolocating.value = false

  if (map) {
    const point = map.getCenter()

    centre.value = {
      lat: point.lat,
      lng: point.lng,
    }

    centreLabel.value = 'Selected map centre'
  }

  searchMode.value = 'nearby'
  viewport.value = null
  mapMoved.value = false

  refreshResults()
}

async function centreOnSavedLocation() {
  try {
    const { data } = await api.get('/locations/saved')
    const location = data.location

    if (
      !map ||
      location?.latitude == null ||
      location?.longitude == null
    ) {
      return
    }

    const latitude = Number(location.latitude)
    const longitude = Number(location.longitude)

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return
    }

    centreLabel.value = location.address

    map.setView([latitude, longitude], map.getZoom())
  } catch {
    // Keep the existing Singapore centre if loading fails.
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    mapNotice.value =
      'Location is unavailable. Move the map and choose Search this area.'

    return
  }

  const attempt = ++geolocationAttempt

  geolocating.value = true
  mapNotice.value = ''

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (!alive || attempt !== geolocationAttempt) {
        return
      }

      geolocating.value = false

      centre.value = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }

      centreLabel.value = 'Your location'
      searchMode.value = 'nearby'
      viewport.value = null

      map?.setView(
        [centre.value.lat, centre.value.lng],
        14,
      )

      mapMoved.value = false

      refreshResults()
    },

    () => {
      if (alive && attempt === geolocationAttempt) {
        geolocating.value = false

        mapNotice.value =
          'Could not access location. Move the map and choose Search this area instead.'
      }
    },

    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    },
  )
}

// Collection request dialog
function viewSent(item) {
  closeRequest()
  emit('view-sent', String(item._id || item.id))
}

function manageListing() {
  emit('manage-listings')
}

async function openRequest(item) {
  if (
    loading.value ||
    openingRequestId.value ||
    sending.value
  ) {
    return
  }

  if (item.raw.isOwner) {
    manageListing()
    return
  }

  if (activeRequests.value.has(item.id)) {
    viewSent(item.raw)
    return
  }

  openingRequestId.value = item.id
  error.value = ''
  notice.value = ''

  try {
    const { data } = await api.get(`/rescue/${item.id}`)

    if (!alive) {
      return
    }

    const listing = data.listing

    if (listing.isOwner) {
      manageListing()
      return
    }

    if (
      listing.status !== 'available' ||
      Date.parse(listing.expiresAt) <= Date.now() ||
      Date.parse(listing.pickupEnd) <= Date.now()
    ) {
      throw new Error(
        'This food is no longer available. Refresh to see other listings.',
      )
    }

    requestItem.value = listing
    requestMessage.value = ''
    requestError.value = ''
    requestSaved.value = false
    uncertainRequest.value = false

    const start =
      Date.parse(listing.pickupStart) > Date.now()
        ? listing.pickupStart
        : new Date(
            Math.ceil((Date.now() + 60000) / 60000) * 60000,
          ).toISOString()

    requestedStart.value = toLocalInput(start)
    requestedEnd.value = toLocalInput(listing.pickupEnd)

    previousFocus = document.activeElement
    releaseScroll = lockBodyScroll()

    requestDialog.value.showModal()
  } catch (err) {
    if (alive) {
      error.value = apiError(err)
    }
  } finally {
    if (alive) {
      openingRequestId.value = null
    }
  }
}

function closeRequest(event) {
  event?.preventDefault?.()

  if (sending.value) {
    return
  }

  requestDialog.value?.close()

  releaseScroll?.()
  releaseScroll = null

  if (previousFocus?.isConnected) {
    previousFocus.focus()
  }
}

function finishRequest(request, existing = false) {
  if (!alive) {
    return
  }

  const index = sentRequests.value.findIndex(
    (item) => String(item._id) === String(request._id),
  )

  if (index >= 0) {
    sentRequests.value.splice(index, 1, request)
  } else {
    sentRequests.value.push(request)
  }

  requestSaved.value = true
  uncertainRequest.value = false
  requestError.value = ''

  notice.value = existing
    ? 'You already have an active request for this food. Open Sent to continue.'
    : 'Your request was sent. The owner will confirm your pickup.'

  emit('changed')
  refreshResults()
}

async function submitRequest() {
  if (
    sending.value ||
    requestSaved.value ||
    uncertainRequest.value
  ) {
    return
  }

  let body

  try {
    // Preserve unchanged server instants, including seconds/milliseconds.
    const listing = requestItem.value

    body = requestPayload({
      listing,
      message: requestMessage.value,

      start:
        requestedStart.value === toLocalInput(listing.pickupStart)
          ? listing.pickupStart
          : requestedStart.value,

      end:
        requestedEnd.value === toLocalInput(listing.pickupEnd)
          ? listing.pickupEnd
          : requestedEnd.value,
    })
  } catch (err) {
    requestError.value = err.message
    return
  }

  sending.value = true
  requestError.value = ''

  try {
    const { data } = await api.post(
      `/rescue/${requestItem.value._id}/claim`,
      body,
    )

    finishRequest(data.request)
  } catch (err) {
    // A lost response or 409 may mean the request already exists.
    // Reconcile by reading instead of automatically repeating a POST.
    if (!err.response || err.response.status === 409) {
      try {
        const { data } = await api.get('/rescue/requests', {
          params: {
            direction: 'sent',
            listing: requestItem.value._id,
            limit: 50,
          },
        })

        const found = data.requests.find((request) =>
          ['pending', 'accepted'].includes(request.status),
        )

        if (found) {
          finishRequest(found, true)
          return
        }

        if (!err.response) {
          uncertainRequest.value = true

          requestError.value =
            'The request outcome could not be confirmed. Check Sent or refresh before trying again.'

          return
        }
      } catch {
        if (!err.response) {
          uncertainRequest.value = true

          requestError.value =
            'The connection was interrupted. Your request may have been sent. Check Sent before trying again.'

          return
        }
      }
    }

    if (alive) {
      requestError.value = apiError(err)
    }

    if (err.response?.status === 409) {
      refreshResults()
    }
  } finally {
    if (alive) {
      sending.value = false
    }
  }
}

// Header integration
function publishResults() {
  emit('results', {
    listings: filteredItems.value.map((item) => ({
      ...item.raw,
      distanceKm: item.distanceKm,
      hasActiveRequest: activeRequests.value.has(item.id),
    })),

    loading: loading.value,
    error: error.value,
    searchLabel: `${areaLabel.value} · ${centreLabel.value}`,
  })
}

async function requestListing(listingId) {
  const item = filteredItems.value.find(
    (candidate) => candidate.id === String(listingId),
  )

  if (!item) {
    error.value =
      'This food is no longer in the current results. Refresh to see what is available.'

    return
  }

  await selectItem(item, true)
  await openRequest(item)
}

// Watchers
watch(
  [
    filteredItems,
    activeRequests,
    loading,
    error,
    areaLabel,
    centreLabel,
  ],
  publishResults,
  {
    immediate: true,
    flush: 'post',
  },
)

watch(
  [search, category, distance, pickupDay],
  queueSearch,
)

watch(scope, () => {
  const selectionStillExists = filteredItems.value.some(
    (item) => item.id === selectedId.value,
  )

  if (!selectionStillExists) {
    selectedId.value = filteredItems.value[0]?.id || null
  }
})

watch(
  [filteredItems, selectedId],
  syncMarkers,
  { flush: 'post' },
)

watch(
  () => props.refreshKey,
  refreshResults,
)

// Lifecycle
onMounted(async () => {
  try {
    map = L.map(mapContainer.value, {
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView(
      [centre.value.lat, centre.value.lng],
      14,
    )

    L.tileLayer(tiles, {
      attribution,
      maxZoom: 19,
    })
      .on('tileerror', () => {
        if (alive) {
          mapNotice.value =
            'Map tiles could not load. The food list still works; check your tile URL or connection.'
        }
      })
      .addTo(map)

    layer = L.layerGroup().addTo(map)

    await centreOnSavedLocation()

    map.on('moveend', () => {
      mapMoved.value = true
    })

    resizeObserver = new ResizeObserver(() => {
      map?.invalidateSize()
    })

    resizeObserver.observe(mapContainer.value)
    map.invalidateSize()
  } catch {
    mapNotice.value =
      'The map could not start. You can still browse food around the default search centre.'
  }

  await loadResults()

  if (!alive) {
    return
  }

  pollTimer = setInterval(() => {
    clock.value = Date.now()

    if (
      !document.hidden &&
      !loading.value &&
      !sending.value &&
      !document.querySelector('dialog[open]')
    ) {
      refreshResults()
    }
  }, 30000)
})

onBeforeUnmount(() => {
  alive = false

  clearTimeout(debounceTimer)
  clearInterval(pollTimer)

  loadController?.abort()
  geolocationAttempt++

  resizeObserver?.disconnect()
  layer?.clearLayers()
  map?.remove()

  map = null

  requestDialog.value?.close()
  releaseScroll?.()
})

defineExpose({
  refresh: refreshResults,
  requestListing,
})
function markPhotoFailed(listingId) {
  failedImages.value.add(listingId)
}
</script>

<template>
  <section
    id="explore-map"
    class="explore-nearby container py-4"
    aria-labelledby="explore-title"
  >
    <header class="explore-heading d-flex align-items-center justify-content-between flex-wrap">
      <div>
        <h2 id="explore-title" tabindex="-1">
          Explore nearby food
        </h2>

        <p class="muted text-muted">
          Your next good meal might be a short walk away.
        </p>
      </div>

      <span class="location-label">
        ⌖ {{ centreLabel }}
      </span>
    </header>

    <!-- Search and filters -->
    <NearbyFilters
      :category="category"
      :distance="distance"
      :pickup-day="pickupDay"
      :search="search"
      :search-mode="searchMode"
      @update:search="search = $event"
      @update:category="category = $event"
      @update:distance="distance = $event"
      @update:pickupDay="pickupDay = $event"
    />

    <!-- Results summary -->
    <div class="results-heading d-flex justify-content-between flex-wrap">
      <p role="status">
        {{
        loading
        ? 'Looking for food…'
        : `${filteredItems.length} good ${
        filteredItems.length === 1 ? 'find' : 'finds'
        }`
        }}

        <span v-if="!loading">
          · {{ areaLabel }}
        </span>
      </p>

      <span class="muted text-muted">
        Closest to search centre first
      </span>
    </div>

    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}

      <button
        type="button"
        class="secondary-button ms-2 btn rescue-button btn-outline-dark"
        :disabled="loading"
        @click="refreshResults"
      >
        Retry
      </button>
    </div>

    <p
      v-if="notice"
      class="alert alert-success"
      role="status"
    >
      {{ notice }}
    </p>

    <!-- Map and food cards -->
    <div
      class="explore-layout d-grid align-items-start"
      :aria-busy="loading"
    >
      <div class="map-panel position-relative d-flex flex-column overflow-hidden">
        <div class="map-tools d-flex flex-wrap gap-2">
          <button
            type="button"
            class="secondary-button btn rescue-button btn-outline-dark"
            :disabled="geolocating"
            @click="useMyLocation"
          >
            {{ geolocating ? 'Locating…' : 'Use my location' }}
          </button>

          <button
            type="button"
            class="secondary-button btn rescue-button btn-outline-dark"
            @click="searchThisArea"
          >
            Search this area
          </button>

          <button
            v-if="searchMode === 'viewport'"
            type="button"
            class="secondary-button btn rescue-button btn-outline-dark"
            @click="searchNearCentre"
          >
            Search by distance
          </button>
        </div>

        <div
          ref="mapContainer"
          class="leaflet-mount w-100"
          aria-label="Nearby food map"
        ></div>

        <p class="map-help">
          {{
          mapMoved
          ? 'Map moved. Choose Search this area to update the results.'
          : 'Tap a marker to find its food card.'
          }}

          Distances are measured in a straight line.
        </p>
      </div>

      <div
        class="food-results d-flex flex-column gap-3"
        tabindex="0"
        aria-label="Scrollable nearby food listings"
      >
        <NearbyFoodCard
          v-for="(item, index) in filteredItems"
          :key="item.id"
          :ref="(component) => setCardElement(item.id, component?.$el)"
          :active-requests="activeRequests"
          :failed-images="failedImages"
          :index="index"
          :item="item"
          :loading="loading"
          :opening-request-id="openingRequestId"
          :selected-id="selectedId"
          :sending="sending"
          :use-by="useBy"
          @select-item="selectItem"
          @open-request="openRequest"
          @photo-error="markPhotoFailed"
        />

        <p
          v-if="!loading && !filteredItems.length"
          class="empty-state"
        >
          {{
          error
          ? 'Food could not be loaded. Use Retry above.'
          : 'No matching food. Try another category, a larger distance or another map area.'
          }}
        </p>
      </div>
    </div>

    <p
      v-if="mapNotice"
      class="map-notice"
      role="status"
    >
      {{ mapNotice }}
    </p>

    <!-- Collection request dialog -->
    <Teleport to="body">
      <dialog
        ref="requestDialog"
        class="request-dialog overflow-auto"
        aria-labelledby="request-dialog-title"
        @cancel="closeRequest"
      >
        <CollectionRequestForm
          :request-error="requestError"
          :request-item="requestItem"
          :request-message="requestMessage"
          :request-saved="requestSaved"
          :requested-end="requestedEnd"
          :requested-start="requestedStart"
          :sending="sending"
          :timezone="timezone"
          :uncertain-request="uncertainRequest"
          @submit-request="submitRequest"
          @close-request="closeRequest"
          @view-sent="viewSent"
          @update:requestedStart="requestedStart = $event"
          @update:requestedEnd="requestedEnd = $event"
          @update:requestMessage="requestMessage = $event"
        />
      </dialog>
    </Teleport>
  </section>
</template>
