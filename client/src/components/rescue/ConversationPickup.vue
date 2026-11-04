<script setup>
import { computed } from 'vue'
import { dateTimeLabel } from '@/services/rescueConversations.js'
import { windowLabel } from '@/services/rescueConversations.js'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  activeTab: { type: String, required: true },
  busy: { type: Boolean, required: true },
  canAccept: { type: Boolean, required: true },
  isProposalOpen: { type: Boolean, required: true },
  ownProposal: { type: Boolean, default: false },
  proposal: { type: Object, default: null },
  proposalEnd: { type: String, required: true },
  proposalStart: { type: String, required: true },
  selectedRaw: { type: Object, default: null },
  selectedRequest: { type: Object, default: null },
  statusLabel: { type: String, required: true },
  timeNegotiable: { type: Boolean, required: true },
})

const emit = defineEmits([
  'respond-proposal',
  'update-status',
  'suggest-time',
  'submit-proposal',
  'open-collection-confirmation',
  'update:isProposalOpen',
  'update:proposalStart',
  'update:proposalEnd',
])

const isProposalOpen = computed({
  get() {
    return props.isProposalOpen
  },
  set(value) {
    emit('update:isProposalOpen', value)
  },
})

const proposalStart = computed({
  get() {
    return props.proposalStart
  },
  set(value) {
    emit('update:proposalStart', value)
  },
})

const proposalEnd = computed({
  get() {
    return props.proposalEnd
  },
  set(value) {
    emit('update:proposalEnd', value)
  },
})

function respondProposal(action) {
  emit('respond-proposal', action)
}

function updateStatus(status) {
  emit('update-status', status)
}

function suggestTime() {
  emit('suggest-time')
}

function submitProposal() {
  emit('submit-proposal')
}

function openCollectionConfirmation() {
  emit('open-collection-confirmation')
}
</script>

<template>
  <div
    class="pickup-proposal d-flex flex-column gap-3 p-3"
  >
    <div
      class="d-flex flex-wrap align-items-center justify-content-between gap-3"
    >
      <div>
        <p class="pickup-label muted mb-1 text-muted">
          {{
          activeTab === 'received'
          ? 'Requested pickup'
          : 'Your requested pickup'
          }}
        </p>

        <h4>{{ selectedRequest.requestedPickup }}</h4>
      </div>

      <span
        class="pickup-status px-3 py-1 rounded"
        :class="{
        changed:
        selectedRequest.differentTime &&
        selectedRequest.status === 'pending' &&
        !selectedRequest.past,
        }"
        role="status"
      >
        {{ statusLabel }}
      </span>
    </div>

    <!-- Existing time proposal -->
    <div v-if="proposal" class="time-change-note p-3">
      <p>
        <strong>
          {{
          ownProposal
          ? 'Your proposed time'
          : 'New time suggested'
          }}
        </strong>
      </p>

      <p class="mt-1">
        {{
        windowLabel(
        proposal.pickupStart,
        proposal.pickupEnd,
        )
        }}
      </p>

      <p class="muted mt-1 text-muted">
        A time agreement does not reserve the food.
      </p>

      <div
        v-if="!selectedRequest.past"
        class="d-flex flex-column flex-sm-row flex-wrap gap-2 mt-2"
      >
        <button
          v-if="ownProposal"
          type="button"
          class="action-button secondary btn rescue-button btn-outline-dark"
          :disabled="busy"
          @click="respondProposal('withdraw')"
        >
          Withdraw suggestion
        </button>

        <template v-else>
          <button
            type="button"
            class="action-button btn rescue-button btn-primary"
            :disabled="busy || !timeNegotiable"
            @click="respondProposal('accept')"
          >
            Agree to this time
          </button>

          <button
            type="button"
            class="action-button secondary btn rescue-button btn-outline-dark"
            :disabled="busy || !timeNegotiable"
            @click="respondProposal('decline')"
          >
            Keep previous time
          </button>
        </template>
      </div>
    </div>

    <!-- Pending actions -->
    <template
      v-if="
      selectedRequest.status === 'pending' &&
      !selectedRequest.past
      "
    >
      <div
        class="d-flex flex-column flex-sm-row flex-wrap gap-2"
      >
        <button
          v-if="activeTab === 'received'"
          type="button"
          class="action-button btn rescue-button btn-primary"
          :disabled="busy || !canAccept"
          @click="updateStatus('accepted')"
        >
          Accept pickup
        </button>

        <button
          v-if="!proposal"
          type="button"
          class="action-button secondary btn rescue-button btn-outline-dark"
          :disabled="busy || !timeNegotiable"
          @click="suggestTime"
        >
          Suggest another time
        </button>
      </div>

      <p
        v-if="selectedRaw.listing?.status === 'claimed'"
        class="muted text-muted"
      >
        Another request currently reserves this listing.
      </p>

      <!-- Suggest a time -->
      <form
        v-if="isProposalOpen && !proposal"
        class="pickup-time-form"
        @submit.prevent="submitProposal"
      >
        <div class="row g-2">
          <div class="col-12 col-sm-6">
            <label
              for="proposal-start"
              class="form-label"
            >
              From
            </label>

            <input
              id="proposal-start"
              v-model="proposalStart"
              class="form-control"
              type="datetime-local"
              :disabled="busy"
              required
            />
          </div>

          <div class="col-12 col-sm-6">
            <label
              for="proposal-end"
              class="form-label"
            >
              Until
            </label>

            <input
              id="proposal-end"
              v-model="proposalEnd"
              class="form-control"
              type="datetime-local"
              :disabled="busy"
              required
            />
          </div>
        </div>

        <p class="muted mt-2 text-muted">
          Use your device's local time. The window
          must end by
          {{
          dateTimeLabel(
          selectedRaw.listing?.expiresAt,
          )
          }}.
        </p>

        <div
          class="d-flex flex-column flex-sm-row flex-wrap gap-2 mt-2"
        >
          <button
            class="action-button btn rescue-button btn-primary"
            type="submit"
            :disabled="busy"
          >
            Send time suggestion
          </button>

          <button
            class="action-button secondary btn rescue-button btn-outline-dark"
            type="button"
            :disabled="busy"
            @click="isProposalOpen = false"
          >
            Cancel
          </button>
        </div>
      </form>

      <button
        type="button"
        class="text-button align-self-start btn btn-link rescue-text-button p-0"
        :disabled="busy"
        @click="
        updateStatus(
        activeTab === 'received'
        ? 'declined'
        : 'cancelled',
        )
        "
      >
        {{
        activeTab === 'received'
        ? 'Decline request'
        : 'Cancel request'
        }}
      </button>
    </template>

    <!-- Accepted actions, including past pickup windows -->
    <div
      v-if="selectedRequest.status === 'accepted'"
      class="d-flex flex-column flex-sm-row flex-wrap gap-2"
    >
      <button
        v-if="activeTab === 'received'"
        type="button"
        class="action-button btn rescue-button btn-primary"
        :disabled="busy"
        @click="openCollectionConfirmation"
      >
        Confirm collection
      </button>

      <button
        type="button"
        class="action-button secondary btn rescue-button btn-outline-dark"
        :disabled="busy"
        @click="updateStatus('cancelled')"
      >
        Cancel pickup
      </button>
    </div>
  </div>
</template>
