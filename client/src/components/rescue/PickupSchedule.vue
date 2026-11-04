<script setup>
import { computed } from 'vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  summaryClass: { type: String, default: '' },
  idPrefix: { type: String, default: 'pickup' },
  hint: { type: String, default: 'Singapore time. Neighbours can request this window or suggest another.' },
  form: { type: Object, required: true },
  locked: { type: Boolean, required: true },
  pickupDay: { type: String, required: true },
  pickupDayAllowed: { type: Function, required: true },
  pickupDaySelected: { type: Boolean, required: true },
  pickupEndTime: { type: String, required: true },
  pickupPreset: { type: String, required: true },
  pickupPresetWindow: { type: Function, required: true },
  pickupStartTime: { type: String, required: true },
  pickupSummary: { type: String, required: true },
  pickupTimeOptions: { type: Array, required: true },
  pickupToday: { type: String, required: true },
  pickupTomorrow: { type: String, required: true },
  showPickupCalendar: { type: Boolean, required: true },
})

const emit = defineEmits([
  'select-pickup-day',
  'select-pickup-preset',
  'update:showPickupCalendar',
  'update:pickupPreset',
  'update:pickupStartTime',
  'update:pickupEndTime',
])

const showPickupCalendar = computed({
  get() {
    return props.showPickupCalendar
  },
  set(value) {
    emit('update:showPickupCalendar', value)
  },
})

const pickupPreset = computed({
  get() {
    return props.pickupPreset
  },
  set(value) {
    emit('update:pickupPreset', value)
  },
})

const pickupStartTime = computed({
  get() {
    return props.pickupStartTime
  },
  set(value) {
    emit('update:pickupStartTime', value)
  },
})

const pickupEndTime = computed({
  get() {
    return props.pickupEndTime
  },
  set(value) {
    emit('update:pickupEndTime', value)
  },
})

function selectPickupDay(day) {
  emit('select-pickup-day', day)
}

function selectPickupPreset(option) {
  emit('select-pickup-preset', option)
}
</script>

<template>
  <fieldset :disabled="locked" class="border-0 p-0 m-0">
    <!-- First: choose a day -->
    <legend class="fs-6 fw-bold mb-2">Pickup day *</legend>

    <div class="d-flex flex-wrap gap-2">
      <button
        type="button"
        class="btn editor-button rescue-button"
        :class="
        pickupDaySelected && pickupDay === pickupToday
        ? 'btn-dark'
        : 'btn-outline-dark'
        "
        :aria-pressed="
        pickupDaySelected && pickupDay === pickupToday
        "
        :disabled="!pickupDayAllowed(pickupToday)"
        @click="selectPickupDay(pickupToday)"
      >
        Today
      </button>

      <button
        v-if="pickupDayAllowed(pickupTomorrow)"
        type="button"
        class="btn editor-button rescue-button"
        :class="
        pickupDaySelected && pickupDay === pickupTomorrow
        ? 'btn-dark'
        : 'btn-outline-dark'
        "
        :aria-pressed="
        pickupDaySelected && pickupDay === pickupTomorrow
        "
        @click="selectPickupDay(pickupTomorrow)"
      >
        Tomorrow
      </button>

      <button
        type="button"
        class="btn btn-outline-dark editor-button rescue-button"
        :aria-expanded="showPickupCalendar"
        @click="showPickupCalendar = !showPickupCalendar"
      >
        Choose date
      </button>
    </div>

    <div v-if="showPickupCalendar" class="mt-2">
      <label :for="`${idPrefix}-day`" class="visually-hidden">
        Pickup date
      </label>

      <input
        :id="`${idPrefix}-day`"
        :value="pickupDaySelected ? pickupDay : ''"
        class="form-control"
        type="date"
        :min="pickupToday"
        :max="form.expiresAt ? form.expiresAt.slice(0, 10) : undefined"
        @change="selectPickupDay($event.target.value)"
      />
    </div>

    <!-- Second: time options appear after selecting a day -->
    <div v-if="pickupDaySelected" class="mt-3">
      <p class="fw-bold mb-2">Pickup time *</p>

      <div class="row g-2">
        <div
          v-for="option in pickupTimeOptions"
          :key="option.id"
          class="col-12 col-sm-4"
        >
          <button
            type="button"
            class="btn editor-button w-100 h-100 py-2 rescue-button"
            :class="
            pickupPreset === option.id
            ? 'btn-dark'
            : 'btn-outline-dark'
            "
            :disabled="!pickupPresetWindow(option)"
            :aria-pressed="pickupPreset === option.id"
            @click="selectPickupPreset(option)"
          >
            <span class="d-block fw-bold">
              {{ option.label }}
            </span>

            <small class="d-block">
              {{ option.timeLabel }}
            </small>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-link editor-link p-0 mt-2 rescue-text-button"
        :aria-expanded="pickupPreset === 'custom'"
        @click="pickupPreset = pickupPreset === 'custom' ? '' : 'custom'"
      >
        {{
        pickupPreset === 'custom'
        ? 'Hide custom times'
        : 'Choose my own times'
        }}
      </button>

      <!-- Third: custom inputs appear only when requested -->
      <div
        v-if="pickupPreset === 'custom'"
        class="row g-2 mt-1"
      >
        <div class="col-6">
          <label :for="`${idPrefix}-start-time`" class="form-label">
            From *
          </label>

          <input
            :id="`${idPrefix}-start-time`"
            v-model="pickupStartTime"
            class="form-control"
            type="time"
            required
          />
        </div>

        <div class="col-6">
          <label :for="`${idPrefix}-end-time`" class="form-label">
            Until *
          </label>

          <input
            :id="`${idPrefix}-end-time`"
            v-model="pickupEndTime"
            class="form-control"
            type="time"
            :min="pickupStartTime || undefined"
            required
          />
        </div>
      </div>
    </div>

    <!-- Confirmation appears once both times are set -->
    <div
      v-if="pickupDaySelected && pickupSummary"
      class="linked-note rounded-3 p-3 mt-3"
      :class="summaryClass"
      role="status"
    >
      <strong class="d-block">Your pickup window</strong>

      <p class="mb-0 mt-1">
        {{ pickupSummary }}
      </p>
    </div>

    <p class="small text-muted mb-0 mt-2">
      {{ hint }}
    </p>
  </fieldset>
</template>
