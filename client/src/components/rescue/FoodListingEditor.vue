<script setup>
import '@/assets/rescue.css'
import { useListingPhotos } from '@/composables/rescue/useListingPhotos.js'
import { usePickupAddress } from '@/composables/rescue/usePickupAddress.js'
import { usePickupSchedule } from '@/composables/rescue/usePickupSchedule.js'
import { singaporeDateKey } from '@/services/rescueDates.js'
import PickupAddressPicker from './PickupAddressPicker.vue'
import PickupSchedule from './PickupSchedule.vue'
import ListingFoodDetails from './ListingFoodDetails.vue'
import InventoryFoodPicker from './InventoryFoodPicker.vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'

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

// New listings start with inventory; existing listings keep their original source.
let initialSource = 'inventory'
if (props.listing && !props.listing.inventoryItem) {
  initialSource = 'manual'
}
const source = ref(initialSource)

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
  expiresAt: toLocalInput(props.listing?.expiresAt).slice(0, 10),
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
      ? `${value}T23:59:59.999+08:00`
      : value,
  )

  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : ''
}

const linkedExpiry = computed(() => inventoryExpiry(selectedInventory.value))

const inventoryOptions = computed(() => {
  const query = inventorySearch.value.trim().toLowerCase()
  const today = singaporeDateKey()

  return inventory.items
    .filter((item) => {
      const expiryDate = item.expiresAt
        ? String(item.expiresAt).slice(0, 10)
        : ''

      return (
        (!expiryDate || today <= expiryDate) &&
        String(item.name || '').toLowerCase().includes(query)
      )
    })
    .sort((a, b) => {
      const nameOrder = String(a.name || '').localeCompare(
        String(b.name || ''),
        'en',
        { sensitivity: 'base', numeric: true },
      )

      if (inventorySort.value === 'name') return nameOrder

      const aExpiry = a.expiresAt
        ? String(a.expiresAt).slice(0, 10)
        : ''

      const bExpiry = b.expiresAt
        ? String(b.expiresAt).slice(0, 10)
        : ''

      if (!aExpiry && !bExpiry) return nameOrder
      if (!aExpiry) return 1
      if (!bExpiry) return -1

      return aExpiry.localeCompare(bExpiry) || nameOrder
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

  const expiryDate = item.expiresAt
  ? String(item.expiresAt).slice(0, 10)
  : ''

  if (expiryDate && expiryDate < singaporeDateKey()) {
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
  form.expiresAt = toLocalInput(inventoryExpiry(item)).slice(0, 10)
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
  if (!item.expiresAt) return 'No expiry recorded'

  const expiryDate = String(item.expiresAt).slice(0, 10)
  const today = singaporeDateKey()

  if (expiryDate < today) return 'Expired'
  if (expiryDate === today) return 'Expires today'

  const date = new Date(`${expiryDate}T12:00:00+08:00`)

  return `Expires ${date.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
  })}`
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

const {
  addressQuery,
  addressResults,
  addressLoading,
  addressError,
  addressPage,
  addressTotalPages,
  selectedAddress,
  geolocating,
  savedLocationLoading,
  savedLocationError,
  usingSavedLocation,
  searchPickupAddresses,
  choosePickupAddress,
  useMyLocation,
  loadSavedLocation,
  validCoordinates,
} = usePickupAddress(props, form, editing, locked)

// Photo retries remain coordinated by save() in this component.
const photoPending = ref(false)
const {
  photo,
  photoPreview,
  photoInput,
  removeExistingPhoto,
  photoLoaded,
  existingPhotoUrl,
  hasExistingPhoto,
  choosePhoto,
  clearPhoto,
  loadExistingPhoto,
  persistPhoto,
} = useListingPhotos(props, error)

// Dialog controls
function close() {
  if (!saving.value) emit('close')
}

function onCancel(event) {
  if (event.target !== dialog.value) return

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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiresAt)) {
      throw new Error('Choose a valid expiry date.')
    }

    const expiryTimestamp = new Date(
      `${form.expiresAt}T23:59:59.999+08:00`,
    ).toISOString()

    payload = validateForm(
      {
        ...form,
        expiresAt: expiryTimestamp,
      },
      {
        linked: linked.value,
        linkedExpiry: linkedExpiry.value,
      },
    )

    if (linked.value && !editing.value) {
      payload.inventoryItem = selectedInventoryId.value
    }

    if (linked.value && editing.value) {
      delete payload.quantity
      delete payload.unit
    }

    // Preserve unchanged pickup timestamps when editing.
    if (editing.value) {
      for (const key of ['pickupStart', 'pickupEnd']) {
        if (form[key] === toLocalInput(props.listing[key])) {
          payload[key] = props.listing[key]
        }
      }
    }
  } catch (err) {
    error.value = err.response?.data?.details || apiError(err)
    return
  }

  saving.value = true
  savePhase.value = editing.value
    ? 'Saving changes…'
    : 'Creating listing…'

  try {
    let response
    if (editing.value) {
      response = await api.patch(`/rescue/${props.listing._id}`, payload)
    } else {
      response = await api.post('/rescue', payload)
    }
    const data = response.data

    // Remember the saved listing so retrying a photo never creates another listing.
    persisted.value = data.listing
    emit('committed', data.listing)

    try {
      savePhase.value = 'Saving photo…'
      await persistPhoto(data.listing)
    } catch (err) {
      photoPending.value = true

      const details =
        err.response?.data?.details ||
        apiError(err)

      error.value =
        `Your listing was saved, but the photo change failed: ${details}`

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

const {
  pickupToday,
  pickupTomorrow,
  pickupDay,
  pickupDaySelected,
  pickupPreset,
  showPickupCalendar,
  pickupTimeOptions,
  pickupStartTime,
  pickupEndTime,
  pickupDayAllowed,
  pickupPresetWindow,
  selectPickupPreset,
  selectPickupDay,
  pickupSummary,
} = usePickupSchedule(form)

const showListingDetails = computed(() => {
  return (
    editing.value ||
    source.value === 'manual' ||
    Boolean(selectedInventory.value)
  )
})
// Lifecycle
onMounted(async () => {
  previouslyFocused = document.activeElement
  releaseScroll = lockBodyScroll()
  dialog.value.showModal()

  await Promise.all([
    inventory.loadInventory(),
    loadExistingPhoto(),
    loadSavedLocation(),
  ])
})

onBeforeUnmount(() => {
  alive = false
  dialog.value?.close()
  releaseScroll?.()

  if (previouslyFocused?.isConnected) {
    previouslyFocused.focus()
  }
})

// Children request field updates; the main form remains the single source of truth.
function updateFormField(field, value) {
  form[field] = value
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="food-editor p-3 p-md-4 overflow-auto"
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

            <p class="small text-muted mb-0 mt-1">
              One type of food per listing. Your neighbour collects
              the quantity you choose to share.
            </p>
          </div>

          <button
            class="btn editor-close rounded-circle p-0 flex-shrink-0 d-flex align-items-center justify-content-center rescue-close d-inline-flex"
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
          class="photo-recovery rounded-3 p-3 mb-3"
        >
          <p class="mb-0">
            Your listing is already saved. Retrying will only update its photo.
          </p>

          <div class="d-flex flex-wrap gap-2 mt-2">
            <button
              class="btn btn-primary editor-button rescue-button"
              type="button"
              :disabled="saving"
              @click="retryPhoto"
            >
              {{ saving ? savePhase : 'Retry photo change' }}
            </button>

            <button
              class="btn btn-outline-dark editor-button rescue-button"
              type="button"
              :disabled="saving"
              @click="finishWithoutPhotoChange"
            >
              Continue without photo change
            </button>
          </div>
        </div>

        <fieldset class="border-0 p-0 m-0" :disabled="locked">
          <!-- Food picker -->
          <InventoryFoodPicker
            :editing="editing"
            :form="form"
            :inventory="inventory"
            :inventory-disabled-reason="inventoryDisabledReason"
            :inventory-expiry-label="inventoryExpiryLabel"
            :inventory-options="inventoryOptions"
            :inventory-search="inventorySearch"
            :inventory-sort="inventorySort"
            :inventory-storage-label="inventoryStorageLabel"
            :locked="locked"
            :max-share-quantity="maxShareQuantity"
            :selected-inventory="selectedInventory"
            :selected-inventory-id="selectedInventoryId"
            :source="source"
            :valid-share-quantity="validShareQuantity"
            @change-source="changeSource"
            @choose-inventory="chooseInventory"
            @change-share-quantity="changeShareQuantity"
            @clamp-share-quantity="clampShareQuantity"
            @continue-to-food-details="continueToFoodDetails"
            @update:inventorySearch="inventorySearch = $event"
            @update:inventorySort="inventorySort = $event"
            @update-field="updateFormField"
            @reload="inventory.loadInventory"
          />

          <div
            v-if="editing && linked"
            class="linked-note rounded-3 p-3 mb-3"
          >
            Linked to your inventory. Quantity and unit stay fixed;
            the shared quantity is deducted after collection.
          </div>
          <template v-if="showListingDetails">
            <div class="row g-3">
              <!-- Step 1: Full-width food details -->
              <div class="col-12">
                <ListingFoodDetails
                  :editing="editing"
                  :form="form"
                  :linked="linked"
                  :linked-expiry="linkedExpiry"
                  :local-timezone="localTimezone"
                  :max-share-quantity="maxShareQuantity"
                  :min-datetime="minDatetime"
                  @update-field="updateFormField"
                />
              </div>

              <!-- Step 2: Photo -->
              <div class="col-12 col-lg-5">
                <section
                  class="editor-section rounded-4 p-3 p-md-4 h-100"
                  aria-labelledby="food-photo-heading"
                >
                  <h3 id="food-photo-heading" class="mb-2">
                    2. Add a photo
                  </h3>

                  <p class="small text-muted mb-0 mb-3">
                    Optional, but a clear photo helps neighbours know what
                    they are collecting.
                  </p>

                  <div
                    class="photo-box rounded-3 d-flex align-items-center justify-content-center p-3 text-center"
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

                    <p v-else class="small text-muted mb-0">
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
                    capture="environment"
                    @change="choosePhoto"
                    @cancel.stop
                  />

                  <p class="small text-muted mb-0 mt-2">
                    JPEG, PNG or WebP, up to 8 MiB.
                  </p>

                  <button
                    v-if="photo"
                    type="button"
                    class="btn btn-link p-0 editor-link mt-2 rescue-text-button"
                    @click="clearPhoto"
                  >
                    Clear selected photo
                  </button>

                  <label
                    v-if="listing?.hasPhoto && !photo"
                    class="form-label check-label d-flex align-items-center gap-2 mt-3"
                  >
                    <input
                      v-model="removeExistingPhoto"
                      class="form-check-input flex-shrink-0 mt-0"
                      type="checkbox"
                    />

                    Remove the current photo when saving
                  </label>
                </section>
              </div>

              <!-- Step 3: Pickup -->
              <div class="col-12 col-lg-7">
                <section
                  class="editor-section rounded-4 p-3 p-md-4 h-100"
                  aria-labelledby="food-pickup-heading"
                >
                  <h3 id="food-pickup-heading" class="mb-3">
                    3. Arrange pickup
                  </h3>

                  <!-- Pickup window -->
                  <!-- Pickup day -->
                  <PickupSchedule
                    :form="form"
                    :locked="locked"
                    :pickup-day="pickupDay"
                    :pickup-day-allowed="pickupDayAllowed"
                    :pickup-day-selected="pickupDaySelected"
                    :pickup-end-time="pickupEndTime"
                    :pickup-preset="pickupPreset"
                    :pickup-preset-window="pickupPresetWindow"
                    :pickup-start-time="pickupStartTime"
                    :pickup-summary="pickupSummary"
                    :pickup-time-options="pickupTimeOptions"
                    :pickup-today="pickupToday"
                    :pickup-tomorrow="pickupTomorrow"
                    :show-pickup-calendar="showPickupCalendar"
                    @select-pickup-day="selectPickupDay"
                    @select-pickup-preset="selectPickupPreset"
                    @update:showPickupCalendar="showPickupCalendar = $event"
                    @update:pickupPreset="pickupPreset = $event"
                    @update:pickupStartTime="pickupStartTime = $event"
                    @update:pickupEndTime="pickupEndTime = $event"
                  />

                  <p class="small text-muted mb-0 mt-2">
                    Neighbours can request this window or propose another
                    time before expiry.
                  </p>

                  <!-- Address -->
                  <PickupAddressPicker
                    :address-error="addressError"
                    :address-loading="addressLoading"
                    :address-page="addressPage"
                    :address-query="addressQuery"
                    :address-results="addressResults"
                    :address-total-pages="addressTotalPages"
                    :editing="editing"
                    :geolocating="geolocating"
                    :locked="locked"
                    :saved-location-error="savedLocationError"
                    :saved-location-loading="savedLocationLoading"
                    :selected-address="selectedAddress"
                    :using-saved-location="usingSavedLocation"
                    @use-my-location="useMyLocation"
                    @search-pickup-addresses="searchPickupAddresses"
                    @choose-pickup-address="choosePickupAddress"
                    @update:addressQuery="addressQuery = $event"
                  />

                  <!-- Instructions -->
                  <label class="form-label mt-3" for="pickup-instructions">
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
          </template>
        </fieldset>

        <!-- Footer -->
        <footer
          class="editor-footer d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 pt-3 pb-2"
        >
          <p v-if="showListingDetails" class="small text-muted mb-0">
            {{ saving ? savePhase : '* Required fields' }}
          </p>

          <div class="d-flex flex-wrap gap-2 ms-auto">
            <button
              type="button"
              class="btn btn-outline-dark editor-button rescue-button"
              :disabled="saving"
              @click="close"
            >
              {{ persisted ? 'Close' : 'Cancel' }}
            </button>

            <button
              v-if="showListingDetails && !persisted && !uncertainCreate"
              type="submit"
              class="btn btn-primary editor-button rescue-button"
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
