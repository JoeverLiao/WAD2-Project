<script setup>
import { computed, ref, watch } from 'vue'
import PickupSchedule from './PickupSchedule.vue'
import { toLocalInput } from '@/services/rescueForm.js'

const props = defineProps({
  requestError: { type: String, default: '' },
  requestItem: { type: Object, default: null },
  requestSaved: { type: Boolean, default: false },
  requestedEnd: { type: String, required: true },
  requestedStart: { type: String, required: true },
  sending: { type: Boolean, default: false },
  uncertainRequest: { type: Boolean, default: false },
  // Accepted for compatibility with the existing RescueMap component.
  requestMessage: { type: String, default: '' },
  timezone: { type: String, default: '' },
})

const emit = defineEmits([
  'submit-request',
  'close-request',
  'view-sent',
  'update:requestedStart',
  'update:requestedEnd',
  'update:requestMessage',
])

const pickupDay = ref('')
const pickupPreset = ref('custom')
const showPickupCalendar = ref(false)
const localError = ref('')

const locked = computed(() => props.sending || props.requestSaved || props.uncertainRequest)

// All day/time buttons use Singapore time. The parent's datetime strings stay
// in device-local time because its existing submission code expects that format.
function singaporeParts(value) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = {}
  for (const part of parts) values[part.type] = part.value

  return {
    day: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

const pickupToday = computed(() => singaporeParts(Date.now()).day)
const pickupTomorrow = computed(() => {
  const today = pickupToday.value
  return singaporeParts(Date.parse(`${today}T12:00:00+08:00`) + 86400000).day
})

const expiryDay = computed(() => singaporeParts(props.requestItem?.expiresAt)?.day || '')
const scheduleForm = computed(() => ({ expiresAt: expiryDay.value }))
const pickupDaySelected = computed(() => Boolean(pickupDay.value))

const pickupTimeOptions = [
  { id: 'morning', label: 'Morning', timeLabel: '9 am–12 pm', start: '09:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', timeLabel: '12–5 pm', start: '12:00', end: '17:00' },
  { id: 'evening', label: 'Evening', timeLabel: '5–9 pm', start: '17:00', end: '21:00' },
]

function formatDate(value) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return 'Not set'

  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const ownerWindow = computed(() => {
  if (!props.requestItem) return ''
  return `${formatDate(props.requestItem.pickupStart)} – ${formatDate(props.requestItem.pickupEnd)}`
})

const expiryLabel = computed(() => formatDate(props.requestItem?.expiresAt))

function windowError() {
  const start = Date.parse(props.requestedStart)
  const end = Date.parse(props.requestedEnd)
  const expiry = Date.parse(props.requestItem?.expiresAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Choose both pickup times.'
  if (end <= start) return 'Pickup must end after it starts.'
  if (end <= Date.now()) return 'Choose a pickup window that has not ended.'
  if (!Number.isFinite(expiry) || end > expiry) return 'Pickup must finish before the food expires.'
  return ''
}

const pickupSummary = computed(() => {
  if (windowError()) return ''
  return `${formatDate(props.requestedStart)} – ${formatDate(props.requestedEnd)}`
})

function pickupDayAllowed(day) {
  return Boolean(day && day >= pickupToday.value && expiryDay.value && day <= expiryDay.value)
}

function emitTime(field, day, time) {
  let value = ''
  if (day && time) {
    const timestamp = Date.parse(`${day}T${time}:00+08:00`)
    if (Number.isFinite(timestamp)) value = toLocalInput(timestamp)
  }
  emit(`update:${field}`, value)
  localError.value = ''
}

const pickupStartTime = computed({
  get() {
    return singaporeParts(props.requestedStart)?.time || ''
  },
  set(time) {
    emitTime('requestedStart', pickupDay.value, time)
  },
})

const pickupEndTime = computed({
  get() {
    return singaporeParts(props.requestedEnd)?.time || ''
  },
  set(time) {
    emitTime('requestedEnd', pickupDay.value, time)
  },
})

// End presets at expiry when it falls inside the selected period.
// Ongoing periods start at the next quarter-hour, just like the listing picker.
function pickupPresetWindow(option) {
  if (!pickupDayAllowed(pickupDay.value)) return null

  const nextSlot = (Math.floor(Date.now() / 900000) + 1) * 900000
  const start = Math.max(Date.parse(`${pickupDay.value}T${option.start}:00+08:00`), nextSlot)
  const end = Math.min(
    Date.parse(`${pickupDay.value}T${option.end}:00+08:00`),
    Date.parse(props.requestItem.expiresAt),
  )
  // Inputs have minute precision; never round an expiry time upwards.
  const roundedEnd = Math.floor(end / 60000) * 60000
  if (start >= roundedEnd) return null

  return { start: toLocalInput(start), end: toLocalInput(roundedEnd) }
}

function selectPickupPreset(option) {
  if (locked.value) return
  const window = pickupPresetWindow(option)
  if (!window) return

  pickupPreset.value = option.id
  emit('update:requestedStart', window.start)
  emit('update:requestedEnd', window.end)
  localError.value = ''
}

function selectPickupDay(day) {
  if (locked.value || !pickupDayAllowed(day)) return

  const start = pickupStartTime.value
  const end = pickupEndTime.value
  pickupDay.value = day
  localError.value = ''

  const option = pickupTimeOptions.find((item) => item.id === pickupPreset.value)
  if (option && pickupPresetWindow(option)) {
    selectPickupPreset(option)
    return
  }

  pickupPreset.value = 'custom'
  emitTime('requestedStart', day, start)
  emitTime('requestedEnd', day, end)
}

function useOwnerWindow() {
  if (locked.value || !props.requestItem) return
  const start = Math.max(
    Date.parse(props.requestItem.pickupStart),
    Math.ceil((Date.now() + 60000) / 60000) * 60000,
  )
  const end = Date.parse(props.requestItem.pickupEnd)
  if (start >= end) {
    localError.value = 'The suggested window has ended. Choose another time before expiry.'
    return
  }

  pickupDay.value = singaporeParts(start).day
  pickupPreset.value = 'custom'
  showPickupCalendar.value = ![pickupToday.value, pickupTomorrow.value].includes(pickupDay.value)
  emit('update:requestedStart', toLocalInput(start))
  emit('update:requestedEnd', toLocalInput(end))
  localError.value = ''
}

// The dialog stays mounted between requests. Reset picker state for each listing.
watch(() => props.requestItem, () => {
  pickupDay.value = singaporeParts(props.requestedStart)?.day || ''
  pickupPreset.value = 'custom'
  showPickupCalendar.value = Boolean(
    pickupDay.value && ![pickupToday.value, pickupTomorrow.value].includes(pickupDay.value),
  )
  localError.value = ''
}, { immediate: true })

function submitRequest() {
  if (locked.value) return
  localError.value = windowError()
  if (localError.value) return

  // Keep the existing API contract, but send an empty message.
  emit('update:requestMessage', '')
  emit('submit-request')
}
</script>

<template>
  <form class="d-flex flex-column gap-3" @submit.prevent="submitRequest">
    <header>
      <p class="small text-uppercase text-muted mb-1">Request collection</p>
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 id="request-dialog-title" class="mb-0">{{ requestItem?.title }}</h3>
        <span class="badge rounded-pill text-bg-dark fs-6 px-3 py-2">
          {{ requestItem?.quantity }} {{ requestItem?.unit }}
        </span>
      </div>
      <p class="small text-muted mt-2 mb-0">You’ll collect the whole listing.</p>
    </header>

    <section v-if="requestItem" class="border rounded-3 bg-body-tertiary p-3" aria-label="Collection details">
      <p class="small text-uppercase text-muted mb-1">Meeting point</p>
      <p class="fw-bold mb-1">{{ requestItem.pickupLabel }}</p>
      <p v-if="requestItem.pickupInstructions" class="small mb-3">{{ requestItem.pickupInstructions }}</p>

      <div class="border-start border-3 border-dark ps-3 mt-3">
        <p class="small text-muted mb-1">{{ requestItem.user?.name || 'Owner' }}’s suggested pickup</p>
        <p class="fw-bold mb-1">{{ ownerWindow }}</p>
        <button type="button" class="btn btn-link rescue-text-button p-0 small" :disabled="locked" @click="useOwnerWindow">
          Use this window
        </button>
      </div>

      <p class="small mt-3 mb-0"><strong>Use by:</strong> {{ expiryLabel }} · Singapore time</p>
    </section>

    <div v-if="requestError || localError" class="alert alert-danger mb-0" role="alert">
      {{ requestError || localError }}
    </div>
    <div v-if="requestSaved" class="alert alert-success mb-0" role="status">
      <strong>Request sent.</strong> Wait for the owner to accept before collecting.
    </div>

    <PickupSchedule
      :form="scheduleForm"
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
      summary-class="border border-dark bg-body-tertiary"
      id-prefix="rescue-request"
      hint="Singapore time. Choose the suggested window or propose another time before expiry."
      @select-pickup-day="selectPickupDay"
      @select-pickup-preset="selectPickupPreset"
      @update:showPickupCalendar="showPickupCalendar = $event"
      @update:pickupPreset="pickupPreset = $event"
      @update:pickupStartTime="pickupStartTime = $event"
      @update:pickupEndTime="pickupEndTime = $event"
    />

    <div class="d-flex flex-wrap justify-content-end gap-2 pt-2 border-top">
      <button type="button" class="btn btn-outline-dark rescue-button" :disabled="sending" @click="emit('close-request', $event)">
        {{ requestSaved ? 'Done' : 'Cancel' }}
      </button>
      <button v-if="requestSaved || uncertainRequest" type="button" class="btn btn-primary rescue-button" :disabled="sending" @click="emit('view-sent', requestItem)">
        Open Sent →
      </button>
      <button v-else type="submit" class="btn btn-primary rescue-button" :disabled="sending || !requestItem">
        {{ sending ? 'Sending…' : 'Send request' }}
      </button>
    </div>
  </form>
</template>
