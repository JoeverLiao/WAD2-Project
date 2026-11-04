<script setup>
import { computed } from 'vue'
import { dateTimeLabel } from '@/services/rescueConversations.js'
import { toLocalInput } from '@/services/rescueForm.js'
import { windowLabel } from '@/services/rescueConversations.js'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  requestError: { type: String, required: true },
  requestItem: { type: Object, default: null },
  requestMessage: { type: String, required: true },
  requestSaved: { type: Boolean, required: true },
  requestedEnd: { type: String, required: true },
  requestedStart: { type: String, required: true },
  sending: { type: Boolean, required: true },
  timezone: { type: String, required: true },
  uncertainRequest: { type: Boolean, required: true },
})

const emit = defineEmits([
  'submit-request',
  'close-request',
  'view-sent',
  'update:requestedStart',
  'update:requestedEnd',
  'update:requestMessage',
])

const requestedStart = computed({
  get() {
    return props.requestedStart
  },
  set(value) {
    emit('update:requestedStart', value)
  },
})

const requestedEnd = computed({
  get() {
    return props.requestedEnd
  },
  set(value) {
    emit('update:requestedEnd', value)
  },
})

const requestMessage = computed({
  get() {
    return props.requestMessage
  },
  set(value) {
    emit('update:requestMessage', value)
  },
})

function submitRequest() {
  emit('submit-request')
}

function closeRequest(event) {
  emit('close-request', event)
}

function viewSent(item) {
  emit('view-sent', item)
}
</script>

<template>
  <form @submit.prevent="submitRequest">
    <h3 id="request-dialog-title">
      Request {{ requestItem?.title }}
    </h3>

    <p class="muted text-muted">
      {{ requestItem?.quantity }}
      {{ requestItem?.unit }}
      · Collect the whole listing.
    </p>

    <p class="muted text-muted">
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
      class="muted text-muted"
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

          <input class="form-control"
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

          <input class="form-control"
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

      <textarea class="form-control"
        id="rescue-request-message"
        v-model="requestMessage"
        maxlength="1000"
        placeholder="Say hello or explain your suggested time…"
        rows="3"
      ></textarea>
    </fieldset>

    <div class="dialog-actions d-flex flex-wrap justify-content-end">
      <button
        type="button"
        class="secondary-button btn rescue-button btn-outline-dark"
        :disabled="sending"
        @click="closeRequest"
      >
        {{ requestSaved ? 'Done' : 'Cancel' }}
      </button>

      <button
        v-if="requestSaved || uncertainRequest"
        type="button"
        class="primary-button btn rescue-button btn-primary"
        :disabled="sending"
        @click="viewSent(requestItem)"
      >
        Open Sent →
      </button>

      <button
        v-else
        type="submit"
        class="primary-button btn rescue-button btn-primary"
        :disabled="sending"
      >
        {{ sending ? 'Sending…' : 'Send request' }}
      </button>
    </div>
  </form>
</template>
