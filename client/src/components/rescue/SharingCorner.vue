<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// Modal
const props = defineProps({
  activeSection: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['close'])

function close() {
  reply.value = ''
  emit('close')
}

// Local demo data
const itemGroups = ref([
  {
    id: 1,
    direction: 'received',
    food: 'Organic veggie box',
    quantity: '1 box · 1 kg',
    image: '',
    preferredPickup: 'Today, 5–7 pm',
    requests: [
      {
        id: 101,
        person: 'Jamie L.',
        preview: 'Different time · Today, 8 pm',
        requestedPickup: 'Today, 8–8:30 pm',
        differentTime: true,
        status: 'pending',
        messages: [
          {
            id: 1,
            text: 'Could I collect after work at 8 pm?',
            author: 'Jamie',
            time: '2:14 pm',
            own: false,
          },
        ],
      },
      {
        id: 102,
        person: 'Priya K.',
        preview: 'Today, 6 pm · Fits your time',
        requestedPickup: 'Today, 6–6:30 pm',
        differentTime: false,
        status: 'pending',
        messages: [
          {
            id: 1,
            text: 'I can come at 6 pm. Thank you!',
            author: 'Priya',
            time: '2:20 pm',
            own: false,
          },
        ],
      },
    ],
  },
  {
    id: 2,
    direction: 'received',
    food: 'Extra sourdough',
    quantity: '1 whole loaf',
    image: '',
    preferredPickup: 'Tomorrow, 6–8 pm',
    requests: [
      {
        id: 201,
        person: 'Alex T.',
        preview: 'Tomorrow, 6 pm',
        requestedPickup: 'Tomorrow, 6–6:30 pm',
        differentTime: false,
        status: 'pending',
        messages: [
          {
            id: 1,
            text: 'Hi! Could I collect at 6 pm?',
            author: 'Alex',
            time: '1:10 pm',
            own: false,
          },
        ],
      },
      {
        id: 202,
        person: 'Mei L.',
        preview: 'Tomorrow, 7 pm',
        requestedPickup: 'Tomorrow, 7–7:30 pm',
        differentTime: false,
        status: 'pending',
        messages: [
          {
            id: 1,
            text: 'Would 7 pm work? I’ll bring a bag.',
            author: 'Mei',
            time: '1:30 pm',
            own: false,
          },
        ],
      },
      {
        id: 203,
        person: 'Daniel T.',
        preview: 'Pickup confirmed',
        requestedPickup: 'Tomorrow, 7:30–8 pm',
        differentTime: false,
        status: 'accepted',
        messages: [
          {
            id: 1,
            text: 'Thanks for confirming. See you tomorrow!',
            author: 'Daniel',
            time: '2:00 pm',
            own: false,
          },
        ],
      },
    ],
  },
  {
    id: 3,
    direction: 'received',
    food: 'Garden tomatoes',
    quantity: '500 g',
    image: '',
    preferredPickup: 'Today, 4–7 pm',
    requests: [
      {
        id: 301,
        person: 'Ben C.',
        preview: 'Pickup confirmed',
        requestedPickup: 'Today, 5–5:30 pm',
        differentTime: false,
        status: 'accepted',
        messages: [
          {
            id: 1,
            text: 'Thank you! I’ll come at 5 pm.',
            author: 'Ben',
            time: '12:40 pm',
            own: false,
          },
        ],
      },
    ],
  },
  {
    id: 4,
    direction: 'sent',
    food: 'Fresh bananas',
    quantity: '1 bunch',
    image: '',
    preferredPickup: 'Tomorrow, 10 am–12 pm',
    requests: [
      {
        id: 401,
        person: 'Sarah M.',
        preview: 'Waiting for Sarah’s reply',
        requestedPickup: 'Tomorrow, 9–9:30 am',
        differentTime: true,
        status: 'pending',
        messages: [
          {
            id: 1,
            text: 'Could I come at 9 am instead? Thank you!',
            author: 'You',
            time: '2:14 pm',
            own: true,
          },
        ],
      },
    ],
  },
  {
    id: 5,
    direction: 'sent',
    food: 'Avocados',
    quantity: '2 avocados',
    image: '',
    preferredPickup: 'Today, 6–8 pm',
    requests: [
      {
        id: 501,
        person: 'Jia W.',
        preview: 'Pickup confirmed',
        requestedPickup: 'Today, 6:30–7 pm',
        differentTime: false,
        status: 'accepted',
        messages: [
          {
            id: 1,
            text: '6:30 is great. See you then!',
            author: 'Jia',
            time: '1:45 pm',
            own: false,
          },
        ],
      },
    ],
  },
])

// Conversation state
const activeTab = ref('received')
const search = ref('')
const expandedIds = ref([1])
const selectedGroupId = ref(1)
const selectedRequestId = ref(101)
const reply = ref('')
const replyInput = ref(null)
const messageList = ref(null)

const visibleGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  return itemGroups.value
    .filter(group => group.direction === activeTab.value)
    .map(group => ({
      ...group,
      requests: group.food.toLowerCase().includes(query)
        ? group.requests
        : group.requests.filter(request =>
            request.person.toLowerCase().includes(query),
          ),
    }))
    .filter(group => group.requests.length)
})

const selectedGroup = computed(
  () =>
    visibleGroups.value.find(
      group => group.id === selectedGroupId.value,
    ) || visibleGroups.value[0],
)

const selectedRequest = computed(
  () =>
    selectedGroup.value?.requests.find(
      request => request.id === selectedRequestId.value,
    ) || selectedGroup.value?.requests[0],
)

function countRequests(direction) {
  return itemGroups.value
    .filter(group => group.direction === direction)
    .reduce((total, group) => total + group.requests.length, 0)
}

function groupSummary(group) {
  const total = group.requests.length
  const pending = group.requests.filter(
    request => request.status === 'pending',
  ).length

  const count = `${total} ${total === 1 ? 'request' : 'requests'}`

  if (pending) {
    return `${count} · ${pending} ${
      activeTab.value === 'received'
        ? 'awaiting your reply'
        : 'awaiting reply'
    }`
  }

  const confirmed = group.requests.filter(
    request => request.status === 'accepted',
  ).length

  return confirmed
    ? `${count} · ${confirmed} confirmed`
    : `${count} · No pending requests`
}

function switchTab(value) {
  activeTab.value = value
  search.value = ''
  reply.value = ''

  const first = itemGroups.value.find(
    group => group.direction === value && group.requests.length,
  )

  selectedGroupId.value = first?.id
  selectedRequestId.value = first?.requests[0]?.id
  expandedIds.value = first ? [first.id] : []
}

function toggleGroup(group) {
  if (expandedIds.value.includes(group.id)) {
    expandedIds.value = expandedIds.value.filter(
      id => id !== group.id,
    )
  } else {
    expandedIds.value.push(group.id)
    selectRequest(group, group.requests[0])
  }
}

function selectRequest(group, request) {
  selectedGroupId.value = group.id
  selectedRequestId.value = request.id
  reply.value = ''
}

watch(
  () => selectedRequest.value?.id,
  async () => {
    reply.value = ''

    await nextTick()

    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  },
)

// Request status
const statusLabel = computed(() => {
  const request = selectedRequest.value

  if (!request) return ''
  if (request.status === 'accepted') return 'Pickup confirmed'
  if (request.status === 'declined') return 'Request declined'
  if (request.status === 'cancelled') return 'Request cancelled'
  if (activeTab.value === 'sent') return 'Awaiting reply'

  return request.differentTime ? 'Different time' : 'Fits your time'
})

function updateStatus(status) {
  if (!selectedRequest.value) return

  selectedRequest.value.status = status

  const labels = {
    accepted: 'Pickup confirmed',
    declined: 'Request declined',
    cancelled: 'Request cancelled',
  }

  selectedRequest.value.preview = labels[status] || status

  // Demo only. Connect status updates and competing
  // request handling to your backend later.
}

// Messages
async function suggestTime() {
  reply.value = 'Would another pickup time work for you?'

  await nextTick()
  replyInput.value?.focus()
}

async function sendMessage() {
  const text = reply.value.trim()

  if (!text || !selectedRequest.value) return

  selectedRequest.value.messages.push({
    id: Date.now(),
    text,
    author: 'You',
    own: true,
    time: new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date()),
  })

  reply.value = ''

  await nextTick()

  if (messageList.value) {
    messageList.value.scrollTop = messageList.value.scrollHeight
  }
}

watch(
    () => props.activeSection,
    section => {
      if (section === 'received' || section === 'sent') {
        switchTab(section)
      }
    },
    { immediate: true },
  )
</script>

<template>
  <div
    v-if="activeSection === 'received' || activeSection === 'sent'"
    class="sharing-overlay"
    @click.self="close"
    @keydown.esc.stop="close"
  > 
    <div
      class="sharing-modal sharing-corner"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sharing-corner-title"
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
          @click="close"
        >
          ×
        </button>
      </div>

      <div class="sharing-inbox">
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
              type="search"
              placeholder="Find food or a neighbour…"
            />
          </label>

          <div
            class="item-groups"
            aria-label="Requests grouped by food"
          >
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
                @click="toggleGroup(group)"
              >
                <img
                  v-if="group.image"
                  :src="group.image"
                  alt=""
                  class="group-image"
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
                  @click="selectRequest(group, request)"
                >
                  <strong>{{ request.person }}</strong>
                  <small>{{ request.preview }}</small>
                </button>
              </div>
            </div>

            <p
              v-if="!visibleGroups.length"
              class="muted sidebar-empty"
            >
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
              v-if="selectedGroup.image"
              :src="selectedGroup.image"
              :alt="selectedGroup.food"
            />

            <span
              v-else
              class="listing-placeholder"
              aria-hidden="true"
            >
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
              <small>
                {{ message.author }} · {{ message.time }}
              </small>
            </div>
          </div>

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

            <template v-if="selectedRequest.status === 'pending'">
              <div class="proposal-actions">
                <button
                  v-if="activeTab === 'received'"
                  type="button"
                  class="action-button"
                  @click="updateStatus('accepted')"
                >
                  Accept pickup
                </button>

                <button
                  type="button"
                  class="action-button secondary"
                  @click="suggestTime"
                >
                  Suggest another time
                </button>
              </div>

              <button
                type="button"
                class="text-button"
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
              placeholder="Write a reply…"
              autocomplete="off"
            />

            <button
              type="submit"
              class="action-button"
              :disabled="!reply.trim()"
            >
              Send →
            </button>
          </form>
        </div>

        <div v-else class="empty-conversation">
          <h3>No conversation selected</h3>
          <p class="muted">
            Choose a food item and a neighbour to view their request.
          </p>
        </div>
      </div>
    </div>
  </div>
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
</style>