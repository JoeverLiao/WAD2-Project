<script setup>
import { computed } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  activeTab: { type: String, required: true },
  busy: { type: Boolean, required: true },
  conversationSections: { type: Array, required: true },
  countRequests: { type: Function, required: true },
  expandedIds: { type: Array, required: true },
  groupSummary: { type: Function, required: true },
  loading: { type: Boolean, required: true },
  search: { type: String, required: true },
  sectionOpen: { type: Object, required: true },
  selectedPerson: { type: Object, default: null },
  selectedRequest: { type: Object, default: null },
})

const emit = defineEmits(['switch-tab', 'toggle-person', 'select-request', 'update:search', 'toggle-section'])

const search = computed({
  get() {
    return props.search
  },
  set(value) {
    emit('update:search', value)
  },
})

function switchTab(value) {
  emit('switch-tab', value)
}

function togglePerson(sectionId, group) {
  emit('toggle-person', sectionId, group)
}

function selectRequest(group, request) {
  emit('select-request', group, request)
}
</script>

<template>
  <aside class="conversation-sidebar col-12 col-lg-4">
    <div class="d-flex flex-column gap-3 p-3 p-md-4">
      <h3>Your conversations</h3>

      <div class="d-flex gap-2">
        <button
          v-for="tab in ['received', 'sent']"
          :key="tab"
          type="button"
          class="filter-button flex-fill px-2 py-2 btn rescue-button btn-outline-dark"
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
          $emit('toggle-section', section.id, $event.target.open)
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
                class="group-heading d-flex align-items-center gap-2 w-100 p-2 text-start border-0"
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

                <span
                  v-if="section.id === 'active' && group.hasUnread"
                  class="rescue-unread-dot"
                >
                  <span class="visually-hidden">Unread messages</span>
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
                  class="request-person d-flex align-items-start gap-2 w-100 px-3 py-2 text-start border-0"
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
                    <FoodIcon :name="request.food" />
                  </span>

                  <span class="d-flex flex-column gap-1">
                    <strong>{{ request.food }}</strong>
                    <small>{{ request.preview }}</small>
                  </span>

                  <span
                    v-if="section.id === 'active' && request.hasUnread"
                    class="rescue-unread-dot ms-auto mt-1"
                  >
                    <span class="visually-hidden">Unread messages</span>
                  </span>
                </button>
              </div>
            </div>

            <p
              v-if="!section.groups.length"
              class="muted p-3 text-muted"
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
</template>
