<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import FoodIcon from '../FoodIcon.vue'
import { useInventoryStore } from '@/stores/inventory.js'
import { allPages, api, apiError, isCancelled } from '@/services/rescueApi.js'
import { toLocalInput, toISO } from '@/services/rescueForm.js'
import { lockBodyScroll } from '@/services/rescueModal.js'
import {
  entityId,
  groupRequests,
  dateTimeLabel,
  windowLabel,
  makeClientKey,
} from '@/services/rescueConversations.js'

// Props, events and store

const props = defineProps({
  activeSection: { type: String, default: null },
  initialListingId: { type: String, default: null },
})

const emit = defineEmits(['close', 'changed'])
const inventory = useInventoryStore()

// Element references

const dialog = ref(null)
const collectionDialog = ref(null)
const messageList = ref(null)
const replyInput = ref(null)

// Conversation state

const received = ref([])
const sent = ref([])
const activeTab = ref('received')
const search = ref('')

const expandedIds = ref([])
const selectedGroupId = ref(null)
const selectedRequestId = ref(null)

const reply = ref('')
const chatMessages = ref([])
const legacyInitial = ref(null)

const loading = ref(false)
const messagesLoading = ref(false)
const busy = ref(false)

const inboxError = ref('')
const messageError = ref('')
const actionError = ref('')
const notice = ref('')

const isProposalOpen = ref(false)
const proposalStart = ref('')
const proposalEnd = ref('')

const failedImages = ref(new Set())

// Computed conversation data

const open = computed(() =>
  ['received', 'sent'].includes(props.activeSection),
)

const itemGroups = computed(() => [
  ...groupRequests(received.value, 'received'),
  ...groupRequests(sent.value, 'sent'),
])

const visibleGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  return itemGroups.value
    .filter((group) => group.direction === activeTab.value)
    .map((group) => ({
      ...group,
      requests: group.food.toLowerCase().includes(query)
        ? group.requests
        : group.requests.filter((request) =>
            request.person.toLowerCase().includes(query),
          ),
    }))
    .filter((group) => group.requests.length)
})

const selectedGroup = computed(
  () =>
    visibleGroups.value.find(
      (group) => group.id === selectedGroupId.value,
    ) || visibleGroups.value[0],
)

const selectedBase = computed(
  () =>
    selectedGroup.value?.requests.find(
      (request) => request.id === selectedRequestId.value,
    ) || selectedGroup.value?.requests[0],
)

const selectedRaw = computed(() => selectedBase.value?.raw)

const currentUserId = computed(() =>
  entityId(
    activeTab.value === 'received'
      ? selectedRaw.value?.owner
      : selectedRaw.value?.requester,
  ),
)

const selectedRequest = computed(() =>
  selectedBase.value
    ? {
        ...selectedBase.value,
        messages: [
          ...(legacyInitial.value ? [legacyInitial.value] : []),
          ...chatMessages.value,
        ]
          .sort(
            (a, b) =>
              Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
              String(a._id).localeCompare(String(b._id)),
          )
          .map((message) => ({
            id: message._id,
            text: message.text,
            own: entityId(message.sender) === currentUserId.value,
            author:
              entityId(message.sender) === currentUserId.value
                ? 'You'
                : selectedBase.value.person,
            time: dateTimeLabel(message.createdAt),
          })),
      }
    : null,
)

const statusLabel = computed(() => {
  const request = selectedRequest.value

  if (!request) return ''

  return (
    {
      accepted: 'Pickup confirmed',
      completed: 'Collected',
      declined: 'Request declined',
      cancelled: 'Request cancelled',
    }[request.status] ||
    (request.raw.pickupProposal
      ? 'Time change awaiting agreement'
      : activeTab.value === 'sent'
        ? 'Awaiting reply'
        : request.differentTime
          ? 'Different time'
          : 'Fits your time')
  )
})

const proposal = computed(() => selectedRaw.value?.pickupProposal)

const ownProposal = computed(
  () =>
    proposal.value &&
    entityId(proposal.value.proposedBy) === currentUserId.value,
)

const chatWritable = computed(() =>
  ['pending', 'accepted'].includes(selectedRaw.value?.status),
)

const timeNegotiable = computed(
  () =>
    selectedRaw.value?.status === 'pending' &&
    selectedRaw.value?.listing?.status === 'available' &&
    Date.parse(selectedRaw.value?.listing?.expiresAt) > Date.now() &&
    Date.parse(selectedRaw.value?.listing?.pickupEnd) > Date.now(),
)

const canAccept = computed(
  () =>
    activeTab.value === 'received' &&
    timeNegotiable.value &&
    !proposal.value &&
    Date.parse(selectedRaw.value?.pickupEnd) > Date.now(),
)

// Request controllers and lifecycle state

let alive = true
let inboxController
let messageController
let pollTimer
let releaseScroll
let previousFocus

let inboxSequence = 0
let pendingSend = null
let pendingProposalKey = null
let pollInProgress = false

// Conversation navigation

function countRequests(direction) {
  return direction === 'received'
    ? received.value.length
    : sent.value.length
}

function groupSummary(group) {
  const pending = group.requests.filter(
    (request) => request.status === 'pending',
  ).length

  return `${group.requests.length} ${
    group.requests.length === 1 ? 'request' : 'requests'
  }${
    pending
      ? ` · ${pending} awaiting ${
          activeTab.value === 'received' ? 'your ' : ''
        }reply`
      : ''
  }`
}

function close() {
  if (!busy.value) {
    emit('close')
  }
}

function chooseInitial() {
  const target =
    visibleGroups.value.find(
      (group) => group.id === props.initialListingId,
    ) || visibleGroups.value[0]

  if (target) {
    selectedGroupId.value = target.id
    selectedRequestId.value = target.requests[0]?.id
    expandedIds.value = [target.id]
  }
}

function switchTab(value) {
  if (busy.value) return

  activeTab.value = value
  search.value = ''
  reply.value = ''
  isProposalOpen.value = false

  pendingSend = null
  pendingProposalKey = null

  chooseInitial()
}

function selectRequest(group, request) {
  if (busy.value) return

  selectedGroupId.value = group.id
  selectedRequestId.value = request.id

  reply.value = ''
  actionError.value = ''
  notice.value = ''
  isProposalOpen.value = false

  pendingSend = null
  pendingProposalKey = null
}

function toggleGroup(group) {
  if (busy.value) return

  if (expandedIds.value.includes(group.id)) {
    expandedIds.value = expandedIds.value.filter(
      (id) => id !== group.id,
    )
  } else {
    expandedIds.value.push(group.id)
    selectRequest(group, group.requests[0])
  }
}

// Load requests and messages

async function loadInbox({ silent = false, focus = false } = {}) {
  inboxController?.abort()

  const controller = new AbortController()
  inboxController = controller

  const sequence = ++inboxSequence

  if (!silent) {
    loading.value = true
  }

  try {
    const [incoming, outgoing] = await Promise.all([
      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'received' },
        controller.signal,
      ),
      allPages(
        '/rescue/requests',
        'requests',
        { direction: 'sent' },
        controller.signal,
      ),
    ])

    if (
      !alive ||
      !open.value ||
      controller.signal.aborted ||
      sequence !== inboxSequence
    ) {
      return
    }

    received.value = incoming
    sent.value = outgoing
    inboxError.value = ''

    if (focus) {
      chooseInitial()
    }
  } catch (error) {
    if (
      alive &&
      open.value &&
      !controller.signal.aborted &&
      !isCancelled(error)
    ) {
      inboxError.value = apiError(error)
    }
  } finally {
    if (alive && sequence === inboxSequence) {
      loading.value = false
    }
  }
}

async function loadMessages({ silent = false } = {}) {
  const requestId = selectedBase.value?.id

  if (!requestId) {
    chatMessages.value = []
    legacyInitial.value = null
    return
  }

  messageController?.abort()

  const controller = new AbortController()
  messageController = controller

  if (!silent) {
    messagesLoading.value = true
  }

  const nearBottom =
    !messageList.value ||
    messageList.value.scrollHeight -
      messageList.value.scrollTop -
      messageList.value.clientHeight <
      80

  try {
    const records = new Map()

    let after = null
    let hasMore = true
    let initial = null

    while (hasMore) {
      const { data } = await api.get(
        `/rescue/requests/${requestId}/messages`,
        {
          params: {
            limit: 100,
            ...(after ? { after } : {}),
          },
          signal: controller.signal,
        },
      )

      if (!Array.isArray(data.messages)) {
        throw new Error(
          'Unexpected message response. Copy the updated backend files first.',
        )
      }

      for (const message of data.messages) {
        records.set(message._id, message)
      }

      initial = data.initialMessage
      hasMore = data.hasMore

      if (
        hasMore &&
        (!data.nextCursor || data.nextCursor === after)
      ) {
        throw new Error('Invalid message cursor.')
      }

      after = data.nextCursor
    }

    if (
      !alive ||
      !open.value ||
      controller.signal.aborted ||
      selectedBase.value?.id !== requestId
    ) {
      return
    }

    chatMessages.value = [...records.values()]
    legacyInitial.value = initial
    messageError.value = ''

    if (!silent || nearBottom) {
      await nextTick()

      if (messageList.value) {
        messageList.value.scrollTop =
          messageList.value.scrollHeight
      }
    }
  } catch (error) {
    if (
      alive &&
      open.value &&
      !controller.signal.aborted &&
      !isCancelled(error)
    ) {
      messageError.value = apiError(error)
    }
  } finally {
    if (alive && messageController === controller) {
      messagesLoading.value = false
    }
  }
}

async function refresh() {
  await loadInbox()
  await loadMessages()
}

// Shared action handling

async function runAction(callback, success) {
  if (busy.value || !selectedRaw.value) return

  const requestId = selectedBase.value.id

  busy.value = true
  actionError.value = ''
  notice.value = ''

  try {
    const result = await callback(requestId)

    notice.value = result || success

    emit('changed')

    await loadInbox({ silent: true })
    await loadMessages({ silent: true })
  } catch (error) {
    actionError.value = apiError(error)
    await loadInbox({ silent: true })
  } finally {
    busy.value = false
  }
}

async function updateStatus(status) {
  const action = {
    accepted: 'accept',
    declined: 'decline',
    cancelled: 'cancel',
  }[status]

  if (!action) return

  await runAction(
    async (id) => {
      await api.post(`/rescue/requests/${id}/${action}`)
    },
    {
      accepted: 'Pickup confirmed.',
      declined: 'Request declined.',
      cancelled: 'Request cancelled. Any reservation was released.',
    }[status],
  )
}

// Send messages

async function sendMessage() {
  const text = reply.value.trim()
  const requestId = selectedBase.value?.id

  if (
    !text ||
    text.length > 1000 ||
    busy.value ||
    !chatWritable.value
  ) {
    return
  }

  if (
    !pendingSend ||
    pendingSend.requestId !== requestId ||
    pendingSend.text !== text
  ) {
    pendingSend = {
      requestId,
      text,
      clientMessageId: makeClientKey(),
    }
  }

  const payload = {
    text,
    clientMessageId: pendingSend.clientMessageId,
  }

  busy.value = true
  actionError.value = ''

  try {
    await api.post(
      `/rescue/requests/${requestId}/messages`,
      payload,
    )

    reply.value = ''
    pendingSend = null

    await loadMessages({ silent: false })
  } catch (error) {
    actionError.value = `${apiError(error)} Your reply is kept. Retrying the same reply will not send it twice.`
  } finally {
    busy.value = false

    await nextTick()
    replyInput.value?.focus()
  }
}

// Pickup time proposals

function suggestTime() {
  if (!timeNegotiable.value || busy.value) return

  isProposalOpen.value = true
  proposalStart.value = toLocalInput(selectedRaw.value.pickupStart)
  proposalEnd.value = toLocalInput(selectedRaw.value.pickupEnd)
  actionError.value = ''

  pendingProposalKey = null
}

async function submitProposal() {
  let start
  let end

  try {
    start = toISO(proposalStart.value)
    end = toISO(proposalEnd.value)

    if (
      Date.parse(end) <= Date.now() ||
      Date.parse(end) <= Date.parse(start) ||
      Date.parse(end) >
        Date.parse(selectedRaw.value.listing.expiresAt)
    ) {
      throw new Error(
        'Choose a future pickup window ending after its start and no later than expiry.',
      )
    }
  } catch (error) {
    actionError.value = error.message
    return
  }

  const signature = `${start}|${end}`

  if (
    !pendingProposalKey ||
    pendingProposalKey.signature !== signature
  ) {
    pendingProposalKey = {
      signature,
      key: makeClientKey(),
    }
  }

  await runAction(
    async (id) => {
      await api.post(`/rescue/requests/${id}/pickup-proposal`, {
        pickupStart: start,
        pickupEnd: end,
        clientProposalId: pendingProposalKey.key,
      })

      isProposalOpen.value = false
      pendingProposalKey = null
    },
    'New pickup time sent for agreement. This has not reserved the food.',
  )
}

async function respondProposal(action) {
  const proposalId = proposal.value?._id

  if (!proposalId) return

  await runAction(
    async (id) => {
      await api.post(
        `/rescue/requests/${id}/pickup-proposal/${action}`,
        { proposalId },
      )
    },
    action === 'accept'
      ? 'Pickup time agreed. The owner still needs to accept the collection request.'
      : action === 'withdraw'
        ? 'Time suggestion withdrawn.'
        : 'Time suggestion declined. The previous pickup window stays unchanged.',
  )
}

// Collection confirmation

async function openCollectionConfirmation() {
  if (!busy.value) {
    collectionDialog.value.showModal()
  }
}

function closeCollectionConfirmation(event) {
  event?.preventDefault()

  if (!busy.value) {
    collectionDialog.value?.close()
  }
}

async function confirmCollection() {
  const listingId = entityId(selectedRaw.value?.listing)

  await runAction(
    async () => {
      await api.post(`/rescue/${listingId}/collect`)

      const refreshed = await inventory.loadInventory()

      collectionDialog.value.close()

      if (!refreshed) {
        return 'Collection saved. Please refresh inventory on your fridge page.'
      }
    },
    'Collection confirmed. Your inventory is up to date.',
  )
}

// Watchers

watch(
  () => selectedBase.value?.id,
  async () => {
    reply.value = ''
    chatMessages.value = []
    legacyInitial.value = null
    messageError.value = ''
    isProposalOpen.value = false

    pendingSend = null

    await loadMessages()
  },
)

watch(
  () => props.initialListingId,
  () => {
    if (open.value && !busy.value) {
      chooseInitial()
    }
  },
)

watch(
  () => props.activeSection,
  async (section) => {
    if (!['received', 'sent'].includes(section)) {
      clearInterval(pollTimer)

      inboxController?.abort()
      messageController?.abort()

      collectionDialog.value?.close()
      dialog.value?.close()

      releaseScroll?.()
      releaseScroll = null

      if (previousFocus?.isConnected) {
        previousFocus.focus()
      }

      return
    }

    activeTab.value = section
    search.value = ''
    actionError.value = ''
    notice.value = ''
    reply.value = ''

    await nextTick()

    if (!alive || props.activeSection !== section) return

    if (!dialog.value.open) {
      previousFocus = document.activeElement
      releaseScroll = lockBodyScroll()
      dialog.value.showModal()
    }

    await loadInbox({ focus: true })

    if (!alive || props.activeSection !== section) return

    await loadMessages()

    if (!alive || props.activeSection !== section) return

    clearInterval(pollTimer)

    pollTimer = setInterval(async () => {
      if (
        !open.value ||
        busy.value ||
        document.hidden ||
        pollInProgress
      ) {
        return
      }

      pollInProgress = true

      try {
        await loadInbox({ silent: true })
        await loadMessages({ silent: true })
      } finally {
        pollInProgress = false
      }
    }, 10000)
  },
  { immediate: true },
)

// Cleanup

onBeforeUnmount(() => {
  alive = false

  clearInterval(pollTimer)

  inboxController?.abort()
  messageController?.abort()

  collectionDialog.value?.close()
  dialog.value?.close()

  releaseScroll?.()
})
</script>

<template>
  <Teleport to="body">
    <!-- Sharing corner -->
    <dialog
      ref="dialog"
      class="sharing-modal sharing-corner"
      aria-labelledby="sharing-corner-title"
      @cancel.prevent="close"
    >
      <div class="section-heading">
        <div>
          <h2 id="sharing-corner-title">Your sharing corner</h2>
          <p class="muted">Messages, requests and pickup plans.</p>
        </div>

        <button
          type="button"
          class="modal-close"
          aria-label="Close sharing corner"
          :disabled="busy"
          @click="close"
        >
          ×
        </button>
      </div>

      <!-- Loading, errors and notices -->
      <div v-if="inboxError" class="alert alert-danger" role="alert">
        {{ inboxError }}

        <button
          type="button"
          class="filter-button"
          :disabled="busy"
          @click="refresh"
        >
          Retry
        </button>
      </div>

      <p v-if="loading" class="py-3" role="status">
        Loading your requests…
      </p>

      <div v-if="actionError" class="alert alert-danger" role="alert">
        {{ actionError }}
      </div>

      <p v-if="notice" class="alert alert-success" role="status">
        {{ notice }}
      </p>

      <div class="sharing-inbox" :aria-busy="loading">
        <!-- Conversation sidebar -->
        <div class="conversation-sidebar">
          <h3>Your conversations</h3>

          <div class="conversation-filters">
            <button
              v-for="tab in ['received', 'sent']"
              :key="tab"
              type="button"
              class="filter-button"
              :class="{ active: activeTab === tab }"
              :aria-pressed="activeTab === tab"
              :disabled="busy || loading"
              @click="switchTab(tab)"
            >
              {{ tab === 'received' ? 'Received' : 'Sent' }} ·
              {{ countRequests(tab) }}
            </button>
          </div>

          <label class="conversation-search">
            <span class="visually-hidden">
              Find food or a neighbour
            </span>

            <input
              v-model="search"
              :disabled="busy"
              type="search"
              placeholder="Find food or a neighbour…"
            />
          </label>

          <!-- Requests grouped by food -->
          <div class="item-groups" aria-label="Requests grouped by food">
            <div
              v-for="group in visibleGroups"
              :key="group.id"
              class="item-group"
            >
              <button
                type="button"
                class="group-heading"
                :class="{ selected: selectedGroup?.id === group.id }"
                :aria-expanded="
                  expandedIds.includes(group.id) || !!search.trim()
                "
                :aria-controls="`food-group-${group.id}`"
                :disabled="busy"
                @click="toggleGroup(group)"
              >
                <img
                  v-if="group.image && !failedImages.has(group.id)"
                  :src="group.image"
                  alt=""
                  class="group-image"
                  @error="failedImages.add(group.id)"
                />

                <span
                  v-else
                  class="group-image food-icon-placeholder"
                  aria-hidden="true"
                >
                  <FoodIcon :food="group.food" />
                </span>

                <span class="group-copy">
                  <strong>{{ group.food }}</strong>
                  <small>{{ groupSummary(group) }}</small>
                </span>

                <span class="group-chevron" aria-hidden="true">
                  {{
                    expandedIds.includes(group.id) || search.trim()
                      ? '⌄'
                      : '›'
                  }}
                </span>
              </button>

              <div
                v-show="expandedIds.includes(group.id) || search.trim()"
                :id="`food-group-${group.id}`"
                class="group-requests"
              >
                <button
                  v-for="request in group.requests"
                  :key="request.id"
                  type="button"
                  class="request-person"
                  :class="{
                    selected: selectedRequest?.id === request.id,
                  }"
                  :aria-pressed="selectedRequest?.id === request.id"
                  :disabled="busy"
                  @click="selectRequest(group, request)"
                >
                  <strong>{{ request.person }}</strong>
                  <small>{{ request.preview }}</small>
                </button>
              </div>
            </div>

            <p v-if="!visibleGroups.length" class="muted sidebar-empty">
              {{
                search.trim()
                  ? 'No matching conversations.'
                  : 'No requests yet.'
              }}
            </p>
          </div>
        </div>

        <!-- Selected conversation -->
        <div
          v-if="selectedGroup && selectedRequest"
          class="conversation-content"
        >
          <div class="person-heading">
            <span class="person-avatar" aria-hidden="true">
              {{ selectedRequest.person.charAt(0) }}
            </span>

            <div>
              <h3>{{ selectedRequest.person }}</h3>

              <p class="muted">
                {{ selectedGroup.food }} /
                {{
                  activeTab === 'received'
                    ? `${selectedRequest.person.split(' ')[0]}’s request`
                    : 'Your request'
                }}
              </p>
            </div>
          </div>

          <!-- Listing details -->
          <div class="listing-summary">
            <img
              v-if="
                selectedGroup.image &&
                !failedImages.has(selectedGroup.id)
              "
              :src="selectedGroup.image"
              :alt="selectedGroup.food"
              @error="failedImages.add(selectedGroup.id)"
            />

            <span v-else class="listing-placeholder" aria-hidden="true">
              <FoodIcon :food="selectedGroup.food" />
            </span>

            <div>
              <h4>
                {{ selectedGroup.food }} · {{ selectedGroup.quantity }}
              </h4>

              <p class="muted">
                {{ activeTab === 'received' ? 'Your' : 'Owner’s' }}
                pickup window: {{ selectedGroup.preferredPickup }}
              </p>
            </div>
          </div>

          <!-- Message loading and errors -->
          <div v-if="messageError" class="alert alert-danger" role="alert">
            {{ messageError }}

            <button
              type="button"
              class="filter-button"
              @click="loadMessages()"
            >
              Retry messages
            </button>
          </div>

          <p v-if="messagesLoading" role="status">
            Loading messages…
          </p>

          <!-- Message history -->
          <div
            ref="messageList"
            class="message-list"
            aria-label="Conversation messages"
            tabindex="0"
          >
            <div
              v-for="message in selectedRequest.messages"
              :key="message.id"
              class="message-bubble"
              :class="{ own: message.own }"
            >
              <p>{{ message.text }}</p>
              <small>{{ message.author }} · {{ message.time }}</small>
            </div>
          </div>

          <p
            v-if="!messagesLoading && !selectedRequest.messages.length"
            class="muted"
          >
            No messages yet.
          </p>

          <!-- Pickup proposal -->
          <div class="pickup-proposal">
            <div class="proposal-heading">
              <div>
                <p class="pickup-label">
                  {{
                    activeTab === 'received'
                      ? 'Requested pickup'
                      : 'Your requested pickup'
                  }}
                </p>

                <h4>{{ selectedRequest.requestedPickup }}</h4>
              </div>

              <span
                class="pickup-status"
                :class="{
                  changed:
                    selectedRequest.differentTime &&
                    selectedRequest.status === 'pending',
                }"
                role="status"
              >
                {{ statusLabel }}
              </span>
            </div>

            <!-- Existing time suggestion -->
            <div v-if="proposal" class="time-change-note">
              <p>
                <strong>
                  {{
                    ownProposal
                      ? 'Your proposed time'
                      : 'New time suggested'
                  }}
                </strong>
              </p>

              <p>
                {{ windowLabel(proposal.pickupStart, proposal.pickupEnd) }}
              </p>

              <p class="muted">
                A time agreement does not reserve the food.
              </p>

              <div class="proposal-actions mt-2">
                <button
                  v-if="ownProposal"
                  type="button"
                  class="action-button secondary"
                  :disabled="busy"
                  @click="respondProposal('withdraw')"
                >
                  Withdraw suggestion
                </button>

                <template v-else>
                  <button
                    type="button"
                    class="action-button"
                    :disabled="busy || !timeNegotiable"
                    @click="respondProposal('accept')"
                  >
                    Agree to this time
                  </button>

                  <button
                    type="button"
                    class="action-button secondary"
                    :disabled="busy || !timeNegotiable"
                    @click="respondProposal('decline')"
                  >
                    Keep previous time
                  </button>
                </template>
              </div>
            </div>

            <!-- Pending request actions -->
            <template v-if="selectedRequest.status === 'pending'">
              <div class="proposal-actions">
                <button
                  v-if="activeTab === 'received'"
                  type="button"
                  class="action-button"
                  :disabled="busy || !canAccept"
                  @click="updateStatus('accepted')"
                >
                  Accept pickup
                </button>

                <button
                  v-if="!proposal"
                  type="button"
                  class="action-button secondary"
                  :disabled="busy || !timeNegotiable"
                  @click="suggestTime"
                >
                  Suggest another time
                </button>
              </div>

              <p
                v-if="selectedRaw.listing?.status === 'claimed'"
                class="muted"
              >
                Another request currently reserves this listing.
              </p>

              <!-- New pickup time form -->
              <form
                v-if="isProposalOpen && !proposal"
                class="pickup-time-form"
                @submit.prevent="submitProposal"
              >
                <div class="row g-2">
                  <div class="col-sm-6">
                    <label for="proposal-start">From</label>

                    <input
                      id="proposal-start"
                      v-model="proposalStart"
                      type="datetime-local"
                      :disabled="busy"
                      required
                    />
                  </div>

                  <div class="col-sm-6">
                    <label for="proposal-end">Until</label>

                    <input
                      id="proposal-end"
                      v-model="proposalEnd"
                      type="datetime-local"
                      :disabled="busy"
                      required
                    />
                  </div>
                </div>

                <p class="muted">
                  Use your device's local time. The window must end by
                  {{ dateTimeLabel(selectedRaw.listing?.expiresAt) }}.
                </p>

                <div class="proposal-actions mt-2">
                  <button
                    class="action-button"
                    type="submit"
                    :disabled="busy"
                  >
                    Send time suggestion
                  </button>

                  <button
                    class="action-button secondary"
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
                class="text-button"
                :disabled="busy"
                @click="
                  updateStatus(
                    activeTab === 'received' ? 'declined' : 'cancelled',
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

            <!-- Accepted request actions -->
            <div
              v-if="selectedRequest.status === 'accepted'"
              class="proposal-actions"
            >
              <button
                v-if="activeTab === 'received'"
                type="button"
                class="action-button"
                :disabled="busy"
                @click="openCollectionConfirmation"
              >
                Confirm collection
              </button>

              <button
                type="button"
                class="action-button secondary"
                :disabled="busy"
                @click="updateStatus('cancelled')"
              >
                Cancel pickup
              </button>
            </div>
          </div>

          <!-- Message composer -->
          <form class="reply-form" @submit.prevent="sendMessage">
            <label for="sharing-reply" class="visually-hidden">
              Write a reply
            </label>

            <input
              id="sharing-reply"
              ref="replyInput"
              v-model="reply"
              maxlength="1000"
              :disabled="busy || !chatWritable || messagesLoading"
              placeholder="Write a reply…"
              autocomplete="off"
            />

            <button
              type="submit"
              class="action-button"
              :disabled="
                !reply.trim() || busy || !chatWritable || messagesLoading
              "
            >
              Send →
            </button>
          </form>

          <p v-if="!chatWritable" class="muted">
            This request has ended. Its conversation is kept as read-only
            history.
          </p>

          <p class="refresh-note">
            Messages refresh every 10 seconds while this window is open.

            <button
              class="text-button"
              type="button"
              :disabled="busy || loading"
              @click="refresh"
            >
              Refresh now
            </button>
          </p>
        </div>

        <!-- Empty conversation -->
        <div v-else class="empty-conversation">
          <h3>No conversation selected</h3>

          <p class="muted">
            Choose a food item and a neighbour to view their request.
          </p>
        </div>
      </div>
    </dialog>

    <!-- Collection confirmation dialog -->
    <dialog
      ref="collectionDialog"
      class="sharing-confirm sharing-corner"
      aria-labelledby="sharing-collection-title"
      @cancel="closeCollectionConfirmation"
    >
      <h3 id="sharing-collection-title">
        Has the food been collected?
      </h3>

      <p class="mt-3">
        Confirm only after handing over the food. The accepted request will be
        completed. Any linked inventory item will also be removed.
      </p>

      <p
        v-if="actionError"
        class="alert alert-danger mt-3"
        role="alert"
      >
        {{ actionError }}
      </p>

      <div class="proposal-actions mt-3">
        <button
          type="button"
          class="action-button secondary"
          :disabled="busy"
          @click="closeCollectionConfirmation"
        >
          Go back
        </button>

        <button
          type="button"
          class="action-button"
          :disabled="busy"
          @click="confirmCollection"
        >
          {{ busy ? 'Saving…' : 'Yes, collected' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
/* Base */
.sharing-corner {
  color: var(--ink);
  font: 19px/1.4 var(--font-sans);
}

.sharing-overlay,
.sharing-overlay * {
  box-sizing: border-box;
}

h2,
h3,
h4,
p {
  margin: 0;
}

h2,
h3,
h4 {
  font-family: var(--font-display);
  font-weight: 700;
}

h2 {
  font-size: clamp(28px, 3vw, 36px);
}

h3 {
  font-size: 26px;
}

h4 {
  font-size: 24px;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.muted {
  color: var(--muted);
}

/* Modal */
.sharing-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(18, 63, 59, 0.45);
}

.sharing-modal {
  width: 100%;
  max-width: 1360px;
  max-height: calc(100dvh - 48px);
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 2px solid var(--ink);
  border-radius: 22px;
  background: var(--paper);
  box-shadow: var(--shadow-paper);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-heading p {
  margin-top: 6px;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 30px;
  line-height: 1;
}

.modal-close:hover {
  background: var(--aqua-soft);
}

/* Inbox layout */
.sharing-inbox {
  display: grid;
  grid-template-columns: 31% minmax(0, 1fr);
  min-height: 600px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  overflow: hidden;
  background: var(--paper-bright);
}

/* Conversation sidebar */
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 24px;
  border-right: 1px solid var(--line);
  background: var(--paper);
}

.conversation-filters {
  display: flex;
  gap: 10px;
}

.filter-button {
  flex: 1;
  min-height: 44px;
  padding: 8px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
}

.filter-button.active {
  background: var(--aqua);
  color: var(--paper-bright);
}

.filter-button:hover:not(.active) {
  background: var(--aqua-soft);
}

.conversation-search input {
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
  color: var(--ink);
}

/* Requests grouped by food */
.item-groups {
  display: grid;
  align-content: start;
  gap: 12px;
  max-height: 510px;
  padding: 3px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--aqua) var(--aqua-soft);
}

.item-group {
  padding: 10px;
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper-bright);
}

.group-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.group-heading.selected {
  background: var(--aqua-soft);
}

.group-image {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
}

.food-icon-placeholder {
  display: grid;
  place-items: center;
  background: var(--paper);
  font-size: 28px;
}

.group-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.group-copy strong {
  font-family: var(--font-display);
  font-size: 21px;
  line-height: 1.2;
}

.group-copy small {
  color: var(--muted);
  font-size: 16px;
}

.group-chevron {
  margin-left: auto;
  font-size: 24px;
}

.group-requests {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.request-person {
  display: grid;
  gap: 5px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.request-person.selected {
  background: var(--aqua-soft);
}

.request-person strong {
  font-family: var(--font-display);
  font-size: 22px;
}

.request-person small {
  color: var(--muted);
  font-size: 17px;
}

.sidebar-empty {
  padding: 18px;
}

/* Selected conversation */
.conversation-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 24px;
}

.person-heading {
  display: flex;
  align-items: center;
  gap: 16px;
}

.person-heading p {
  margin-top: 4px;
}

.person-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 52px;
  height: 52px;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--coral);
  font-family: var(--font-display);
  font-size: 24px;
}

.listing-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper);
}

.listing-summary img,
.listing-placeholder {
  flex: 0 0 86px;
  width: 86px;
  height: 82px;
  border-radius: 10px;
  object-fit: cover;
}

.listing-placeholder {
  display: grid;
  place-items: center;
  background: var(--aqua-soft);
  font-size: 45px;
}

.listing-summary p {
  margin-top: 8px;
}

/* Messages */
.message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 270px;
  padding: 3px;
  overflow-y: auto;
}

.message-bubble {
  align-self: flex-start;
  max-width: 85%;
  padding: 16px;
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  background: var(--aqua-soft);
  overflow-wrap: anywhere;
}

.message-bubble.own {
  align-self: flex-end;
  background: var(--paper);
}

.message-bubble small {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 16px;
}

/* Pickup proposal */
.pickup-proposal {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1.5px solid var(--ink);
  border-radius: 14px;
  background: var(--yellow-sticky);
}

.proposal-heading,
.proposal-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

.pickup-label {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 17px;
}

.pickup-status {
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--aqua-soft);
  font-size: 17px;
}

.pickup-status.changed {
  background: var(--coral);
}

/* Buttons */
.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 9px 20px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--aqua);
  color: var(--paper-bright);
}

.action-button.secondary {
  background: var(--paper);
  color: var(--ink);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-button {
  justify-self: start;
  min-height: 44px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Message composer */
.reply-form {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper);
}

.reply-form input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--ink);
}

.empty-conversation {
  display: grid;
  align-content: center;
  gap: 12px;
  padding: 40px;
  text-align: center;
}

:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* Responsive layout */
@media (max-width: 991px) {
  .sharing-inbox {
    grid-template-columns: 1fr;
  }

  .conversation-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .item-groups {
    max-height: 280px;
  }
}

@media (max-width: 575px) {
  .sharing-overlay {
    padding: 12px;
  }

  .sharing-modal {
    max-height: calc(100dvh - 24px);
    padding: 16px;
    border-radius: 18px;
  }

  .conversation-sidebar,
  .conversation-content {
    padding: 16px;
  }

  .listing-summary img,
  .listing-placeholder {
    flex-basis: 64px;
    width: 64px;
    height: 70px;
  }

  h4 {
    font-size: 21px;
  }

  .proposal-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .message-bubble {
    max-width: 95%;
  }

  .reply-form {
    gap: 8px;
  }

  .reply-form .action-button {
    padding-inline: 12px;
  }
}

.sharing-modal {
  width: min(1360px, calc(100vw - 32px));
  margin: auto;
  font-size: 18px;
}

.sharing-modal::backdrop,
.sharing-confirm::backdrop {
  background: rgba(18, 63, 59, 0.45);
}

.sharing-modal:not([open]),
.sharing-confirm:not([open]) {
  display: none;
}

.sharing-confirm {
  width: min(520px, calc(100vw - 32px));
  margin: auto;
  padding: 24px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
}

.sharing-corner button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sharing-corner .action-button,
.sharing-corner .filter-button,
.sharing-corner .reply-form input {
  font-size: 16px;
}

.sharing-corner h3 {
  font-size: 24px;
}

.sharing-corner h4 {
  font-size: 22px;
}

.pickup-time-form input {
  width: 100%;
  min-width: 0;
  padding: 9px;
  border: 1.5px solid var(--ink);
  border-radius: 9px;
  background: var(--paper-bright);
  font-size: 16px;
  color: var(--ink);
}

.time-change-note {
  padding: 12px;
  border: 1px dashed var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
}

.refresh-note,
.pickup-time-form p {
  font-size: 14px;
  color: var(--muted);
}

@media (max-width: 575px) {
  .sharing-modal {
    width: calc(100vw - 24px);
    padding: 16px;
  }

  .conversation-content,
  .conversation-sidebar {
    padding: 14px;
  }

  .message-bubble {
    padding: 12px;
  }

  .reply-form {
    gap: 8px;
  }
}
</style>