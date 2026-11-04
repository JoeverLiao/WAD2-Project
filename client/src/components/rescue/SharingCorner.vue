<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch, reactive } from 'vue'

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
  isPastRequest,
  statusText,
} from '@/services/rescueConversations.js'

// Props, events and store

const props = defineProps({
  activeSection: { type: String, default: null },
  initialListingId: { type: String, default: null },
})

const emit = defineEmits(['close', 'changed'])
const inventory = useInventoryStore()

function close() {
  if (busy.value) return

  emit('close')
}

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

const conversationNow = ref(Date.now())

const sidebarSections = [
  { id: 'active', title: 'Active conversations' },
  { id: 'past', title: 'Past conversations' },
]

const sectionOpen = reactive({
  active: true,
  past: false,
})

const itemGroups = computed(() => [
  ...groupRequests(received.value, 'received', conversationNow.value),
  ...groupRequests(sent.value, 'sent', conversationNow.value),
])

const visibleGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  return itemGroups.value
    .filter((group) => group.direction === activeTab.value)
    .map((group) => ({
      ...group,
      requests: group.person.toLowerCase().includes(query)
        ? group.requests
        : group.requests.filter((request) =>
            request.food.toLowerCase().includes(query),
          ),
    }))
    .filter((group) => group.requests.length)
})

const conversationSections = computed(() =>
  sidebarSections.map((section) => {
    const past = section.id === 'past'

    const groups = visibleGroups.value
      .map((group) => ({
        ...group,
        requests: group.requests.filter(
          (request) => request.past === past,
        ),
      }))
      .filter((group) => group.requests.length)

    return {
      ...section,
      groups,
      count: groups.reduce(
        (total, group) => total + group.requests.length,
        0,
      ),
    }
  }),
)

const selectedPerson = computed(
  () =>
    visibleGroups.value.find(
      (group) => group.id === selectedGroupId.value,
    ) ||
    conversationSections.value
      .find((section) => section.id === 'active')
      ?.groups[0] ||
    visibleGroups.value[0],
)

const selectedBase = computed(
  () =>
    selectedPerson.value?.requests.find(
      (request) => request.id === selectedRequestId.value,
    ) || selectedPerson.value?.requests[0],
)

// Retain the existing selectedGroup fields used by the detail panel.
const selectedGroup = computed(() =>
  selectedPerson.value && selectedBase.value
    ? {
        ...selectedPerson.value,
        food: selectedBase.value.food,
        quantity: selectedBase.value.quantity,
        image: selectedBase.value.image,
        preferredPickup: selectedBase.value.preferredPickup,
      }
    : null,
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

  if (
    request.past ||
    request.status !== 'pending'
  ) {
    return statusText(
      request.raw,
      activeTab.value,
      conversationNow.value,
    )
  }

  if (request.raw.pickupProposal) {
    return 'Time change awaiting agreement'
  }

  if (activeTab.value === 'sent') return 'Awaiting reply'

  return request.differentTime ? 'Different time' : 'Fits your time'
})

const proposal = computed(() => selectedRaw.value?.pickupProposal)

const ownProposal = computed(
  () =>
    proposal.value &&
    entityId(proposal.value.proposedBy) === currentUserId.value,
)

const chatWritable = computed(
  () => Boolean(selectedBase.value) && !selectedBase.value.past,
)

const timeNegotiable = computed(
  () =>
    Boolean(selectedBase.value) &&
    !selectedBase.value.past &&
    selectedRaw.value?.status === 'pending' &&
    selectedRaw.value?.listing?.status === 'available' &&
    Date.parse(selectedRaw.value.listing.expiresAt) >
      conversationNow.value &&
    Date.parse(selectedRaw.value.listing.pickupEnd) >
      conversationNow.value,
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
  const records =
    direction === 'received' ? received.value : sent.value

  return records.filter(
    (request) => !isPastRequest(request, conversationNow.value),
  ).length
}

function groupSummary(group) {
  const count = group.requests.length

  return `${count} ${count === 1 ? 'conversation' : 'conversations'}`
}

function chooseInitial() {
  let targetGroup
  let targetRequest

  // The main page still passes a listing ID.
  for (const group of visibleGroups.value) {
    const request = group.requests.find(
      (item) => item.listingId === props.initialListingId,
    )

    if (request) {
      targetGroup = group
      targetRequest = request
      break
    }
  }

  if (!targetRequest) {
    const firstSection = conversationSections.value.find(
      (section) => section.groups.length,
    )

    targetGroup = firstSection?.groups[0]
    targetRequest = targetGroup?.requests[0]
  }

  selectedGroupId.value = targetGroup?.id || null
  selectedRequestId.value = targetRequest?.id || null

  if (targetGroup && targetRequest) {
    sectionOpen[targetRequest.past ? 'past' : 'active'] = true

    expandedIds.value = [
      `${targetRequest.past ? 'past' : 'active'}-${targetGroup.id}`,
    ]
  }
}

function togglePerson(sectionId, group) {
  if (busy.value) return

  const key = `${sectionId}-${group.id}`

  if (expandedIds.value.includes(key)) {
    expandedIds.value = expandedIds.value.filter(
      (id) => id !== key,
    )
  } else {
    expandedIds.value.push(key)
    selectRequest(group, group.requests[0])
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

    conversationNow.value = Date.now()

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
      conversationNow.value = Date.now()

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
    <dialog
      ref="dialog"
      class="sharing-modal sharing-corner p-3 p-md-4"
      aria-labelledby="sharing-corner-title"
      @cancel.prevent="close"
    >
      <!-- Heading -->
      <header
        class="d-flex align-items-start justify-content-between gap-3 mb-4"
      >
        <div>
          <h2 id="sharing-corner-title">Your sharing corner</h2>
          <p class="muted mt-1">
            Messages, requests and pickup plans.
          </p>
        </div>

        <button
          type="button"
          class="modal-close d-flex align-items-center justify-content-center flex-shrink-0"
          aria-label="Close sharing corner"
          :disabled="busy"
          @click="close"
        >
          ×
        </button>
      </header>

      <!-- Notices -->
      <div v-if="inboxError" class="alert alert-danger" role="alert">
        {{ inboxError }}

        <button
          type="button"
          class="filter-button px-3 py-2 ms-2"
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

      <!-- Inbox -->
      <div class="sharing-inbox overflow-hidden" :aria-busy="loading">
        <div class="row g-0">
          <!-- Sidebar -->
          <aside class="conversation-sidebar col-12 col-lg-4">
            <div class="d-flex flex-column gap-3 p-3 p-md-4">
              <h3>Your conversations</h3>

              <div class="d-flex gap-2">
                <button
                  v-for="tab in ['received', 'sent']"
                  :key="tab"
                  type="button"
                  class="filter-button flex-fill px-2 py-2"
                  :class="{ active: activeTab === tab }"
                  :aria-pressed="activeTab === tab"
                  :disabled="busy || loading"
                  @click="switchTab(tab)"
                >
                  {{ tab === 'received' ? 'Received' : 'Sent' }} ·
                  {{ countRequests(tab) }}
                </button>
              </div>

              <label class="d-block">
                <span class="visually-hidden">
                  Find food or a neighbour
                </span>

                <input
                  v-model="search"
                  class="conversation-search form-control"
                  :disabled="busy"
                  type="search"
                  placeholder="Find food or a neighbour…"
                />
              </label>

              <!-- Active and past conversations -->
              <div
                class="item-groups d-flex flex-column gap-3 overflow-auto p-1"
                aria-label="Conversations grouped by person"
              >
                <details
                  v-for="section in conversationSections"
                  :key="section.id"
                  :open="
                    sectionOpen[section.id] ||
                    Boolean(search.trim())
                  "
                  class="conversation-section p-2"
                  @toggle="
                    sectionOpen[section.id] = $event.target.open
                  "
                >
                  <summary class="conversation-section-heading">
                    <span>{{ section.title }}</span>

                    <span
                      class="conversation-count d-inline-block rounded-pill px-2 ms-1"
                    >
                      {{ section.count }}
                    </span>
                  </summary>

                  <div class="d-flex flex-column gap-2 pt-2">
                    <div
                      v-for="group in section.groups"
                      :key="group.id"
                      class="item-group p-2"
                    >
                      <!-- Person -->
                      <button
                        type="button"
                        class="group-heading d-flex align-items-center gap-2 w-100 p-2 text-start"
                        :class="{
                          selected: selectedPerson?.id === group.id,
                        }"
                        :aria-expanded="expandedIds.includes(`${section.id}-${group.id}`)"
                        :aria-controls="
                          `person-${section.id}-${group.id}`
                        "
                        :disabled="busy"
                        @click="togglePerson(section.id, group)"
                      >
                        <span
                          class="conversation-avatar d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle"
                          aria-hidden="true"
                        >
                          {{ group.person.charAt(0).toUpperCase() }}
                        </span>

                        <span class="group-copy d-flex flex-column gap-1">
                          <strong>{{ group.person }}</strong>
                          <small>{{ groupSummary(group) }}</small>
                        </span>

                        <span class="group-chevron ms-auto" aria-hidden="true">
                          {{
                            expandedIds.includes(`${section.id}-${group.id}`)
                              ? '⌄'
                              : '›'
                          }}
                        </span>
                      </button>

                      <!-- Food conversations -->
                      <div
                        v-if="expandedIds.includes(`${section.id}-${group.id}`)"
                        :id="`person-${section.id}-${group.id}`"
                        class="d-flex flex-column gap-1 mt-2"
                      >
                        <button
                          v-for="request in group.requests"
                          :key="request.id"
                          type="button"
                          class="request-person d-flex align-items-start gap-2 w-100 px-3 py-2 text-start"
                          :class="{
                            selected:
                              selectedRequest?.id === request.id,
                          }"
                          :aria-pressed="
                            selectedRequest?.id === request.id
                          "
                          :disabled="busy"
                          @click="selectRequest(group, request)"
                        >
                          <span
                            class="conversation-food-icon flex-shrink-0"
                            aria-hidden="true"
                          >
                            <FoodIcon :food="request.food" />
                          </span>

                          <span class="d-flex flex-column gap-1">
                            <strong>{{ request.food }}</strong>
                            <small>{{ request.preview }}</small>
                          </span>
                        </button>
                      </div>
                    </div>

                    <p
                      v-if="!section.groups.length"
                      class="muted p-3"
                    >
                      {{
                        search.trim()
                          ? 'No matching conversations.'
                          : section.id === 'active'
                            ? 'No active conversations.'
                            : 'No past conversations.'
                      }}
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </aside>

          <!-- Selected conversation -->
          <main
            v-if="selectedGroup && selectedRequest"
            class="conversation-content col-12 col-lg-8"
          >
            <div class="d-flex flex-column gap-3 p-3 p-md-4">
              <!-- Person -->
              <div class="d-flex align-items-center gap-3">
                <span
                  class="person-avatar d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle"
                  aria-hidden="true"
                >
                  {{ selectedRequest.person.charAt(0) }}
                </span>

                <div>
                  <h3>{{ selectedRequest.person }}</h3>

                  <p class="muted mt-1">
                    {{ selectedGroup.food }} /
                    {{
                      activeTab === 'received'
                        ? `${selectedRequest.person.split(' ')[0]}’s request`
                        : 'Your request'
                    }}
                  </p>
                </div>
              </div>

              <!-- Listing -->
              <div
                class="listing-summary d-flex align-items-center gap-3 p-3"
              >
                <img
                  v-if="
                    selectedGroup.image &&
                    !failedImages.has(selectedRequest.listingId)
                  "
                  :src="selectedGroup.image"
                  :alt="selectedGroup.food"
                  class="listing-photo flex-shrink-0 rounded"
                  @error="
                    failedImages.add(selectedRequest.listingId)
                  "
                />

                <span
                  v-else
                  class="listing-placeholder d-flex align-items-center justify-content-center flex-shrink-0 rounded"
                  aria-hidden="true"
                >
                  <FoodIcon :food="selectedGroup.food" />
                </span>

                <div>
                  <h4>
                    {{ selectedGroup.food }} ·
                    {{ selectedGroup.quantity }}
                  </h4>

                  <p class="muted mt-2">
                    {{ activeTab === 'received' ? 'Your' : 'Owner’s' }}
                    pickup window:
                    {{ selectedGroup.preferredPickup }}
                  </p>
                </div>
              </div>

              <!-- Message errors -->
              <div
                v-if="messageError"
                class="alert alert-danger"
                role="alert"
              >
                {{ messageError }}

                <button
                  type="button"
                  class="filter-button px-3 py-2 mt-2"
                  @click="loadMessages()"
                >
                  Retry messages
                </button>
              </div>

              <p v-if="messagesLoading" role="status">
                Loading messages…
              </p>

              <!-- Messages -->
              <div
                ref="messageList"
                class="message-list d-flex flex-column gap-3 overflow-auto p-1"
                aria-label="Conversation messages"
                tabindex="0"
              >
                <div
                  v-for="message in selectedRequest.messages"
                  :key="message.id"
                  class="message-bubble p-3"
                  :class="
                    message.own
                      ? 'own align-self-end'
                      : 'align-self-start'
                  "
                >
                  <p>{{ message.text }}</p>

                  <small class="d-block mt-2">
                    {{ message.author }} · {{ message.time }}
                  </small>
                </div>
              </div>

              <p
                v-if="
                  !messagesLoading &&
                  !selectedRequest.messages.length
                "
                class="muted"
              >
                No messages yet.
              </p>

              <!-- Pickup -->
              <div
                class="pickup-proposal d-flex flex-column gap-3 p-3"
              >
                <div
                  class="d-flex flex-wrap align-items-center justify-content-between gap-3"
                >
                  <div>
                    <p class="pickup-label muted mb-1">
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

                  <p class="muted mt-1">
                    A time agreement does not reserve the food.
                  </p>

                  <div
                    v-if="!selectedRequest.past"
                    class="d-flex flex-column flex-sm-row flex-wrap gap-2 mt-2"
                  >
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

                    <p class="muted mt-2">
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
                    class="text-button align-self-start"
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

              <!-- Reply -->
              <form
                class="reply-form p-2 p-sm-3"
                @submit.prevent="sendMessage"
              >
                <div class="row g-2 align-items-center">
                  <div class="col">
                    <label
                      for="sharing-reply"
                      class="visually-hidden"
                    >
                      Write a reply
                    </label>

                    <input
                      id="sharing-reply"
                      ref="replyInput"
                      v-model="reply"
                      class="form-control"
                      maxlength="1000"
                      :disabled="
                        busy || !chatWritable || messagesLoading
                      "
                      placeholder="Write a reply…"
                      autocomplete="off"
                    />
                  </div>

                  <div class="col-auto">
                    <button
                      type="submit"
                      class="action-button"
                      :disabled="
                        !reply.trim() ||
                        busy ||
                        !chatWritable ||
                        messagesLoading
                      "
                    >
                      Send →
                    </button>
                  </div>
                </div>
              </form>

              <p v-if="!chatWritable" class="muted">
                This conversation is in your history.
                Messages are read-only.

                <span
                  v-if="selectedRequest.status === 'accepted'"
                  class="d-block mt-1"
                >
                  The owner can still confirm collection
                  or cancel the pickup.
                </span>
              </p>
            </div>
          </main>

          <!-- Empty state -->
          <div
            v-else
            class="conversation-content col-12 col-lg-8 d-flex align-items-center justify-content-center p-4 p-md-5 text-center"
          >
            <div>
              <h3>No conversation selected</h3>

              <p class="muted mt-2">
                Choose a neighbour and a food item to view
                the conversation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <!-- Collection confirmation -->
    <dialog
      ref="collectionDialog"
      class="sharing-confirm sharing-corner p-3 p-md-4"
      aria-labelledby="sharing-collection-title"
      @cancel="closeCollectionConfirmation"
    >
      <h3 id="sharing-collection-title">
        Has the food been collected?
      </h3>

      <p class="mt-3">
        Confirm only after handing over the food.
        The accepted request will be completed and the shared
        quantity deducted from any linked inventory item.
      </p>

      <p
        v-if="actionError"
        class="alert alert-danger mt-3"
        role="alert"
      >
        {{ actionError }}
      </p>

      <div
        class="d-flex flex-column flex-sm-row flex-wrap gap-2 mt-3"
      >
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
  font: 18px/1.4 var(--font-sans);
}

.sharing-corner h2,
.sharing-corner h3,
.sharing-corner h4,
.sharing-corner p {
  margin: 0;
}

.sharing-corner h2,
.sharing-corner h3,
.sharing-corner h4 {
  font-family: var(--font-display);
  font-weight: 700;
}

.sharing-corner h2 {
  font-size: clamp(28px, 3vw, 36px);
}

.sharing-corner h3 {
  font-size: 24px;
}

.sharing-corner h4 {
  font-size: 22px;
}

.sharing-corner button,
.sharing-corner input {
  font: inherit;
}

.sharing-corner button {
  cursor: pointer;
}

.sharing-corner button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.muted {
  color: var(--muted);
}

/* Native dialogs */
.sharing-modal,
.sharing-confirm {
  margin: auto;
  border: 2px solid var(--ink);
  background: var(--paper);
}

.sharing-modal {
  width: min(1360px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  border-radius: 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: var(--shadow-paper);
}

.sharing-confirm {
  width: min(520px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  border-radius: 18px;
}

.sharing-modal::backdrop,
.sharing-confirm::backdrop {
  background: rgba(18, 63, 59, 0.45);
}

.sharing-modal:not([open]),
.sharing-confirm:not([open]) {
  display: none;
}

.modal-close {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 30px !important;
  line-height: 1;
}

.modal-close:hover {
  background: var(--aqua-soft);
}

/* Inbox surfaces */
.sharing-inbox {
  min-height: 600px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper-bright);
}

.conversation-sidebar {
  min-width: 0;
  background: var(--paper);
}

.conversation-content {
  min-width: 0;
}

.item-groups {
  max-height: 510px;
  scrollbar-width: thin;
  scrollbar-color: var(--aqua) var(--aqua-soft);
}

.conversation-section {
  border: 1.5px solid var(--line);
  border-radius: 12px;
  background: var(--paper-bright);
}

.conversation-section-heading {
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 700;
}

.conversation-count {
  background: var(--aqua-soft);
  font-family: var(--font-sans);
  font-size: 15px;
}

.item-group {
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper-bright);
}

.group-heading,
.request-person {
  min-width: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
}

.group-heading.selected,
.request-person.selected {
  background: var(--aqua-soft);
}

.group-copy,
.request-person > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.group-copy strong,
.request-person strong {
  font-family: var(--font-display);
  font-size: 21px;
  line-height: 1.2;
}

.group-copy small,
.request-person small {
  color: var(--muted);
  font-size: 16px;
}

.group-chevron {
  font-size: 24px;
}

.conversation-avatar,
.person-avatar {
  background: var(--coral);
  font-family: var(--font-display);
}

.conversation-avatar {
  width: 40px;
  height: 40px;
  font-size: 23px;
}

.person-avatar {
  width: 52px;
  height: 52px;
  border: 1.5px solid var(--ink);
  font-size: 24px;
}

.conversation-food-icon {
  width: 28px;
  font-size: 25px;
}

/* Form controls and buttons */
.sharing-corner .form-control {
  min-width: 0;
  min-height: 44px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background-color: var(--paper-bright);
  color: var(--ink);
  font: inherit;
  font-size: 16px;
}

.filter-button {
  min-height: 44px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font-size: 16px !important;
}

.filter-button.active {
  background: var(--aqua);
  color: var(--paper-bright);
}

.filter-button:hover:not(.active) {
  background: var(--aqua-soft);
}

.action-button {
  min-height: 44px;
  padding: 9px 16px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  background: var(--aqua);
  color: var(--paper-bright);
  font-size: 16px !important;
}

.action-button.secondary {
  background: var(--paper);
  color: var(--ink);
}

.text-button {
  min-height: 44px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Listing preview */
.listing-summary {
  min-width: 0;
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper);
}

.listing-summary > div {
  min-width: 0;
  overflow-wrap: anywhere;
}

.listing-photo,
.listing-placeholder {
  width: clamp(64px, 7vw, 86px);
  height: clamp(70px, 7vw, 82px);
  object-fit: cover;
}

.listing-placeholder {
  background: var(--aqua-soft);
  font-size: 40px;
}

/* Messages */
.message-list {
  max-height: 270px;
}

.message-bubble {
  max-width: 90%;
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  background: var(--aqua-soft);
  overflow-wrap: anywhere;
}

.message-bubble.own {
  background: var(--paper);
}

.message-bubble small {
  color: var(--muted);
  font-size: 14px;
}

.reply-form {
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  background: var(--paper);
}

.sharing-corner .reply-form input {
  border: 0;
  background: transparent;
}

/* Pickup details */
.pickup-proposal {
  border: 1.5px solid var(--ink);
  border-radius: 14px;
  background: var(--yellow-sticky);
}

.pickup-label,
.pickup-status {
  font-size: 16px;
}

.pickup-status {
  background: var(--aqua-soft);
}

.pickup-status.changed {
  background: var(--coral);
}

.time-change-note {
  border: 1px dashed var(--ink);
  border-radius: 10px;
  background: var(--paper-bright);
}

.refresh-note,
.pickup-time-form p {
  font-size: 14px;
  color: var(--muted);
}

.sharing-corner :focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}
</style>