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

import {
  inventoryExpiry,
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
  props.listing?.inventoryItem ? 'inventory' : 'manual',
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

const inventoryOptions = computed(() =>
  inventory.items.filter((item) =>
    item.name
      .toLowerCase()
      .includes(inventorySearch.value.trim().toLowerCase()),
  ),
)

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
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="food-editor"
      aria-labelledby="food-editor-title"
      @cancel="onCancel"
      @click="onBackdrop"
    >
      <form @submit.prevent="save">
        <header class="editor-heading">
          <div>
            <h2 id="food-editor-title">
              {{
                editing
                  ? 'Edit your listing'
                  : 'Share something good'
              }}
            </h2>

            <p>
              One type of food per listing. Your neighbour collects
              the whole quantity.
            </p>
          </div>

          <button
            class="editor-close"
            type="button"
            aria-label="Close listing editor"
            :disabled="saving"
            @click="close"
          >
            ×
          </button>
        </header>

        <!-- Errors -->
        <div
          v-if="error"
          class="alert alert-danger"
          role="alert"
        >
          {{ error }}
        </div>

        <!-- Photo recovery -->
        <div
          v-if="persisted && photoPending"
          class="photo-recovery"
        >
          <p>
            Your listing is already saved. Retrying will only
            update its photo.
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
          :disabled="
            saving ||
            Boolean(persisted) ||
            uncertainCreate
          "
        >
          <!-- Listing source -->
          <section
            v-if="!editing"
            class="editor-section"
          >
            <h3>Where is the food?</h3>

            <div
              class="source-options"
              role="group"
              aria-label="Listing source"
            >
              <button
                class="source-option"
                :class="{ selected: source === 'manual' }"
                :aria-pressed="source === 'manual'"
                type="button"
                @click="changeSource('manual')"
              >
                <strong>Add manually</strong>

                <span>
                  Food you have not added to your inventory.
                </span>
              </button>

              <button
                class="source-option"
                :class="{ selected: source === 'inventory' }"
                :aria-pressed="source === 'inventory'"
                type="button"
                @click="changeSource('inventory')"
              >
                <strong>From fridge or pantry</strong>

                <span>
                  Choose an item and autofill its details.
                </span>
              </button>
            </div>

            <!-- Inventory picker -->
            <div
              v-if="source === 'inventory'"
              class="inventory-picker mt-3"
            >
              <p
                v-if="inventory.loading"
                role="status"
              >
                Loading your food…
              </p>

              <div
                v-else-if="inventory.error"
                role="alert"
              >
                <p>{{ inventory.error }}</p>

                <button
                  type="button"
                  class="editor-button mt-2"
                  @click="inventory.loadInventory"
                >
                  Retry inventory
                </button>
              </div>

              <template v-else>
                <label for="inventory-search">
                  Find food in your inventory
                </label>

                <input
                  id="inventory-search"
                  v-model="inventorySearch"
                  class="form-control mb-2"
                  type="search"
                  placeholder="Search fridge, freezer or pantry…"
                />

                <label for="inventory-choice">
                  Choose one item
                </label>

                <select
                  id="inventory-choice"
                  v-model="selectedInventoryId"
                  class="form-select"
                  :required="source === 'inventory'"
                  @change="selectInventoryItem"
                >
                  <option value="" disabled>
                    Select food…
                  </option>

                  <option
                    v-for="item in inventoryOptions"
                    :key="item.id"
                    :value="item.id"
                    :disabled="
                      Boolean(inventoryDisabledReason(item))
                    "
                  >
                    {{ item.name }} ·
                    {{ item.quantity ?? '?' }}
                    {{ item.unit || '' }} ·
                    {{ item.storage }}{{
                      inventoryDisabledReason(item)
                        ? ` — ${inventoryDisabledReason(item)}`
                        : ''
                    }}
                  </option>
                </select>

                <p
                  v-if="!inventoryOptions.length"
                  class="field-hint mt-2"
                >
                  No matching inventory items. Try another search
                  or add food manually.
                </p>

                <p
                  v-if="selectedInventory"
                  class="field-hint mt-2"
                >
                  The linked inventory item will be removed only
                  after you confirm collection. Its quantity must
                  stay unchanged while listed.
                </p>
              </template>
            </div>
          </section>

          <div
            v-if="editing && linked"
            class="linked-note"
          >
            Linked to your inventory. Quantity and unit stay fixed;
            collection will remove the whole linked item.
          </div>

          <div class="editor-grid">
            <!-- Food details -->
            <section class="editor-section">
              <h3>1. What are you sharing?</h3>

              <label for="listing-title">
                Food name
                <span aria-hidden="true">*</span>
              </label>

              <input
                id="listing-title"
                v-model="form.title"
                class="form-control"
                maxlength="120"
                required
                placeholder="e.g. Apples"
              />

              <label
                class="mt-3"
                for="listing-category"
              >
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
                  <label for="listing-quantity">
                    Quantity *
                  </label>

                  <input
                    id="listing-quantity"
                    v-model="form.quantity"
                    class="form-control"
                    type="number"
                    min="0.001"
                    max="1000000"
                    step="any"
                    :readonly="linked"
                    required
                  />
                </div>

                <div class="col-6">
                  <label for="listing-unit">
                    Unit *
                  </label>

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

              <label
                class="mt-3"
                for="listing-description"
              >
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

              <label
                class="mt-3"
                for="listing-expiry"
              >
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

              <p class="field-hint">
                All dates and times use your device timezone:
                {{ localTimezone }}.
              </p>

              <!-- Photo -->
              <h3 class="mt-4">
                2. Add a photo
              </h3>

              <div class="photo-box">
                <img
                  v-if="photoPreview"
                  :src="photoPreview"
                  alt="Selected food photo preview"
                />

                <img
                  v-else-if="hasExistingPhoto && existingPhotoUrl"
                  :src="existingPhotoUrl"
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

              <p class="field-hint">
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
                class="check-label mt-2"
              >
                <input
                  v-model="removeExistingPhoto"
                  type="checkbox"
                />

                Remove the current photo when saving
              </label>
            </section>

            <!-- Pickup details -->
            <section class="editor-section">
              <h3>3. Arrange pickup</h3>

              <div class="row g-3">
                <div class="col-sm-6">
                  <label for="pickup-start">
                    From *
                  </label>

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

                <div class="col-sm-6">
                  <label for="pickup-end">
                    Until *
                  </label>

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

              <p class="field-hint">
                Neighbours can request this window or propose
                another time before expiry.
              </p>

              <label
                class="mt-3"
                for="pickup-label"
              >
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

              <p class="field-hint">
                The pin, meeting point and instructions are visible
                to other signed-in users. Choose a public meeting
                point you are comfortable sharing.
              </p>

              <div class="map-heading mt-3">
                <label id="pickup-map-label">
                  Choose the pickup point *
                </label>

                <button
                  type="button"
                  class="editor-link"
                  :disabled="geolocating"
                  @click="useMyLocation"
                >
                  {{
                    geolocating
                      ? 'Locating…'
                      : 'Use my location'
                  }}
                </button>
              </div>

              <div
                ref="mapElement"
                class="pickup-map"
                aria-labelledby="pickup-map-label"
              ></div>

              <p class="field-hint">
                Tap the map or drag the pin. You can also enter
                coordinates below.
              </p>

              <p
                v-if="locationNotice"
                class="field-hint"
                role="status"
              >
                {{ locationNotice }}
              </p>

              <div class="row g-2 mt-0">
                <div class="col-6">
                  <label for="pickup-lat">
                    Latitude *
                  </label>

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
                  <label for="pickup-lng">
                    Longitude *
                  </label>

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

              <label
                class="mt-3"
                for="pickup-instructions"
              >
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
        </fieldset>

        <!-- Footer actions -->
        <footer class="editor-footer">
          <p class="field-hint">
            {{ saving ? savePhase : '* Required fields' }}
          </p>

          <div class="d-flex flex-wrap gap-2">
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
.food-editor {
  width: min(1080px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 24px;
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

.food-editor * {
  box-sizing: border-box;
}

.food-editor h2,
.food-editor h3 {
  font-family: var(--font-display);
  font-weight: 700;
  margin: 0;
}

.food-editor h2 {
  font-size: clamp(26px, 3vw, 32px);
}

.food-editor h3 {
  font-size: 23px;
  margin-bottom: 14px;
}

.food-editor p {
  margin: 0;
}

.food-editor fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}

.editor-heading,
.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.editor-heading {
  margin-bottom: 20px;
  align-items: flex-start;
}

.editor-heading p {
  font-size: 0.92rem;
  color: var(--muted);
  margin-top: 5px;
}

.editor-close {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 28px;
  line-height: 1;
}

.editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.editor-section {
  min-width: 0;
  padding: 18px;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 16px;
  background: var(--paper-bright);
  margin-bottom: 18px;
}

.editor-section label {
  display: block;
  font-size: 0.94rem;
  margin-bottom: 5px;
  font-weight: 500;
}

.food-editor .form-control,
.food-editor .form-select {
  min-height: 44px;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 10px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
}

.food-editor input:read-only {
  background: var(--aqua-soft);
}

.food-editor .field-hint {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.45;
  margin-top: 7px;
}

.source-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.source-option {
  padding: 13px;
  border: 1.5px solid var(--line, var(--ink));
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink);
  text-align: left;
}

.source-option.selected {
  border-color: var(--aqua);
  box-shadow: inset 0 0 0 1px var(--aqua);
  background: var(--aqua-soft);
}

.source-option strong,
.source-option span {
  display: block;
}

.source-option strong {
  font-size: 1rem;
}

.source-option span {
  font-size: 0.82rem;
  margin-top: 4px;
  color: var(--muted);
}

.pickup-map {
  height: 260px;
  width: 100%;
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  z-index: 0;
}

.map-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-link {
  border: 0;
  background: transparent;
  color: var(--aqua);
  font: inherit;
  font-size: 0.9rem;
  text-decoration: underline;
  padding: 5px 0;
}

.photo-box {
  display: grid;
  place-items: center;
  min-height: 140px;
  padding: 12px;
  border: 1.5px dashed var(--line, var(--ink));
  border-radius: 12px;
  background: var(--paper);
  text-align: center;
}

.photo-box img {
  width: 100%;
  max-height: 210px;
  object-fit: contain;
  border-radius: 8px;
}

.food-editor .check-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.check-label input {
  width: 18px;
  height: 18px;
}

.editor-footer {
  position: sticky;
  bottom: -24px;
  background: var(--paper);
  padding: 16px 0 0;
  border-top: 1px solid var(--line, var(--ink));
  margin-top: 4px;
}

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

.food-editor button {
  cursor: pointer;
}

.food-editor button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.linked-note,
.photo-recovery {
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--line, var(--ink));
  border-radius: 12px;
  background: var(--aqua-soft);
  font-size: 0.9rem;
}

.food-editor :focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
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

@media (max-width: 767px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .food-editor {
    padding: 16px;
  }

  .editor-footer {
    bottom: -16px;
  }

  .pickup-map {
    height: 230px;
  }

  .source-options {
    grid-template-columns: 1fr;
  }

  .editor-section {
    padding: 14px;
  }

  .editor-footer {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>