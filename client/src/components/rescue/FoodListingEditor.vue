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

import FoodIcon from '../FoodIcon.vue'
import { CATEGORY_OPTIONS } from '@/services/rescueCategories.js'
import { useInventoryStore } from '@/stores/inventory.js'
import { api, apiError } from '@/services/rescueApi.js'
import { lockBodyScroll } from '@/services/rescueModal.js'
import { toLocalInput, validateForm } from '@/services/rescueForm.js'

// Props and events
const props = defineProps({
  listing: { type: Object, default: null },
  activeInventoryIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved', 'committed'])
const inventory = useInventoryStore()

// Form
const editing = computed(() => Boolean(props.listing?._id))

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

// Dialog state
const dialog = ref(null)
const error = ref('')
const saving = ref(false)
const uncertainCreate = ref(false)
const persisted = ref(null)
const savePhase = ref('')

const locked = computed(
  () => saving.value || Boolean(persisted.value) || uncertainCreate.value,
)

let alive = true
let previouslyFocused = null
let releaseScroll = null

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const minDatetime = computed(() => toLocalInput(Date.now()))

// Inventory
const inventorySearch = ref('')
const inventorySort = ref('expiry')

const linked = computed(() =>
  editing.value
    ? Boolean(props.listing.inventoryItem)
    : source.value === 'inventory',
)

const selectedInventory = computed(() =>
  inventory.items.find((item) => item.id === selectedInventoryId.value),
)

function inventoryExpiry(item) {
  const value = item?.expiresAtISO || item?.expiresAt

  if (!value) return ''

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? `${value}T00:00:00`
      : value,
  )

  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

const linkedExpiry = computed(() => inventoryExpiry(selectedInventory.value))

const inventoryOptions = computed(() => {
  const query = inventorySearch.value.trim().toLowerCase()
  const now = Date.now()

  return inventory.items
    .filter((item) => {
      const expiry = inventoryExpiry(item)

      return (
        (!expiry || Date.parse(expiry) > now) &&
        String(item.name || '').toLowerCase().includes(query)
      )
    })
    .sort((a, b) => {
      const compareNames = () =>
        String(a.name || '').localeCompare(
          String(b.name || ''),
          'en',
          { sensitivity: 'base', numeric: true },
        )

      if (inventorySort.value === 'name') return compareNames()

      const aExpiry = inventoryExpiry(a)
      const bExpiry = inventoryExpiry(b)

      if (!aExpiry && !bExpiry) return compareNames()
      if (!aExpiry) return 1
      if (!bExpiry) return -1

      return Date.parse(aExpiry) - Date.parse(bExpiry) || compareNames()
    })
})

function inventoryDisabledReason(item) {
  if (props.activeInventoryIds.includes(item.id)) {
    return 'Already listed'
  }

  if (
    !Number.isFinite(Number(item.quantity)) ||
    Number(item.quantity) <= 0 ||
    !item.unit?.trim()
  ) {
    return 'Add quantity and unit in your inventory first'
  }

  if (Number(item.quantity) < 1) {
    return 'Less than one whole unit available'
  }

  const expiry = inventoryExpiry(item)

  if (expiry && Date.parse(expiry) <= Date.now()) {
    return 'Expired'
  }

  return ''
}

function chooseInventory(item) {
  if (editing.value || locked.value || inventoryDisabledReason(item)) return

  selectedInventoryId.value = item.id
  form.title = item.name
  form.quantity = 1
  form.unit = item.unit.trim()
  form.expiresAt = toLocalInput(inventoryExpiry(item))
}

function changeSource(value) {
  if (editing.value || locked.value) return

  source.value = value
  selectedInventoryId.value = ''
  form.category = 'other'
  form.title = ''
  form.quantity = ''
  form.unit = 'pieces'
  form.expiresAt = ''
}

function inventoryExpiryLabel(item) {
  const timestamp = Date.parse(inventoryExpiry(item))

  if (!Number.isFinite(timestamp)) return 'No expiry recorded'
  if (timestamp <= Date.now()) return 'Expired'

  const expiry = new Date(timestamp)
  const today = new Date()

  if (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  ) {
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

// Whole quantity controls
const maxShareQuantity = computed(() => {
  const available = Number(selectedInventory.value?.quantity)

  return Number.isFinite(available)
    ? Math.max(0, Math.floor(available))
    : 0
})

const validShareQuantity = computed(() => {
  const quantity = Number(form.quantity)

  return (
    Boolean(selectedInventory.value) &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= maxShareQuantity.value
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
    Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1),
  )
}

function changeShareQuantity(change) {
  if (locked.value || maxShareQuantity.value < 1) return

  clampShareQuantity()

  form.quantity = Math.min(
    maxShareQuantity.value,
    Math.max(1, Number(form.quantity) + change),
  )
}

async function continueToFoodDetails() {
  if (!selectedInventory.value) return

  const reason = inventoryDisabledReason(selectedInventory.value)

  if (reason || !validShareQuantity.value) {
    error.value =
      reason || 'Choose a whole quantity within the available amount.'
    return
  }

  error.value = ''

  await nextTick()
  dialog.value?.querySelector('#listing-title')?.focus()
}

// Address search
const addressQuery = ref(props.listing?.pickupLabel || '')
const addressResults = ref([])
const addressLoading = ref(false)
const addressError = ref('')
const addressPage = ref(1)
const addressTotalPages = ref(0)
const lastAddressQuery = ref('')

function validCoordinates(latitude, longitude) {
  return (
    latitude !== '' &&
    latitude !== null &&
    latitude !== undefined &&
    longitude !== '' &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180
  )
}

// Existing listings retain their saved meeting point until another is selected.
const selectedAddress = ref(
  props.listing?.pickupLabel &&
    validCoordinates(form.latitude, form.longitude)
    ? {
        address: props.listing.pickupLabel,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      }
    : null,
)

let addressController = null
let addressSearchSequence = 0

function resetAddressResults() {
  addressSearchSequence += 1
  addressController?.abort()
  addressLoading.value = false
  addressResults.value = []
  addressTotalPages.value = 0
  addressError.value = ''
}

watch(addressQuery, resetAddressResults)

async function searchPickupAddresses(page = 1) {
  if (locked.value || !alive) return

  const query =
    page === 1
      ? addressQuery.value.trim()
      : lastAddressQuery.value

  if (query.length < 2 || query.length > 160) {
    addressError.value = 'Enter between 2 and 160 characters.'
    return
  }

  addressController?.abort()

  const controller = new AbortController()
  addressController = controller

  const sequence = ++addressSearchSequence

  addressLoading.value = true
  addressError.value = ''
  addressResults.value = []
  addressTotalPages.value = 0

  try {
    const { data } = await api.get('/locations/search', {
      params: { q: query, page },
      signal: controller.signal,
    })

    if (
      !alive ||
      controller.signal.aborted ||
      sequence !== addressSearchSequence
    ) {
      return
    }

    if (!Array.isArray(data.addresses)) {
      throw new Error('Unexpected address search response.')
    }

    addressResults.value = data.addresses.filter(
      (address) =>
        typeof address.address === 'string' &&
        address.address.trim() &&
        validCoordinates(address.latitude, address.longitude),
    )

    addressPage.value = Number(data.page) || page
    addressTotalPages.value = Number(data.totalPages) || 0
    lastAddressQuery.value = query

    if (!addressResults.value.length) {
      addressError.value =
        'No matching addresses. Try a building name or postal code.'
    }
  } catch (err) {
    if (
      alive &&
      !controller.signal.aborted &&
      sequence === addressSearchSequence
    ) {
      addressError.value = apiError(err, 'Could not search addresses.')
    }
  } finally {
    if (alive && sequence === addressSearchSequence) {
      addressLoading.value = false
    }
  }
}

function choosePickupAddress(address) {
  if (locked.value) return

  if (!validCoordinates(address.latitude, address.longitude)) {
    addressError.value = 'This address has invalid coordinates.'
    return
  }

  selectedAddress.value = {
    address: address.address,
    latitude: Number(address.latitude),
    longitude: Number(address.longitude),
  }

  form.pickupLabel = selectedAddress.value.address
  form.latitude = selectedAddress.value.latitude
  form.longitude = selectedAddress.value.longitude

  resetAddressResults()
}

// Photos
const photo = ref(null)
const photoPreview = ref('')
const photoInput = ref(null)
const removeExistingPhoto = ref(false)
const photoPending = ref(false)
const photoLoaded = ref(false)
const existingPhotoUrl = ref('')

let currentPhotoObjectUrl = ''
let previewObjectUrl = ''

const hasExistingPhoto = computed(
  () =>
    props.listing?.hasPhoto &&
    !removeExistingPhoto.value &&
    !photo.value,
)

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
  }

  previewObjectUrl = ''
  photoPreview.value = ''
}

function choosePhoto(event) {
  const file = event.target.files?.[0]

  if (!file) return

  error.value = ''

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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
  if (!props.listing?.hasPhoto) return

  try {
    const { data } = await api.get(
      `/rescue/${props.listing._id}/photo`,
      { responseType: 'blob' },
    )

    if (!alive) return

    currentPhotoObjectUrl = URL.createObjectURL(data)
    existingPhotoUrl.value = currentPhotoObjectUrl
  } catch {
    // A missing photo does not prevent editing.
  } finally {
    if (alive) photoLoaded.value = true
  }
}

async function persistPhoto(listing) {
  if (photo.value) {
    const body = new FormData()
    body.append('photo', photo.value)

    await api.put(`/rescue/${listing._id}/photo`, body, {
      timeout: 60000,
    })
  } else if (removeExistingPhoto.value && listing.hasPhoto) {
    await api.delete(`/rescue/${listing._id}/photo`)
  }
}

// Dialog controls
function close() {
  if (!saving.value) emit('close')
}

function onCancel(event) {
  event.preventDefault()
  close()
}

function onBackdrop(event) {
  if (event.target === dialog.value) close()
}

// Save
async function save() {
  if (saving.value || uncertainCreate.value) return

  error.value = ''

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

      const reason = inventoryDisabledReason(selectedInventory.value)

      if (reason) throw new Error(reason)
    }

    if (
      !Number.isInteger(Number(form.quantity)) ||
      Number(form.quantity) < 1
    ) {
      throw new Error('Choose a whole quantity greater than zero.')
    }

    if (linked.value && !editing.value && !validShareQuantity.value) {
      throw new Error('Choose a quantity within the available amount.')
    }

    if (
      !selectedAddress.value ||
      !validCoordinates(
        selectedAddress.value.latitude,
        selectedAddress.value.longitude,
      )
    ) {
      throw new Error(
        'Search for a Singapore address and select a result.',
      )
    }

    form.pickupLabel = selectedAddress.value.address
    form.latitude = selectedAddress.value.latitude
    form.longitude = selectedAddress.value.longitude

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

    // Preserve exact timestamps when the displayed values are unchanged.
    if (editing.value) {
      for (const key of ['expiresAt', 'pickupStart', 'pickupEnd']) {
        if (form[key] === toLocalInput(props.listing[key])) {
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
      ? await api.patch(`/rescue/${props.listing._id}`, payload)
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
  if (saving.value || !persisted.value) return

  saving.value = true
  error.value = ''
  savePhase.value = 'Retrying photo…'

  try {
    await persistPhoto(persisted.value)
    photoPending.value = false
    emit('saved', persisted.value)
  } catch (err) {
    error.value = `Listing is saved. Photo change failed: ${apiError(err)}`
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

  await Promise.all([
    inventory.loadInventory(),
    loadExistingPhoto(),
  ])
})

onBeforeUnmount(() => {
  alive = false
  addressSearchSequence += 1
  addressController?.abort()

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

const geolocating = ref(false)

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    })
  })
}

async function useMyLocation() {
  if (locked.value || geolocating.value || addressLoading.value) return

  if (!navigator.geolocation) {
    addressError.value =
      'Your browser does not support location access. Search manually instead.'
    return
  }

  resetAddressResults()

  const sequence = ++addressSearchSequence

  geolocating.value = true
  addressError.value = ''

  try {
    const position = await getBrowserPosition()

    if (
      !alive ||
      locked.value ||
      sequence !== addressSearchSequence
    ) {
      return
    }

    const controller = new AbortController()
    addressController = controller

    const { data } = await api.get('/locations/reverse', {
      params: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      signal: controller.signal,
    })

    if (
      !alive ||
      locked.value ||
      controller.signal.aborted ||
      sequence !== addressSearchSequence
    ) {
      return
    }

    if (!Array.isArray(data.addresses)) {
      throw new Error('Unexpected address lookup response.')
    }

    const addresses = data.addresses.filter(
      (address) =>
        address.address &&
        validCoordinates(address.latitude, address.longitude),
    )

    if (!addresses.length) {
      addressError.value =
        'No nearby address found. Please search for your building or postal code.'
      return
    }

    // Fill the nearest result automatically.
    choosePickupAddress(addresses[0])

    // Let the user correct it if another nearby building is more accurate.
    addressResults.value = addresses
  } catch (err) {
    if (!alive || sequence !== addressSearchSequence) return

    addressError.value =
      err.code === 1
        ? 'Location permission was denied. Allow access or search manually.'
        : err.code === 2
          ? 'Your location is unavailable. Please search manually.'
          : err.code === 3
            ? 'Location access timed out. Try again or search manually.'
            : apiError(err, 'Could not locate your address.')
  } finally {
    if (alive) geolocating.value = false
  }
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

        <div v-if="error" class="alert alert-danger" role="alert">
          {{ error }}
        </div>

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

        <fieldset :disabled="locked">
          <!-- Food picker -->
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

                          <span class="food-name">{{ item.name }}</span>

                          <span class="food-meta">
                            {{ item.quantity ?? '—' }} {{ item.unit }}
                          </span>

                          <span
                            class="food-expiry mt-auto pt-1"
                            :class="{
                              'food-unavailable':
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
                        <div class="picker-empty text-center px-3 py-4">
                          <p class="picker-empty-title">
                            {{
                              inventorySearch.trim()
                                ? 'No matching food'
                                : 'No food available to share'
                            }}
                          </p>

                          <p class="picker-muted mt-1">
                            Try another search or add food manually.
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

                <!-- Selected item and quantity -->
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
                        <div class="col-auto">
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
                              v-model.number="form.quantity"
                              class="text-center"
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
                              class="flex-shrink-0"
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

          <div class="row g-3">
            <!-- Step 1: Full-width food details -->
            <div class="col-12">
              <section
                class="editor-section p-3 p-md-4"
                aria-labelledby="food-details-heading"
              >
                <h3 id="food-details-heading" class="mb-3">
                  1. What are you sharing?
                </h3>

                <div class="row g-3">
                  <!-- Name and category -->
                  <div class="col-12 col-md-8">
                    <label for="listing-title">Food name *</label>

                    <input
                      id="listing-title"
                      v-model="form.title"
                      class="form-control"
                      maxlength="120"
                      required
                      placeholder="e.g. Apples"
                    />
                  </div>

                  <div class="col-12 col-md-4">
                    <label for="listing-category">Category</label>

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
                  </div>

                  <!-- Quantity, unit and expiry -->
                  <div class="col-6 col-md-3">
                    <label for="listing-quantity">Quantity *</label>

                    <input
                      id="listing-quantity"
                      v-model.number="form.quantity"
                      class="form-control"
                      type="number"
                      min="1"
                      :max="
                        linked && !editing
                          ? maxShareQuantity
                          : 1000000
                      "
                      step="1"
                      :readonly="linked && editing"
                      required
                    />
                  </div>

                  <div class="col-6 col-md-3">
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

                  <div class="col-12 col-md-6">
                    <label for="listing-expiry">Use-by date and time *</label>

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
                  </div>

                  <!-- Description -->
                  <div class="col-12">
                    <label for="listing-description">Short description</label>

                    <textarea
                      id="listing-description"
                      v-model="form.description"
                      class="form-control"
                      rows="2"
                      maxlength="1000"
                      placeholder="Condition, packaging, allergens or anything useful to know…"
                    ></textarea>
                  </div>
                </div>
              </section>
            </div>

            <!-- Step 2: Photo -->
            <div class="col-12 col-lg-5">
              <section
                class="editor-section p-3 p-md-4 h-100"
                aria-labelledby="food-photo-heading"
              >
                <h3 id="food-photo-heading" class="mb-2">
                  2. Add a photo
                </h3>

                <p class="field-hint mb-3">
                  Optional, but a clear photo helps neighbours know what
                  they are collecting.
                </p>

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
                        : 'Show the food and its packaging clearly.'
                    }}
                  </p>
                </div>

                <label class="visually-hidden" for="listing-photo">
                  Choose a food photo
                </label>

                <input
                  id="listing-photo"
                  ref="photoInput"
                  class="form-control mt-3"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  @change="choosePhoto"
                />

                <p class="field-hint mt-2">
                  JPEG, PNG or WebP, up to 8 MiB.
                </p>

                <button
                  v-if="photo"
                  type="button"
                  class="editor-link mt-2"
                  @click="clearPhoto"
                >
                  Clear selected photo
                </button>

                <label
                  v-if="listing?.hasPhoto && !photo"
                  class="check-label d-flex align-items-center gap-2 mt-3"
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

            <!-- Step 3: Pickup -->
            <div class="col-12 col-lg-7">
              <section
                class="editor-section p-3 p-md-4 h-100"
                aria-labelledby="food-pickup-heading"
              >
                <h3 id="food-pickup-heading" class="mb-3">
                  3. Arrange pickup
                </h3>

                <!-- Pickup window -->
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

                <!-- Address -->
                <div class="mt-4">
                  <div
                    class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2"
                  >
                    <label for="pickup-address-search" class="mb-0">
                      Pickup address *
                    </label>

                    <button
                      type="button"
                      class="editor-link"
                      :disabled="locked || geolocating || addressLoading"
                      @click="useMyLocation"
                    >
                      {{
                        geolocating
                          ? 'Finding your address…'
                          : '⌖ Get my location'
                      }}
                    </button>
                  </div>

                  <div class="row g-2">
                    <div class="col">
                      <input
                        id="pickup-address-search"
                        v-model="addressQuery"
                        class="form-control"
                        type="search"
                        maxlength="160"
                        placeholder="Building, street or postal code"
                        @keydown.enter.prevent="searchPickupAddresses(1)"
                      />
                    </div>

                    <div class="col-auto">
                      <button
                        type="button"
                        class="editor-button"
                        :disabled="
                          addressLoading ||
                          geolocating ||
                          addressQuery.trim().length < 2
                        "
                        @click="searchPickupAddresses(1)"
                      >
                        {{ addressLoading ? 'Searching…' : 'Search' }}
                      </button>
                    </div>
                  </div>

                  <p class="field-hint mt-2">
                    Search and select an address, or use your current location.
                  </p>

                  <p
                    v-if="geolocating"
                    class="field-hint mt-2"
                    role="status"
                  >
                    Finding your current location and nearby addresses…
                  </p>

                  <p
                    v-if="addressError"
                    class="field-hint mt-2"
                    role="status"
                  >
                    {{ addressError }}
                  </p>

                  <!-- Address results -->
                  <div
                    v-if="addressResults.length"
                    class="address-results list-group overflow-auto mt-2"
                    aria-label="Matching pickup addresses"
                  >
                    <button
                      v-for="address in addressResults"
                      :key="`${address.address}-${address.latitude}-${address.longitude}`"
                      type="button"
                      class="address-result list-group-item list-group-item-action text-start"
                      @click="choosePickupAddress(address)"
                    >
                      <strong v-if="address.building" class="d-block">
                        {{ address.building }}
                      </strong>

                      <span class="d-block">
                        {{ address.address }}
                      </span>
                    </button>
                  </div>

                  <p
                    v-if="addressResults.length && !addressTotalPages"
                    class="field-hint mt-2"
                  >
                    The nearest address has been selected. Choose another
                    nearby result if needed.
                  </p>

                  <!-- Result pages -->
                  <div
                    v-if="addressTotalPages > 1"
                    class="d-flex align-items-center justify-content-between gap-2 mt-2"
                  >
                    <button
                      type="button"
                      class="editor-button"
                      :disabled="
                        addressLoading ||
                        geolocating ||
                        addressPage <= 1
                      "
                      @click="searchPickupAddresses(addressPage - 1)"
                    >
                      Previous
                    </button>

                    <span class="field-hint">
                      Page {{ addressPage }} of {{ addressTotalPages }}
                    </span>

                    <button
                      type="button"
                      class="editor-button"
                      :disabled="
                        addressLoading ||
                        geolocating ||
                        addressPage >= addressTotalPages
                      "
                      @click="searchPickupAddresses(addressPage + 1)"
                    >
                      Next
                    </button>
                  </div>

                  <!-- Selected address -->
                  <div
                    v-if="selectedAddress"
                    class="linked-note p-3 mt-3"
                    aria-live="polite"
                  >
                    <strong class="d-block">Selected meeting point</strong>

                    <p class="mt-1">
                      {{ selectedAddress.address }}
                    </p>
                  </div>
                </div>

                <!-- Instructions -->
                <label class="mt-3" for="pickup-instructions">
                  Pickup instructions
                </label>

                <textarea
                  id="pickup-instructions"
                  v-model="form.pickupInstructions"
                  class="form-control"
                  rows="2"
                  maxlength="500"
                  placeholder="e.g. Meet outside the main entrance. Bring a reusable bag."
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

/* Quantity */
.food-editor .quantity-label {
  color: var(--muted);
  font-size: 0.78rem;
}

.quantity-stepper {
  width: 152px;
  flex-shrink: 0;
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
  flex: 1 1 0;
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

/* Photos and map */
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

/* Address results */
.address-results {
  max-height: 240px;
}

.address-result {
  border-color: var(--line, var(--ink));
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  overflow-wrap: anywhere;
}

.address-result:hover,
.address-result:focus-visible {
  background: var(--aqua-soft);
  color: var(--ink);
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