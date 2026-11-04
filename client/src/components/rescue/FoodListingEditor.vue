<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { CATEGORY_OPTIONS } from '@/services/rescueCategories.js'
import { useInventoryStore } from '@/stores/inventory.js'
import { api, apiError } from '@/services/rescueApi.js'
import { lockBodyScroll } from '@/services/rescueModal.js'

import FoodIcon from '../FoodIcon.vue'

import {
  toLocalInput,
  validateForm,
} from '@/services/rescueForm.js'

// Props and events
const props = defineProps({
  listing: {
    type: Object,
    default: null,
  },

  activeInventoryIds: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'close',
  'saved',
  'committed',
])

const inventory = useInventoryStore()

// Inventory selection
const source = ref(
  props.listing
    ? props.listing.inventoryItem
      ? 'inventory'
      : 'manual'
    : 'inventory',
)

const selectedInventoryId = ref(
  String(
    props.listing?.inventoryItem?._id ||
    props.listing?.inventoryItem ||
    '',
  ),
)

const inventorySearch = ref('')

const editing = computed(() =>
  Boolean(props.listing?._id),
)

const linked = computed(() =>
  editing.value
    ? Boolean(props.listing.inventoryItem)
    : source.value === 'inventory',
)

const selectedInventory = computed(() =>
  inventory.items.find(
    (item) => item.id === selectedInventoryId.value,
  ),
)

const linkedExpiry = computed(() =>
  inventoryExpiry(selectedInventory.value),
)

const inventorySort = ref('expiry')

const inventoryOptions = computed(() => {
  const query = inventorySearch.value.trim().toLowerCase()

  const items = inventory.items.filter((item) =>
    String(item.name || '').toLowerCase().includes(query),
  )

  return items.sort((a, b) => {
    const compareNames = () =>
      String(a.name || '').localeCompare(
        String(b.name || ''),
        'en',
        { sensitivity: 'base', numeric: true },
      )

    if (inventorySort.value === 'name') {
      return compareNames()
    }

    const aTime = Date.parse(inventoryExpiry(a))
    const bTime = Date.parse(inventoryExpiry(b))

    const aHasExpiry = Number.isFinite(aTime)
    const bHasExpiry = Number.isFinite(bTime)

    // Put items without an expiry at the bottom.
    if (aHasExpiry !== bHasExpiry) {
      return aHasExpiry ? -1 : 1
    }

    if (aHasExpiry && aTime !== bTime) {
      return aTime - bTime
    }

    return compareNames()
  })
})

function chooseInventory(item) {
  if (
    editing.value ||
    saving.value ||
    persisted.value ||
    uncertainCreate.value ||
    inventoryDisabledReason(item)
  ) {
    return
  }

  selectedInventoryId.value = item.id
  selectInventoryItem()

  // Start with one whole unit when choosing a food item.
  form.quantity = 1
}

function inventoryExpiry(item) {
  return item?.expiresAtISO || item?.expiresAt || ''
}

function inventoryExpiryLabel(item) {
  const value = inventoryExpiry(item)
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return 'No expiry recorded'
  }

  const expiry = new Date(timestamp)
  const today = new Date()

  if (timestamp <= Date.now()) {
    return 'Expired'
  }

  const sameDay =
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()

  if (sameDay) {
    return 'Use by today'
  }

  return `Use by ${new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year:
      expiry.getFullYear() !== today.getFullYear()
        ? 'numeric'
        : undefined,
  }).format(expiry)}`
}

function inventoryStorageLabel(item) {
  return {
    fridge: 'Fridge',
    freezer: 'Freezer',
    pantry: 'Pantry',
  }[item.storage] || 'Inventory'
}

async function continueToFoodDetails() {
  if (!selectedInventory.value) return

  const reason = inventoryDisabledReason(selectedInventory.value)

  if (reason) {
    error.value = reason
    return
  }

  if (!validShareQuantity.value) {
    error.value = 'Choose a whole quantity within the available amount.'
    return
  }

  error.value = ''

  await nextTick()

  dialog.value
    ?.querySelector('#listing-title')
    ?.focus()
}
// Listing form
const form = reactive({
  category: props.listing?.category || 'other',
  title: props.listing?.title || '',
  description: props.listing?.description || '',
  quantity: props.listing?.quantity ?? '',
  unit: props.listing?.unit || 'pieces',

  expiresAt: toLocalInput(props.listing?.expiresAt),
  pickupStart: toLocalInput(props.listing?.pickupStart),
  pickupEnd: toLocalInput(props.listing?.pickupEnd),

  pickupLabel: props.listing?.pickupLabel || '',
  pickupInstructions: props.listing?.pickupInstructions || '',

  latitude: props.listing?.location?.coordinates?.[1] ?? '',
  longitude: props.listing?.location?.coordinates?.[0] ?? '',
})

// Dialog and loading state
const dialog = ref(null)
const mapElement = ref(null)

const error = ref('')
const locationNotice = ref('')

const geolocating = ref(false)
const saving = ref(false)
const uncertainCreate = ref(false)

const persisted = ref(null)
const savePhase = ref('')

// Photo state
const photo = ref(null)
const photoPreview = ref('')
const photoInput = ref(null)

const removeExistingPhoto = ref(false)
const photoPending = ref(false)
const photoLoaded = ref(false)
const existingPhotoUrl = ref('')

// DOM and Leaflet references
let currentPhotoObjectUrl = ''
let previewObjectUrl = ''

let map = null
let marker = null
let resizeObserver = null

let alive = true
let previouslyFocused = null
let releaseScroll = null

// Map configuration
const localTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone

const tiles =
  'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=a3soRYRrrsDYTIFau8f0'||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

const attribution =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>' ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'

const pointSelected = computed(
  () => form.latitude !== '' && form.longitude !== '',
)

const hasExistingPhoto = computed(
  () =>
    props.listing?.hasPhoto &&
    !removeExistingPhoto.value &&
    !photo.value,
)

const minDatetime = computed(() =>
  toLocalInput(Date.now()),
)

// Inventory helpers
function inventoryDisabledReason(item) {
  if (props.activeInventoryIds.includes(item.id)) {
    return 'Already listed'
  }

  if (
    !(Number(item.quantity) > 0) ||
    !item.unit?.trim()
  ) {
    return 'Add quantity and unit in your inventory first'
  }

  if (Number(item.quantity) < 1) {
    return 'Less than one whole unit available'
  }

  if (
    inventoryExpiry(item) &&
    Date.parse(inventoryExpiry(item)) <= Date.now()
  ) {
    return 'Expired'
  }

  return ''
}

function selectInventoryItem() {
  if (editing.value) {
    return
  }

  const item = selectedInventory.value

  if (!item) {
    return
  }

  form.title = item.name
  form.quantity = item.quantity
  form.unit = item.unit?.trim() || ''
  form.expiresAt = toLocalInput(inventoryExpiry(item))
}

function changeSource(value) {
  if (editing.value || persisted.value) {
    return
  }

  source.value = value
  selectedInventoryId.value = ''

  form.category = 'other'
  form.title = ''
  form.quantity = ''
  form.unit = 'pieces'
  form.expiresAt = ''
}

// Pickup location
function updatePoint(lat, lng, pan = false) {
  const latitude = Number(lat)
  const longitude = Number(lng)

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

  form.latitude = Number(latitude.toFixed(6))
  form.longitude = Number(longitude.toFixed(6))

  if (!map) {
    return
  }

  if (!marker) {
    const icon = L.divIcon({
      className: 'pickup-marker-wrapper',
      html: '<span class="pickup-marker-dot"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })

    marker = L.marker([latitude, longitude], {
      icon,
      draggable: true,
      title: 'Pickup meeting point',
      autoPan: true,
    }).addTo(map)

    marker.on('dragend', () => {
      const point = marker.getLatLng()
      updatePoint(point.lat, point.lng)
    })
  } else {
    marker.setLatLng([latitude, longitude])
  }

  if (pan) {
    map.setView([latitude, longitude], 16)
  }
}

function syncTypedPoint() {
  if (pointSelected.value) {
    updatePoint(
      form.latitude,
      form.longitude,
      true,
    )
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    locationNotice.value =
      'Location is unavailable. Tap the map or enter coordinates.'

    return
  }

  geolocating.value = true
  locationNotice.value = ''

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (!alive) {
        return
      }

      geolocating.value = false

      if (saving.value || persisted.value) {
        return
      }

      updatePoint(
        position.coords.latitude,
        position.coords.longitude,
        true,
      )

      locationNotice.value =
        'Location found. Move the pin to your public pickup meeting point.'
    },

    () => {
      if (!alive) {
        return
      }

      geolocating.value = false

      locationNotice.value =
        'Could not access location. Tap the map or enter coordinates instead.'
    },

    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    },
  )
}

// Photo selection and preview
function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
  }

  previewObjectUrl = ''
  photoPreview.value = ''
}

function choosePhoto(event) {
  const file = event.target.files?.[0]

  if (!file) {
    return
  }

  error.value = ''

  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      file.type,
    )
  ) {
    error.value =
      'Choose a JPEG, PNG or WebP image. Convert HEIC photos to JPEG first.'

    event.target.value = ''
    return
  }

  if (file.size > 8 * 1024 * 1024) {
    error.value = 'Choose a photo smaller than 8 MiB.'
    event.target.value = ''
    return
  }

  clearPreview()

  photo.value = file
  removeExistingPhoto.value = false

  previewObjectUrl = URL.createObjectURL(file)
  photoPreview.value = previewObjectUrl
}

function clearPhoto() {
  clearPreview()
  photo.value = null

  if (photoInput.value) {
    photoInput.value.value = ''
  }
}

async function loadExistingPhoto() {
  if (!props.listing?.hasPhoto) {
    return
  }

  try {
    const { data } = await api.get(
      `/rescue/${props.listing._id}/photo`,
      {
        responseType: 'blob',
      },
    )

    if (!alive) {
      return
    }

    currentPhotoObjectUrl = URL.createObjectURL(data)
    existingPhotoUrl.value = currentPhotoObjectUrl
  } catch {
    // The listing is still editable if its existing image is missing.
  } finally {
    if (alive) {
      photoLoaded.value = true
    }
  }
}

// Dialog controls
function close() {
  if (saving.value) {
    return
  }

  emit('close')
}

function onCancel(event) {
  event.preventDefault()
  close()
}

function onBackdrop(event) {
  if (event.target === dialog.value) {
    close()
  }
}

// Photo persistence
async function persistPhoto(listing) {
  if (photo.value) {
    const body = new FormData()
    body.append('photo', photo.value)

    // The browser supplies the multipart boundary.
    // Do not set Content-Type manually.
    await api.put(
      `/rescue/${listing._id}/photo`,
      body,
      {
        timeout: 60_000,
      },
    )
  } else if (
    removeExistingPhoto.value &&
    listing.hasPhoto
  ) {
    await api.delete(`/rescue/${listing._id}/photo`)
  }
}

// Create or update the listing
async function save() {
  if (saving.value || uncertainCreate.value) {
    return
  }

  error.value = ''

  // After a photo failure, retry only the photo.
  // Never POST a second listing.
  if (persisted.value) {
    await retryPhoto()
    return
  }

  let payload

  try {
    if (linked.value && !editing.value) {
      if (!selectedInventory.value) {
        throw new Error('Choose an inventory item to share.')
      }

      const reason = inventoryDisabledReason(
        selectedInventory.value,
      )

      if (reason) {
        throw new Error(reason)
      }
    }

    payload = validateForm(form, {
      linked: linked.value,
      linkedExpiry: linkedExpiry.value,
    })

    if (linked.value && !editing.value) {
      payload.inventoryItem = selectedInventoryId.value
    }

    if (linked.value && editing.value) {
      delete payload.quantity
      delete payload.unit
    }

    // Keep unchanged instants exact.
    // datetime-local inputs only have minute precision.
    if (editing.value) {
      for (const key of [
        'expiresAt',
        'pickupStart',
        'pickupEnd',
      ]) {
        if (
          form[key] === toLocalInput(props.listing[key])
        ) {
          payload[key] = props.listing[key]
        }
      }
    } else if (
      linked.value &&
      form.expiresAt === toLocalInput(linkedExpiry.value)
    ) {
      payload.expiresAt = linkedExpiry.value
    }
  } catch (err) {
    error.value = err.message
    return
  }

  saving.value = true

  savePhase.value = editing.value
    ? 'Saving changes…'
    : 'Creating listing…'

  try {
    const { data } = editing.value
      ? await api.patch(
          `/rescue/${props.listing._id}`,
          payload,
        )
      : await api.post('/rescue', payload)

    persisted.value = data.listing
    emit('committed', data.listing)

    try {
      savePhase.value = 'Saving photo…'
      await persistPhoto(data.listing)
    } catch (err) {
      photoPending.value = true

      error.value =
        `Your listing was saved, but the photo change failed: ${apiError(err)} Retry the photo or continue without that change.`

      return
    }

    emit('saved', data.listing)
  } catch (err) {
    // A lost create response is ambiguous.
    // Do not automatically retry a POST.
    error.value = apiError(err)

    if (!editing.value && !err.response) {
      uncertainCreate.value = true

      error.value +=
        ' The server may have saved it. Close this form and refresh My listings before trying again.'
    }
  } finally {
    saving.value = false
    savePhase.value = ''
  }
}

async function retryPhoto() {
  if (saving.value) {
    return
  }

  saving.value = true
  error.value = ''
  savePhase.value = 'Retrying photo…'

  try {
    await persistPhoto(persisted.value)

    photoPending.value = false
    emit('saved', persisted.value)
  } catch (err) {
    error.value =
      `Listing is saved. Photo change failed: ${apiError(err)}`
  } finally {
    saving.value = false
    savePhase.value = ''
  }
}

function finishWithoutPhotoChange() {
  if (!saving.value && persisted.value) {
    emit('saved', persisted.value)
  }
}

// Lifecycle
onMounted(async () => {
  previouslyFocused = document.activeElement
  releaseScroll = lockBodyScroll()

  dialog.value.showModal()

  await nextTick()

  if (!alive) {
    return
  }

  map = L.map(mapElement.value, {
    scrollWheelZoom: false,
  }).setView(
    pointSelected.value
      ? [
          Number(form.latitude),
          Number(form.longitude),
        ]
      : [1.3008, 103.8555],

    pointSelected.value ? 16 : 13,
  )

  L.tileLayer(tiles, {
    attribution,
    maxZoom: 19,
  })
    .on('tileerror', () => {
      if (alive) {
        locationNotice.value =
          'Map tiles could not load. You can still enter latitude and longitude below.'
      }
    })
    .addTo(map)

  map.on('click', (event) => {
    if (!saving.value && !persisted.value) {
      updatePoint(
        event.latlng.lat,
        event.latlng.lng,
      )
    }
  })

  if (pointSelected.value) {
    updatePoint(
      form.latitude,
      form.longitude,
    )
  }

  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize()
  })

  resizeObserver.observe(mapElement.value)
  map.invalidateSize()

  await Promise.all([
    inventory.loadInventory(),
    loadExistingPhoto(),
  ])
})

watch(saving, (value) => {
  if (!marker) {
    return
  }

  if (value || persisted.value) {
    marker.dragging.disable()
  } else {
    marker.dragging.enable()
  }
})

onBeforeUnmount(() => {
  alive = false

  resizeObserver?.disconnect()
  map?.remove()
  map = null

  clearPreview()

  if (currentPhotoObjectUrl) {
    URL.revokeObjectURL(currentPhotoObjectUrl)
  }

  dialog.value?.close()
  releaseScroll?.()

  if (previouslyFocused?.isConnected) {
    previouslyFocused.focus()
  }
})

const maxShareQuantity = computed(() => {
  const available = Number(selectedInventory.value?.quantity)

  return Number.isFinite(available)
    ? Math.max(0, Math.floor(available))
    : 0
})

const validShareQuantity = computed(() => {
  const quantity = Number(form.quantity)

  return (
    selectedInventory.value &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= maxShareQuantity.value
  )
})

const remainingQuantity = computed(() => {
  if (!validShareQuantity.value) return null

  return Number(
    (
      Number(selectedInventory.value.quantity) -
      Number(form.quantity)
    ).toFixed(12),
  )
})

function clampShareQuantity() {
  if (maxShareQuantity.value < 1) {
    form.quantity = ''
    return
  }

  const quantity = Number(form.quantity)

  form.quantity = Math.min(
    maxShareQuantity.value,
    Math.max(
      1,
      Number.isFinite(quantity) ? Math.floor(quantity) : 1,
    ),
  )
}

function changeShareQuantity(amount) {
  clampShareQuantity()

  if (maxShareQuantity.value < 1) return

  form.quantity = Math.min(
    maxShareQuantity.value,
    Math.max(1, Number(form.quantity) + amount),
  )
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="food-editor p-3 p-md-4"
      aria-labelledby="food-editor-title"
      @cancel="onCancel"
      @click="onBackdrop"
    >
      <form @submit.prevent="save">
        <!-- Heading -->
        <header
          class="d-flex justify-content-between align-items-start gap-3 mb-4"
        >
          <div>
            <h2 id="food-editor-title">
              {{ editing ? 'Edit your listing' : 'Share something good' }}
            </h2>

            <p class="field-hint mt-1">
              One type of food per listing. Your neighbour collects
              the quantity you choose to share.
            </p>
          </div>

          <button
            class="editor-close flex-shrink-0 d-flex align-items-center justify-content-center"
            type="button"
            aria-label="Close listing editor"
            :disabled="saving"
            @click="close"
          >
            ×
          </button>
        </header>

        <!-- Errors -->
        <div v-if="error" class="alert alert-danger" role="alert">
          {{ error }}
        </div>

        <!-- Photo recovery -->
        <div
          v-if="persisted && photoPending"
          class="photo-recovery p-3 mb-3"
        >
          <p>
            Your listing is already saved. Retrying will only update its photo.
          </p>

          <div class="d-flex flex-wrap gap-2 mt-2">
            <button
              class="editor-button primary"
              type="button"
              :disabled="saving"
              @click="retryPhoto"
            >
              {{ saving ? savePhase : 'Retry photo change' }}
            </button>

            <button
              class="editor-button"
              type="button"
              :disabled="saving"
              @click="finishWithoutPhotoChange"
            >
              Continue without photo change
            </button>
          </div>
        </div>

        <fieldset
          :disabled="saving || Boolean(persisted) || uncertainCreate"
        >
          <!-- Choose food -->
          <section v-if="!editing" class="editor-section p-3 mb-3">
            <div class="row g-2 align-items-center mb-3">
              <div class="col-12 col-sm">
                <h3 class="mb-1">Choose what to share</h3>

                <p class="picker-muted">
                  One item, one neighbour, less food wasted.
                </p>
              </div>

              <div class="col-12 col-sm-auto">
                <button
                  type="button"
                  class="editor-link"
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
                class="picker-muted text-center py-4"
                role="status"
              >
                Finding food in your fridge and pantry…
              </p>

              <div
                v-else-if="inventory.error"
                class="picker-feedback p-3"
                role="alert"
              >
                <p>{{ inventory.error }}</p>

                <button
                  type="button"
                  class="editor-button mt-2"
                  @click="inventory.loadInventory"
                >
                  Try again
                </button>
              </div>

              <template v-else>
                <!-- Search and sorting -->
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

                <!-- Food grid -->
                <fieldset>
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
                            <span class="food-storage">
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

                          <span class="food-name">
                            {{ item.name }}
                          </span>

                          <span class="food-meta">
                            {{ item.quantity ?? '—' }} {{ item.unit }}
                          </span>

                          <span
                            class="food-expiry mt-auto pt-1"
                            :class="{
                              'food-unavailable': Boolean(
                                inventoryDisabledReason(item),
                              ),
                            }"
                          >
                            {{
                              inventoryDisabledReason(item) ||
                              inventoryExpiryLabel(item)
                            }}
                          </span>
                        </label>
                      </div>

                      <div
                        v-if="!inventoryOptions.length"
                        class="col-12"
                      >
                        <div class="picker-empty text-center px-3 py-4">
                          <p class="picker-empty-title">
                            {{
                              inventorySearch.trim()
                                ? 'No matching food'
                                : 'Your shelves are waiting'
                            }}
                          </p>

                          <p class="picker-muted mt-1">
                            {{
                              inventorySearch.trim()
                                ? 'Try another search or add food manually.'
                                : 'Add food to your inventory, or enter an item manually.'
                            }}
                          </p>

                          <button
                            type="button"
                            class="editor-link mt-2"
                            @click="changeSource('manual')"
                          >
                            + Add food manually
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                <!-- Selection and quantity -->
                <div
                  v-if="selectedInventory"
                  class="selection-bar p-3 mt-3"
                >
                  <div class="row g-3 align-items-center">
                    <div class="col-12 col-lg">
                      <span class="selection-label d-block mb-1">
                        Ready to share
                      </span>

                      <p class="selected-name">
                        {{ selectedInventory.name }}
                      </p>

                      <p class="picker-muted mt-1">
                        {{ selectedInventory.quantity }}
                        {{ selectedInventory.unit }} available
                      </p>
                    </div>

                    <div class="col-12 col-lg-auto">
                      <div class="row g-2 align-items-end">
                        <div class="col">
                          <label
                            for="share-picker-quantity"
                            class="quantity-label d-block mb-1"
                          >
                            Quantity to share
                          </label>

                          <div
                            class="quantity-stepper d-flex align-items-center overflow-hidden"
                          >
                            <button
                              type="button"
                              class="flex-shrink-0"
                              aria-label="Decrease quantity"
                              :disabled="
                                saving ||
                                Boolean(persisted) ||
                                uncertainCreate ||
                                maxShareQuantity < 1 ||
                                Number(form.quantity) <= 1
                              "
                              @click="changeShareQuantity(-1)"
                            >
                              −
                            </button>

                            <input
                              id="share-picker-quantity"
                              v-model.number="form.quantity"
                              class="flex-grow-1 text-center"
                              type="number"
                              min="1"
                              :max="maxShareQuantity"
                              step="1"
                              inputmode="numeric"
                              required
                              @change="clampShareQuantity"
                            />

                            <button
                              type="button"
                              class="flex-shrink-0"
                              aria-label="Increase quantity"
                              :disabled="
                                saving ||
                                Boolean(persisted) ||
                                uncertainCreate ||
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
                            class="editor-button primary"
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

                <p v-else class="picker-muted mt-3">
                  Choose one item above. We’ll fill in its details below.
                </p>
              </template>
            </template>

            <div v-else class="manual-entry-note p-3">
              <p class="selected-name">
                Something outside your inventory?
              </p>

              <p class="picker-muted mt-1">
                Enter its name, quantity and use-by date below.
              </p>
            </div>
          </section>

          <div
            v-if="editing && linked"
            class="linked-note p-3 mb-3"
          >
            Linked to your inventory. Quantity and unit stay fixed;
            the shared quantity is deducted after collection.
          </div>

          <!-- Details grid -->
          <div class="row g-3">
            <!-- Food details -->
            <div class="col-12 col-md-6">
              <section class="editor-section p-3 h-100">
                <h3 class="mb-3">1. What are you sharing?</h3>

                <label for="listing-title">
                  Food name <span aria-hidden="true">*</span>
                </label>

                <input
                  id="listing-title"
                  v-model="form.title"
                  class="form-control"
                  maxlength="120"
                  required
                  placeholder="e.g. Apples"
                />

                <label class="mt-3" for="listing-category">
                  Category
                </label>

                <select
                  id="listing-category"
                  v-model="form.category"
                  class="form-select"
                >
                  <option
                    v-for="option in CATEGORY_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>

                <div class="row g-3 mt-0">
                  <div class="col-6">
                    <label for="listing-quantity">Quantity *</label>

                    <input
                      id="listing-quantity"
                      v-model.number="form.quantity"
                      class="form-control"
                      type="number"
                      min="1"
                      :max="
                        linked && !editing
                          ? selectedInventory?.quantity
                          : 1000000
                      "
                      step="1"
                      :readonly="linked && editing"
                      required
                    />
                  </div>

                  <div class="col-6">
                    <label for="listing-unit">Unit *</label>

                    <input
                      id="listing-unit"
                      v-model="form.unit"
                      class="form-control"
                      maxlength="40"
                      list="listing-unit-options"
                      :readonly="linked"
                      required
                      placeholder="pieces"
                    />

                    <datalist id="listing-unit-options">
                      <option value="pieces" />
                      <option value="cartons" />
                      <option value="containers" />
                      <option value="bags" />
                      <option value="kg" />
                      <option value="g" />
                      <option value="litres" />
                    </datalist>
                  </div>
                </div>

                <label class="mt-3" for="listing-description">
                  Short description
                </label>

                <textarea
                  id="listing-description"
                  v-model="form.description"
                  class="form-control"
                  rows="3"
                  maxlength="1000"
                  placeholder="Condition, packaging, allergens or anything useful to know…"
                ></textarea>

                <label class="mt-3" for="listing-expiry">
                  Use-by date and time *
                </label>

                <input
                  id="listing-expiry"
                  v-model="form.expiresAt"
                  class="form-control"
                  type="datetime-local"
                  :min="minDatetime"
                  :max="
                    linkedExpiry
                      ? toLocalInput(linkedExpiry)
                      : undefined
                  "
                  required
                />

                <p class="field-hint mt-2">
                  All dates and times use your device timezone:
                  {{ localTimezone }}.
                </p>

                <!-- Photo -->
                <h3 class="mt-4 mb-3">2. Add a photo</h3>

                <div
                  class="photo-box d-flex align-items-center justify-content-center p-3 text-center"
                >
                  <img
                    v-if="photoPreview"
                    :src="photoPreview"
                    class="w-100 rounded"
                    alt="Selected food photo preview"
                  />

                  <img
                    v-else-if="hasExistingPhoto && existingPhotoUrl"
                    :src="existingPhotoUrl"
                    class="w-100 rounded"
                    alt="Current listing photo"
                  />

                  <p v-else class="field-hint">
                    {{
                      hasExistingPhoto && !photoLoaded
                        ? 'Loading current photo…'
                        : 'A clear photo helps neighbours know what they are collecting.'
                    }}
                  </p>
                </div>

                <label
                  class="visually-hidden"
                  for="listing-photo"
                >
                  Choose a food photo
                </label>

                <input
                  id="listing-photo"
                  ref="photoInput"
                  class="form-control mt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  @change="choosePhoto"
                />

                <p class="field-hint mt-2">
                  Optional. JPEG, PNG or WebP, up to 8 MiB.
                  Compressed on the server before storage.
                </p>

                <button
                  v-if="photo"
                  type="button"
                  class="editor-link"
                  @click="clearPhoto"
                >
                  Clear selected photo
                </button>

                <label
                  v-if="listing?.hasPhoto && !photo"
                  class="check-label d-flex align-items-center gap-2 mt-2"
                >
                  <input
                    v-model="removeExistingPhoto"
                    class="flex-shrink-0"
                    type="checkbox"
                  />

                  Remove the current photo when saving
                </label>
              </section>
            </div>

            <!-- Pickup details -->
            <div class="col-12 col-md-6">
              <section class="editor-section p-3 h-100">
                <h3 class="mb-3">3. Arrange pickup</h3>

                <div class="row g-3">
                  <div class="col-12 col-sm-6">
                    <label for="pickup-start">From *</label>

                    <input
                      id="pickup-start"
                      v-model="form.pickupStart"
                      class="form-control"
                      type="datetime-local"
                      :min="minDatetime"
                      :max="form.expiresAt || undefined"
                      required
                    />
                  </div>

                  <div class="col-12 col-sm-6">
                    <label for="pickup-end">Until *</label>

                    <input
                      id="pickup-end"
                      v-model="form.pickupEnd"
                      class="form-control"
                      type="datetime-local"
                      :min="form.pickupStart || minDatetime"
                      :max="form.expiresAt || undefined"
                      required
                    />
                  </div>
                </div>

                <p class="field-hint mt-2">
                  Neighbours can request this window or propose another
                  time before expiry.
                </p>

                <label class="mt-3" for="pickup-label">
                  Meeting point *
                </label>

                <input
                  id="pickup-label"
                  v-model="form.pickupLabel"
                  class="form-control"
                  maxlength="160"
                  required
                  placeholder="e.g. Community centre main entrance"
                />

                <p class="field-hint mt-2">
                  The pin, meeting point and instructions are visible to
                  other signed-in users. Choose a public meeting point
                  you are comfortable sharing.
                </p>

                <div
                  class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3"
                >
                  <label id="pickup-map-label" class="mb-0">
                    Choose the pickup point *
                  </label>

                  <button
                    type="button"
                    class="editor-link"
                    :disabled="geolocating"
                    @click="useMyLocation"
                  >
                    {{ geolocating ? 'Locating…' : 'Use my location' }}
                  </button>
                </div>

                <div
                  ref="mapElement"
                  class="pickup-map w-100"
                  aria-labelledby="pickup-map-label"
                ></div>

                <p class="field-hint mt-2">
                  Tap the map or drag the pin. You can also enter
                  coordinates below.
                </p>

                <p
                  v-if="locationNotice"
                  class="field-hint mt-2"
                  role="status"
                >
                  {{ locationNotice }}
                </p>

                <div class="row g-2 mt-0">
                  <div class="col-6">
                    <label for="pickup-lat">Latitude *</label>

                    <input
                      id="pickup-lat"
                      v-model="form.latitude"
                      class="form-control"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      required
                      placeholder="1.300800"
                      @change="syncTypedPoint"
                    />
                  </div>

                  <div class="col-6">
                    <label for="pickup-lng">Longitude *</label>

                    <input
                      id="pickup-lng"
                      v-model="form.longitude"
                      class="form-control"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      required
                      placeholder="103.855500"
                      @change="syncTypedPoint"
                    />
                  </div>
                </div>

                <label class="mt-3" for="pickup-instructions">
                  Pickup instructions
                </label>

                <textarea
                  id="pickup-instructions"
                  v-model="form.pickupInstructions"
                  class="form-control"
                  rows="2"
                  maxlength="500"
                  placeholder="e.g. Bring a reusable bag."
                ></textarea>
              </section>
            </div>
          </div>
        </fieldset>

        <!-- Footer -->
        <footer
          class="editor-footer d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 pt-3 pb-2"
        >
          <p class="field-hint">
            {{ saving ? savePhase : '* Required fields' }}
          </p>

          <div class="d-flex flex-wrap gap-2 ms-auto">
            <button
              type="button"
              class="editor-button"
              :disabled="saving"
              @click="close"
            >
              {{ persisted ? 'Close' : 'Cancel' }}
            </button>

            <button
              v-if="!persisted && !uncertainCreate"
              type="submit"
              class="editor-button primary"
              :disabled="saving"
            >
              {{
                saving
                  ? savePhase
                  : editing
                    ? 'Save changes'
                    : 'Post listing'
              }}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
/* Dialog */
.food-editor {
  width: min(1080px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  border: 2px solid var(--ink);
  border-radius: 22px;
  background: var(--paper);
  color: var(--ink);
  font: 1rem/1.45 var(--font-sans);
  box-shadow: var(--shadow-paper);
  overflow: auto;
  overscroll-behavior: contain;
}

.food-editor::backdrop {
  background: rgba(18, 63, 59, 0.48);
}

.food-editor h2,
.food-editor h3 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
}

.food-editor h2 {
  font-size: clamp(26px, 3vw, 32px);
}

.food-editor h3 {
  font-size: 23px;
}

.food-editor p {
  margin: 0;
}

.food-editor fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.editor-close {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 28px;
  line-height: 1;
}

/* Sections and fields */
.editor-section {
  min-width: 0;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 16px;
  background: var(--paper-bright);
}

.editor-section label {
  display: block;
  margin-bottom: 5px;
  font-size: 0.94rem;
  font-weight: 500;
}

.food-editor .form-control,
.food-editor .form-select {
  min-width: 0;
  min-height: 44px;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 10px;
  background-color: var(--paper);
  color: var(--ink);
  font: inherit;
}

.food-editor input:read-only {
  background-color: var(--aqua-soft);
}

.field-hint,
.picker-muted {
  color: var(--muted);
  line-height: 1.45;
}

.field-hint {
  font-size: 0.82rem;
}

.picker-muted {
  font-size: 0.85rem;
}

/* Buttons */
.editor-button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
  color: var(--ink);
  font: inherit;
}

.editor-button.primary {
  background: var(--aqua);
  color: white;
  box-shadow: 2px 2px 0 var(--ink);
}

.editor-button.primary:hover:not(:disabled) {
  background: #0d968b;
}

.editor-link {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--aqua);
  font: inherit;
  font-size: 0.9rem;
  text-decoration: underline;
}

.food-editor button {
  cursor: pointer;
}

.food-editor button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Food picker */
.picker-scroll {
  max-height: 330px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--aqua) var(--paper);
}

.food-editor .food-choice {
  min-width: 0;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 13px;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.food-choice:focus-within {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

.food-choice:hover:not(.unavailable),
.food-choice.selected {
  border-color: var(--aqua);
  background: var(--aqua-soft);
}

.food-choice.selected {
  box-shadow: inset 0 0 0 1px var(--aqua);
}

.food-choice.unavailable {
  opacity: 0.6;
  cursor: not-allowed;
}

.food-storage {
  color: var(--muted);
  font-size: 0.72rem;
}

.choice-indicator {
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--line, var(--ink));
  color: transparent;
  font-size: 12px;
  font-weight: 700;
}

.selected .choice-indicator {
  border-color: var(--aqua);
  background: var(--aqua);
  color: white;
}

.choice-icon {
  min-height: 46px;
  font-size: 36px;
}

.food-name,
.selected-name,
.picker-empty-title {
  font-family: var(--font-display);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.food-name {
  font-size: 1.12rem;
  line-height: 1.2;
}

.food-meta {
  color: var(--muted);
  font-size: 0.8rem;
}

.food-expiry {
  color: var(--aqua);
  font-size: 0.76rem;
  line-height: 1.35;
}

.food-unavailable {
  color: var(--muted);
}

.selection-bar {
  border: 1.5px solid var(--aqua);
  border-radius: 13px;
  background: var(--aqua-soft);
}

.selection-label {
  color: var(--muted);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.selected-name,
.picker-empty-title {
  font-size: 1.2rem;
  line-height: 1.25;
}

.manual-entry-note,
.picker-feedback,
.picker-empty {
  border: 1px dashed var(--line, var(--ink));
  border-radius: 12px;
  background: var(--paper);
}

/* Quantity stepper */
.food-editor .quantity-label {
  color: var(--muted);
  font-size: 0.78rem;
}

.quantity-stepper {
  width: 100%;
  max-width: 152px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
}

.quantity-stepper button {
  width: 40px;
  height: 44px;
  padding: 0;
  border: 0;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 22px;
}

.quantity-stepper button:hover:not(:disabled) {
  background: var(--aqua-soft);
}

.quantity-stepper input {
  width: 0;
  min-width: 0;
  height: 44px;
  padding: 0 4px;
  border: 0;
  border-right: 1px solid var(--line, var(--ink));
  border-left: 1px solid var(--line, var(--ink));
  border-radius: 0;
  background: var(--paper-bright);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  appearance: textfield;
  -moz-appearance: textfield;
}

.quantity-stepper input::-webkit-inner-spin-button,
.quantity-stepper input::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.quantity-stepper:focus-within {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* Photo and pickup map */
.photo-box {
  min-height: 140px;
  border: 1.5px dashed var(--line, var(--ink));
  border-radius: 12px;
  background: var(--paper);
}

.photo-box img {
  max-height: 210px;
  object-fit: contain;
}

.check-label input {
  width: 18px;
  height: 18px;
}

.pickup-map {
  height: clamp(230px, 30vw, 260px);
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  z-index: 0;
}

:deep(.pickup-marker-dot) {
  display: block;
  width: 26px;
  height: 26px;
  border: 3px solid white;
  border-radius: 50%;
  background: var(--aqua, #159b8e);
  box-shadow:
    0 0 0 2px var(--ink, #123f3b),
    0 3px 6px #0005;
}

/* Notices and footer */
.linked-note,
.photo-recovery {
  border: 1px solid var(--line, var(--ink));
  border-radius: 12px;
  background: var(--aqua-soft);
  font-size: 0.9rem;
}

.editor-footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  border-top: 1px solid var(--line, var(--ink));
  background: var(--paper);
}

.food-editor :focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .food-choice {
    transition: none;
  }
}
</style>