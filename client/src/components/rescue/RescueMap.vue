<script setup>
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

import FoodIcon from '../FoodIcon.vue'

import {
  api,
  apiError,
  allPages,
  isCancelled,
  photoUrl,
} from '@/services/rescueApi.js'

import {
  CATEGORY_OPTIONS,
  categoryLabel,
} from '@/services/rescueCategories.js'

import { toLocalInput } from '@/services/rescueForm.js'

import {
  dateTimeLabel,
  windowLabel,
} from '@/services/rescueConversations.js'

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

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

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
  const today = new Date(clock.value)

  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  )

  const day =
    date.toDateString() === today.toDateString()
      ? 'Today'
      : date.toDateString() === tomorrow.toDateString()
        ? 'Tomorrow'
        : new Intl.DateTimeFormat('en-SG', {
            day: 'numeric',
            month: 'short',
          }).format(date)

  const time = new Intl.DateTimeFormat('en-SG', {
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
</script>

<template>
  <section
    id="explore-map"
    class="explore-nearby container py-4"
    aria-labelledby="explore-title"
  >
    <header class="explore-heading">
      <div>
        <h2 id="explore-title" tabindex="-1">
          Explore nearby food
        </h2>

        <p class="muted">
          Your next good meal might be a short walk away.
        </p>
      </div>

      <span class="location-label">
        ⌖ {{ centreLabel }}
      </span>
    </header>

    <!-- Search and filters -->
    <div class="explore-filters">
      <label class="search-field">
        <span class="visually-hidden">
          Search food names
        </span>

        <input
          v-model="search"
          type="search"
          maxlength="80"
          placeholder="What are you hungry for?"
        />
      </label>

      <label>
        <span class="visually-hidden">
          Food category
        </span>

        <select v-model="category">
          <option value="all">
            All categories
          </option>

          <option
            v-for="option in CATEGORY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="visually-hidden">
          Maximum distance from the search centre
        </span>

        <select
          v-model="distance"
          :disabled="searchMode === 'viewport'"
        >
          <option value="0.5">Within 500 m</option>
          <option value="1">Within 1 km</option>
          <option value="2">Within 2 km</option>
          <option value="5">Within 5 km</option>
          <option value="10">Within 10 km</option>
          <option value="25">Within 25 km</option>
          <option value="100">Within 100 km</option>
        </select>
      </label>

      <label>
        <span class="visually-hidden">
          Pickup day
        </span>

        <select v-model="pickupDay">
          <option value="any">Any time</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
        </select>
      </label>

      <label>
        <span class="visually-hidden">
          Whose listings to show
        </span>

        <select v-model="scope">
          <option value="all">
            All available food
          </option>

          <option value="neighbours">
            Neighbours’ food
          </option>

          <option value="mine">
            Your listings
          </option>
        </select>
      </label>
    </div>

    <!-- Results summary -->
    <div class="results-heading">
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

      <span class="muted">
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
        class="secondary-button ms-2"
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
      class="explore-layout"
      :aria-busy="loading"
    >
      <div class="map-panel">
        <div class="map-tools">
          <button
            type="button"
            class="secondary-button"
            :disabled="geolocating"
            @click="useMyLocation"
          >
            {{ geolocating ? 'Locating…' : 'Use my location' }}
          </button>

          <button
            type="button"
            class="secondary-button"
            @click="searchThisArea"
          >
            Search this area
          </button>

          <button
            v-if="searchMode === 'viewport'"
            type="button"
            class="secondary-button"
            @click="searchNearCentre"
          >
            Search by distance
          </button>
        </div>

        <div
          ref="mapContainer"
          class="leaflet-mount"
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
        class="food-results"
        tabindex="0"
        aria-label="Scrollable nearby food listings"
      >
        <article
          v-for="(item, index) in filteredItems"
          :key="item.id"
          :ref="(element) => setCardElement(item.id, element)"
          class="food-card"
          :class="{ selected: selectedId === item.id }"
        >
          <img
            v-if="item.image && !failedImages.has(item.id)"
            :src="item.image"
            :alt="item.name"
            class="food-photo"
            loading="lazy"
            @error="failedImages.add(item.id)"
          />

          <div
            v-else
            class="photo-placeholder"
            aria-hidden="true"
          >
            <FoodIcon :food="item.name" />
          </div>

          <div class="food-details">
            <div class="food-heading">
              <h3>
                <button
                  type="button"
                  class="food-title-button"
                  :aria-pressed="selectedId === item.id"
                  @click="selectItem(item)"
                >
                  <span
                    class="card-marker-number"
                    aria-hidden="true"
                  >
                    {{ index + 1 }}
                  </span>

                  {{ item.name }}
                </button>
              </h3>

              <span class="food-distance">
                ⌖ {{ distanceLabel(item.distanceKm) }}
              </span>
            </div>

            <p
              v-if="item.description"
              class="food-description"
            >
              {{ item.description }}
            </p>

            <dl class="food-facts">
              <div>
                <dt>Quantity</dt>
                <dd>{{ item.quantity }}</dd>
              </div>

              <div>
                <dt>Use by</dt>
                <dd>{{ useBy(item.raw.expiresAt) }}</dd>
              </div>
            </dl>

            <div class="food-footer">
              <div>
                <span class="detail-label">
                  Pickup · {{ item.raw.pickupLabel }}
                </span>

                <p>{{ item.pickup }}</p>

                <small class="muted">
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
                class="primary-button card-action"
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

    <p class="refresh-note">
      Only available, unexpired listings are shown.

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        @click="refreshResults"
      >
        Refresh food
      </button>
    </p>

    <!-- Collection request dialog -->
    <Teleport to="body">
      <dialog
        ref="requestDialog"
        class="request-dialog"
        aria-labelledby="request-dialog-title"
        @cancel="closeRequest"
      >
        <form @submit.prevent="submitRequest">
          <h3 id="request-dialog-title">
            Request {{ requestItem?.title }}
          </h3>

          <p class="muted">
            {{ requestItem?.quantity }}
            {{ requestItem?.unit }}
            · Collect the whole listing.
          </p>

          <p class="muted">
            {{ requestItem?.user?.name || 'Owner' }}’s pickup window:

            {{
              requestItem
                ? windowLabel(
                    requestItem.pickupStart,
                    requestItem.pickupEnd,
                  )
                : ''
            }}
          </p>

          <p
            v-if="requestItem"
            class="muted"
          >
            Meet at {{ requestItem.pickupLabel }}.
            {{ requestItem.pickupInstructions }}
          </p>

          <div
            v-if="requestError"
            class="alert alert-danger"
            role="alert"
          >
            {{ requestError }}
          </div>

          <p
            v-if="requestSaved"
            class="alert alert-success"
            role="status"
          >
            Request received. The owner needs to accept it before pickup
            is confirmed.
          </p>

          <fieldset
            :disabled="
              sending ||
              requestSaved ||
              uncertainRequest
            "
          >
            <div class="row g-3">
              <div class="col-sm-6">
                <label for="rescue-request-start">
                  Pickup from
                </label>

                <input
                  id="rescue-request-start"
                  v-model="requestedStart"
                  type="datetime-local"
                  :max="
                    requestItem
                      ? toLocalInput(requestItem.expiresAt)
                      : undefined
                  "
                  required
                />
              </div>

              <div class="col-sm-6">
                <label for="rescue-request-end">
                  Pickup until
                </label>

                <input
                  id="rescue-request-end"
                  v-model="requestedEnd"
                  type="datetime-local"
                  :min="requestedStart || undefined"
                  :max="
                    requestItem
                      ? toLocalInput(requestItem.expiresAt)
                      : undefined
                  "
                  required
                />
              </div>
            </div>

            <p class="field-hint">
              Use your local time ({{ timezone }}). You can propose a
              different window ending by
              {{
                requestItem
                  ? dateTimeLabel(requestItem.expiresAt)
                  : ''
              }}.
            </p>

            <label
              class="mt-3"
              for="rescue-request-message"
            >
              Message
            </label>

            <textarea
              id="rescue-request-message"
              v-model="requestMessage"
              maxlength="1000"
              placeholder="Say hello or explain your suggested time…"
              rows="3"
            ></textarea>
          </fieldset>

          <div class="dialog-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="sending"
              @click="closeRequest"
            >
              {{ requestSaved ? 'Done' : 'Cancel' }}
            </button>

            <button
              v-if="requestSaved || uncertainRequest"
              type="button"
              class="primary-button"
              :disabled="sending"
              @click="viewSent(requestItem)"
            >
              Open Sent →
            </button>

            <button
              v-else
              type="submit"
              class="primary-button"
              :disabled="sending"
            >
              {{ sending ? 'Sending…' : 'Send request' }}
            </button>
          </div>
        </form>
      </dialog>
    </Teleport>
  </section>
</template>

<style scoped>
.explore-nearby {
  color: var(--ink);
  font: 19px/1.4 var(--font-sans);
}

.explore-nearby *,
.request-dialog * {
  box-sizing: border-box;
}

p,
h2,
h3,
dl,
dd {
  margin: 0;
}

h2,
h3 {
  font-family: var(--font-display);
  font-weight: 700;
}

h2 {
  font-size: clamp(28px, 3vw, 36px);
}

h3 {
  font-size: 25px;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.muted {
  color: var(--muted);
}

.explore-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;
}

.explore-heading h2 {
  margin: 8px 0;
}

.location-label {
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 8px 14px;
  background: var(--paper-bright);
  font-size: 16px;
}

.explore-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  border: 1.5px solid var(--ink);
  border-radius: 14px;
  background: var(--paper-bright);
}

.search-field {
  flex: 1 1 220px;
}

.explore-filters label {
  min-width: 0;
}

.explore-filters input,
.explore-filters select,
.request-dialog input,
.request-dialog textarea {
  width: 100%;
  min-height: 42px;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper-bright);
  color: var(--ink);
}

.search-field input {
  border: 0;
}

.results-heading {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0 12px;
  font-size: 16px;
}

.explore-layout {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  align-items: start;
  gap: 22px;
}

.map-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 700px;
  min-width: 0;
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  overflow: hidden;
  background: var(--aqua-soft);
}

.leaflet-mount {
  width: 100%;
  flex: 1;
  min-height: 180px;
  z-index: 0;
}

.map-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  background: var(--paper);
}

.map-tools .secondary-button {
  font-size: 15px;
  padding: 6px 10px;
  min-height: 38px;
}

.map-help {
  font-size: 13px;
  padding: 8px 12px;
  background: var(--paper-bright);
}

.food-results {
  display: grid;
  align-content: start;
  gap: 14px;
  max-height: 700px;
  overflow-y: auto;
  padding: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--aqua) var(--aqua-soft);
}

.food-card {
  display: grid;
  grid-template-columns: 28% minmax(0, 1fr);
  border: 1.5px solid var(--ink);
  border-radius: 16px;
  overflow: hidden;
  background: var(--paper-bright);
}

.food-card.selected {
  border-color: var(--aqua);
  box-shadow:
    inset 0 0 0 1px var(--aqua),
    3px 3px 0 var(--aqua-soft);
}

.food-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  display: grid;
  place-items: center;
  min-height: 180px;
  font-size: 64px;
  background: var(--paper);
}

.food-details {
  display: grid;
  gap: 10px;
  padding: 16px;
  min-width: 0;
}

.food-heading,
.food-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.food-title-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
}

.food-distance {
  white-space: nowrap;
  font-size: 17px;
}

.food-description {
  font-size: 17px;
  overflow-wrap: anywhere;
}

.food-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.food-facts dt,
.detail-label {
  display: block;
  font-size: 13px;
  color: var(--muted);
}

.food-facts dd {
  font-size: 20px;
}

.food-footer p,
.food-footer small {
  font-size: 15px;
}

.card-marker-number {
  display: inline-grid;
  place-items: center;
  min-width: 23px;
  height: 23px;
  border-radius: 50%;
  margin-right: 6px;
  background: var(--aqua-soft);
  font: 14px var(--font-sans);
}

.card-action,
.secondary-button,
.dialog-actions .primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 14px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  color: var(--paper-bright);
  background: var(--aqua);
  font-size: 17px;
}

.secondary-button {
  color: var(--ink);
  background: var(--paper);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  padding: 28px;
}

.map-notice,
.refresh-note,
.field-hint {
  margin-top: 12px;
  color: var(--muted);
  font-size: 14px;
}

.refresh-button {
  border: 0;
  background: transparent;
  color: var(--aqua);
  text-decoration: underline;
}

.request-dialog {
  width: min(580px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow: auto;
  margin: auto;
  padding: 24px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
  font: 17px/1.45 var(--font-sans);
}

.request-dialog::backdrop {
  background: rgba(18, 63, 59, 0.4);
}

.request-dialog form {
  display: grid;
  gap: 16px;
}

.request-dialog fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.request-dialog label {
  display: block;
  margin-bottom: 5px;
}

.request-dialog .field-hint {
  margin-top: 8px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

:deep(.rescue-marker-bubble) {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--ink, #123f3b);
  border-radius: 50%;
  background: var(--paper-bright, #fffefa);
  color: var(--ink, #123f3b);
  font: bold 14px var(--font-sans, sans-serif);
  box-shadow: 2px 2px 0 #123f3b44;
}

:deep(.rescue-marker-bubble.is-own) {
  background: var(--yellow, #ffdd69);
}

:deep(.rescue-marker-bubble.is-selected) {
  background: var(--aqua, #149e91);
  color: white;
  transform: scale(1.15);
}

@media (max-width: 1100px) {
  .explore-layout {
    grid-template-columns: 1fr;
  }

  .map-panel {
    height: 390px;
  }

  .food-results {
    max-height: 650px;
  }
}

@media (max-width: 575px) {
  .food-card {
    grid-template-columns: 90px minmax(0, 1fr);
  }

  .food-details {
    padding: 12px;
  }

  .photo-placeholder {
    font-size: 42px;
  }

  .food-heading h3 {
    font-size: 23px;
  }

  .food-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .food-facts {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .explore-filters > label:not(.search-field) {
    flex: 1 1 145px;
  }

  .map-panel {
    height: 370px;
  }

  .request-dialog {
    padding: 16px;
  }

  .dialog-actions {
    gap: 8px;
  }
}
</style>