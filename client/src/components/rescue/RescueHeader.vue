<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '../../stores/auth.js'
import FoodIcon from '../FoodIcon.vue'
import { distanceLabel } from '@/services/rescueMap.js'

// Props and events

// The main view forwards the current map results.
// This avoids another API query or geolocation prompt.
const props = defineProps({
  nearbyListings: { type: Array, default: () => [] },
  nearbyLoading: { type: Boolean, default: true },
  nearbyError: { type: String, default: '' },
  searchLabel: { type: String, default: '' },
})

const emit = defineEmits([
  'post-listing',
  'explore',
  'request-listing',
  'refresh-nearby',
])

// Authentication and clock

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)

const clock = ref(Date.now())

let timer

// Community board heading

const boardOwner = computed(() =>
  isAuthenticated.value && user.value?.name
    ? `${String(user.value.name).toUpperCase()}'S`
    : 'YOUR',
)

// Nearby food expiring today

const expiringToday = computed(() => {
  const now = new Date(clock.value)

  const dayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime()

  return props.nearbyListings
    .filter((item) => {
      const expiry = Date.parse(item.expiresAt)

      return (
        item.status === 'available' &&
        !item.isOwner &&
        expiry > clock.value &&
        expiry < dayEnd &&
        Date.parse(item.pickupEnd) > clock.value
      )
    })
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.expiresAt) - Date.parse(b.expiresAt) ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    )
})

const preview = computed(() => expiringToday.value.slice(0, 2))

const canShowResults = computed(
  () => !props.nearbyLoading && !props.nearbyError,
)

// Formatting

function expiryTime(value) {
  return new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

// Lifecycle

onMounted(() => {
  timer = setInterval(() => {
    clock.value = Date.now()
  }, 30000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
})
</script>

<template>
  <div class="container py-4">
    <div class="bulletin-board-container my-4">
      <div class="row align-items-center gy-4">
        <!-- Community board introduction -->
        <div class="col-12 col-lg-7 col-xl-6">
          <div class="eyebrow mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              class="bi bi-heart"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"
              />
            </svg>

            {{ boardOwner }} COMMUNITY BOARD
          </div>

          <h1 class="board-title">
            Got extra food?<br />
            Share with your neighbours.
          </h1>

          <p class="text-muted mb-4 board-intro">
            Too many groceries or extra cooked food? Share with neighbours just
            down the block.
          </p>

          <div class="d-flex flex-wrap align-items-center gap-3">
            <button
              type="button"
              class="primary-button"
              @click="emit('post-listing')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="currentColor"
                class="bi bi-plus"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"
                />
              </svg>

              Post item on board
            </button>

            <a
              href="#explore-map"
              class="secondary-button text-decoration-none"
              @click.prevent="emit('explore')"
            >
              See what's nearby ↓
            </a>
          </div>
        </div>

        <!-- Expiring food sticky note -->
        <div class="col-12 col-lg-5 col-xl-5 offset-xl-1">
          <section
            class="sticky-note-card"
            aria-labelledby="urgent-food-title"
            :aria-busy="nearbyLoading"
          >
            <div class="push-pin" aria-hidden="true"></div>

            <div
              class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2"
            >
              <h2 id="urgent-food-title" class="fs-4 fw-bold m-0">
                Expiring today
              </h2>

              <span
                v-if="canShowResults && expiringToday.length"
                class="urgency-badge"
              >
                {{ expiringToday.length }}
                {{ expiringToday.length === 1 ? 'item' : 'items' }} found
              </span>
            </div>

            <!-- Loading -->
            <p
              v-if="nearbyLoading"
              class="small text-muted my-3"
              role="status"
            >
              Checking the current map results…
            </p>

            <!-- Error -->
            <div
              v-else-if="nearbyError"
              class="small my-3"
              role="alert"
            >
              <p class="text-muted mb-2">
                {{ nearbyError }}
              </p>

              <button
                type="button"
                class="secondary-button compact-btn"
                @click="emit('refresh-nearby')"
              >
                Retry nearby food
              </button>
            </div>

            <!-- Available expiring food -->
            <template v-else-if="preview.length">
              <p class="small text-muted mb-3">
                Available food from neighbours in your current map results:
              </p>

              <div class="d-flex flex-column gap-2 mb-3">
                <div
                  v-for="item in preview"
                  :key="item._id"
                  class="urgent-item p-2 bg-white rounded border border-dark d-flex align-items-center justify-content-between gap-2"
                >
                  <div class="urgent-item-copy">
                    <strong class="d-flex align-items-center gap-2 small">
                      <span class="urgent-food-icon" aria-hidden="true">
                        <FoodIcon :food="item.title" />
                      </span>

                      <span>{{ item.title }}</span>
                    </strong>

                    <span class="d-block small text-muted">
                      {{ item.quantity }} {{ item.unit }} ·
                      {{ distanceLabel(item.distanceKm) }}
                    </span>

                    <span class="d-block small text-muted">
                      Use by {{ expiryTime(item.expiresAt) }}
                    </span>
                  </div>

                  <button
                    type="button"
                    class="primary-button urgent-action"
                    @click="emit('request-listing', String(item._id))"
                  >
                    {{
                      item.hasActiveRequest
                        ? 'View request'
                        : 'Request pickup'
                    }}
                  </button>
                </div>
              </div>

              <button
                v-if="expiringToday.length > preview.length"
                type="button"
                class="more-food-button small mb-3"
                @click="emit('explore')"
              >
                {{ expiringToday.length - preview.length }} more expiring today
                in these results →
              </button>

              <p
                class="p-2 bg-light border border-dark rounded text-center small fw-bold"
              >
                Pickup is confirmed when the owner accepts.
              </p>
            </template>

            <!-- Empty state -->
            <template v-else>
              <p class="small text-muted my-3">
                No food expiring today in your current map results. Try another
                area or explore other food nearby.
              </p>

              <button
                type="button"
                class="secondary-button compact-btn"
                @click="emit('explore')"
              >
                Explore nearby food ↓
              </button>
            </template>

            <!-- Current search area -->
            <p
              v-if="searchLabel && canShowResults"
              class="search-context small text-muted mt-3 mb-0"
            >
              {{ searchLabel }}
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Community board */
.bulletin-board-container {
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 24px;
  padding: 36px;
  box-shadow: var(--shadow-paper);
  position: relative;
}

.board-title {
  font-size: clamp(24px, 4vw, 45px);
}

.board-intro {
  font-size: 20px;
}

/* Sticky note pin */
.push-pin {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  background: var(--coral);
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: 1px 2px 0 rgba(0, 0, 0, 0.25);
  z-index: 10;
}

.push-pin::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 4px;
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
  opacity: 0.8;
}

/* Urgency badge */
.urgency-badge {
  background: #ff6b6b;
  color: white;
  border: 1.5px solid var(--ink);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: bold;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

/* Sticky note */
.sticky-note-card {
  background: var(--yellow-sticky);
  border: 3px solid var(--ink);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 6px 8px 0 var(--ink);
  position: relative;
  animation: subtleFloat 6s ease-in-out infinite;
  transition:
    transform 250ms ease,
    box-shadow 250ms ease;
  transform-origin: 50% -1px;
}

.sticky-note-card:hover {
  animation-play-state: paused;
  box-shadow: 6px 10px 0 rgba(18, 63, 59, 0.2);
}

@keyframes subtleFloat {
  0%,
  100% {
    transform: rotate(-2deg);
  }

  50% {
    transform: rotate(2deg);
  }
}

.sticky-note-card h2 {
  font-family: var(--font-display);
}

/* Board label */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #11847b;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

/* Primary buttons */
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 13px 22px;
  border: 2px solid var(--ink);
  border-radius: 14px 11px 16px 10px;
  background: var(--aqua);
  color: white;
  font-size: 16px;
  font-weight: 800;
  box-shadow: var(--shadow-small);
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
  cursor: pointer;
  text-decoration: none;
}

.sticky-note-card .primary-button {
  font-size: 14px;
  padding: 8px 12px;
}

.primary-button:hover:not(:disabled) {
  box-shadow: 1px 2px 0 var(--ink);
  transform: translate(2px, 2px);
  background: #0d968b;
  color: white;
}

.primary-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
  box-shadow: 2px 2px 0 var(--ink);
}

/* Secondary buttons */
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 22px;
  border: 2px solid var(--ink);
  border-radius: 13px;
  background: white;
  color: var(--ink);
  font-size: 17px;
  font-weight: 800;
  box-shadow: 2px 3px 0 var(--ink);
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
  cursor: pointer;
}

.secondary-button:hover:not(:disabled) {
  box-shadow: 1px 2px 0 var(--ink);
  transform: translate(1px, 1px);
  background: #fdfdfd;
}

.compact-btn {
  padding: 8px 16px;
  font-size: 15px;
}

/* Expiring food items */
.urgent-item-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}

.urgent-food-icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
}

.urgent-action {
  flex-shrink: 0;
  max-width: 120px;
  line-height: 1.25;
}

.more-food-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.search-context {
  font-size: 12px !important;
  line-height: 1.4;
}

/* Keyboard focus */
button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 4px;
}

/* Responsive layout */
@media (max-width: 575px) {
  .bulletin-board-container {
    padding: 20px;
  }

  .sticky-note-card {
    padding: 18px;
  }

  .board-intro {
    font-size: 18px;
  }

  .primary-button,
  .secondary-button {
    max-width: 100%;
  }

  .urgent-item {
    flex-wrap: wrap;
  }

  .urgent-action {
    margin-left: auto;
    max-width: none;
  }

  .board-title {
    font-size: clamp(26px, 7vw, 36px);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sticky-note-card,
  .urgency-badge {
    animation: none;
  }

  .sticky-note-card,
  .primary-button,
  .secondary-button {
    transition: none;
  }

  .primary-button:hover,
  .secondary-button:hover {
    transform: none;
  }
}
</style>