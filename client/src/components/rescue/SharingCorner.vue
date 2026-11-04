<script setup>
import '@/assets/rescue.css'
import { useConversationActivity } from '@/composables/rescue/useConversationActivity.js'
import ConversationListingSummary from './ConversationListingSummary.vue'
import ConversationPickup from './ConversationPickup.vue'
import ConversationSidebar from './ConversationSidebar.vue'
import { computed, nextTick, onBeforeUnmount, ref, watch, reactive } from 'vue'

import { useInventoryStore } from '@/stores/inventory.js'
import { allPages, api, apiError, isCancelled } from '@/services/rescueApi.js'
import { toLocalInput, toISO } from '@/services/rescueForm.js'
import { lockBodyScroll } from '@/services/rescueModal.js'
import { entityId, groupRequests, dateTimeLabel, makeClientKey, isPastRequest, statusText } from '@/services/rescueConversations.js'

// Props, events and store

const props = defineProps({
  activeSection: { type: String, default: null },
  initialListingId: { type: String, default: null },
})

const emit = defineEmits(['close', 'changed'])
const inventory = useInventoryStore()
const { activityFor, recordMessages, markRead, loadActivity } = useConversationActivity()

function close() {
  if (busy.value) return

  emit('close')
}

let pressedBackdrop = false
function outsideMessageModal(event) {
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom
}
function closeFromBackdrop(event) {
  if (pressedBackdrop && outsideMessageModal(event)) close()
  pressedBackdrop = false
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
      .map((group) => {
        const requests = group.requests
          .filter((request) => request.past === past)
          .map((request) => ({
            ...request,
            ...activityFor(request.raw, group.direction),
          }))

        // Sort only active conversations. Status changes do not count as messages.
        if (!past) {
          requests.sort((a, b) => b.latestMessageAt - a.latestMessageAt || a.id.localeCompare(b.id))
        }

        return {
          ...group,
          requests,
          latestMessageAt: Math.max(0, ...requests.map((request) => request.latestMessageAt)),
          hasUnread: requests.some((request) => request.hasUnread),
        }
      })
      .filter((group) => group.requests.length)

    if (!past) {
      groups.sort((a, b) => b.latestMessageAt - a.latestMessageAt || a.person.localeCompare(b.person))
    }

    return {
      ...section,
      groups,
      count: groups.reduce((total, group) => total + group.requests.length, 0),
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

    const threads = [
      ...incoming.map((request) => ({ request, direction: 'received' })),
      ...outgoing.map((request) => ({ request, direction: 'sent' })),
    ].filter(({ request }) => !isPastRequest(request, conversationNow.value))

    await loadActivity(threads, controller.signal)
    if (!alive || !open.value || controller.signal.aborted || sequence !== inboxSequence) return

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
  const request = selectedRaw.value
  const direction = activeTab.value

  if (!requestId || !open.value || !selectedRequestId.value) {
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
    recordMessages(request, direction, chatMessages.value, initial)

    if (!document.hidden) {
      const incoming = chatMessages.value.filter(message => entityId(message.sender) !== currentUserId.value)
      for (let offset = 0; offset < incoming.length || offset === 0; offset += 100) {
        if (!alive || !open.value || document.hidden || controller.signal.aborted || selectedBase.value?.id !== requestId) return
        await api.post(`/rescue/requests/${requestId}/messages/read`,
          { messageIds: incoming.slice(offset, offset + 100).map(message => message._id), initial: Boolean(initial) },
          { signal: controller.signal })
      }

      // Clear only messages loaded in the visible conversation, after read acknowledgement.
      if (alive && open.value && !document.hidden && !controller.signal.aborted && selectedBase.value?.id === requestId) {
        markRead(request, direction, chatMessages.value, initial)
      }
    }

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
function setSectionOpen(sectionId, isOpen) {
  sectionOpen[sectionId] = isOpen
}
function markPhotoFailed(listingId) {
  failedImages.value.add(listingId)
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="sharing-modal sharing-corner p-3 p-md-4"
      aria-labelledby="sharing-corner-title"
      @cancel.prevent="close"
      @pointerdown="pressedBackdrop = outsideMessageModal($event)"
      @click="closeFromBackdrop"
    >
      <!-- Heading -->
      <header
        class="d-flex align-items-start justify-content-between gap-3 mb-4"
      >
        <div>
          <h2 id="sharing-corner-title">Your sharing corner</h2>
          <p class="muted mt-1 text-muted">
            Messages, requests and pickup plans.
          </p>
        </div>

        <button
          type="button"
          class="modal-close d-flex align-items-center justify-content-center flex-shrink-0 btn rescue-close rounded-circle d-inline-flex p-0"
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
          class="filter-button px-3 py-2 ms-2 btn rescue-button btn-outline-dark"
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
          <ConversationSidebar
            :active-tab="activeTab"
            :busy="busy"
            :conversation-sections="conversationSections"
            :count-requests="countRequests"
            :expanded-ids="expandedIds"
            :group-summary="groupSummary"
            :loading="loading"
            :search="search"
            :section-open="sectionOpen"
            :selected-person="selectedPerson"
            :selected-request="selectedRequest"
            @switch-tab="switchTab"
            @toggle-person="togglePerson"
            @select-request="selectRequest"
            @update:search="search = $event"
            @toggle-section="setSectionOpen"
          />

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

                  <p class="muted mt-1 text-muted">
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
              <ConversationListingSummary
                :active-tab="activeTab"
                :failed-images="failedImages"
                :selected-group="selectedGroup"
                :selected-request="selectedRequest"
                @photo-error="markPhotoFailed"
              />

              <!-- Message errors -->
              <div
                v-if="messageError"
                class="alert alert-danger"
                role="alert"
              >
                {{ messageError }}

                <button
                  type="button"
                  class="filter-button px-3 py-2 mt-2 btn rescue-button btn-outline-dark"
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
                class="muted text-muted"
              >
                No messages yet.
              </p>

              <!-- Pickup -->
              <ConversationPickup
                :active-tab="activeTab"
                :busy="busy"
                :can-accept="canAccept"
                :is-proposal-open="isProposalOpen"
                :own-proposal="ownProposal"
                :proposal="proposal"
                :proposal-end="proposalEnd"
                :proposal-start="proposalStart"
                :selected-raw="selectedRaw"
                :selected-request="selectedRequest"
                :status-label="statusLabel"
                :time-negotiable="timeNegotiable"
                @respond-proposal="respondProposal"
                @update-status="updateStatus"
                @suggest-time="suggestTime"
                @submit-proposal="submitProposal"
                @open-collection-confirmation="openCollectionConfirmation"
                @update:isProposalOpen="isProposalOpen = $event"
                @update:proposalStart="proposalStart = $event"
                @update:proposalEnd="proposalEnd = $event"
              />

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
                      class="action-button btn rescue-button btn-primary"
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

              <p v-if="!chatWritable" class="muted text-muted">
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

              <p class="muted mt-2 text-muted">
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
          class="action-button secondary btn rescue-button btn-outline-dark"
          :disabled="busy"
          @click="closeCollectionConfirmation"
        >
          Go back
        </button>

        <button
          type="button"
          class="action-button btn rescue-button btn-primary"
          :disabled="busy"
          @click="confirmCollection"
        >
          {{ busy ? 'Saving…' : 'Yes, collected' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>
