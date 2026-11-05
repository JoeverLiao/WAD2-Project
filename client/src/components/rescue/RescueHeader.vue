<script setup>
import PageHeaderDoodle from '../PageHeaderDoodle.vue'
import '@/assets/rescue.css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '../../stores/auth.js'
import FoodIcon from '../FoodIcon.vue'
import { distanceLabel } from '@/services/rescueMap.js'

// Props and events
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
  <div class="rescue-header container py-4">
    <div class="bulletin-board-container fc-page-heading position-relative my-4 p-3 p-sm-4 p-lg-5" data-header-theme="rescue">
      <PageHeaderDoodle kind="rescue" />
      <div class="row align-items-center gy-4">
        <!-- Community board introduction -->
        <div class="col-12 col-lg-7 col-xl-6">
          <div class="eyebrow d-inline-flex align-items-center gap-2 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              class="bi bi-heart flex-shrink-0"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"
              />
            </svg>

            <span>{{ boardOwner }} COMMUNITY BOARD</span>
          </div>

          <h1 class="board-title">
            Got extra food?<br />
            Share with your neighbours.
          </h1>

          <p class="text-muted mb-4 board-intro">
            Too many groceries or extra cooked food? Share with neighbours just
            down the block.
          </p>

          <div
            class="d-flex flex-column flex-sm-row flex-wrap align-items-stretch align-items-sm-center gap-3"
          >

            <a
              href="#explore-map"
              class="secondary-button text-decoration-none d-inline-flex align-items-center justify-content-center btn rescue-button btn-outline-dark"
              @click.prevent="emit('explore')"
            >
              See what's nearby ↓
            </a>
          </div>
        </div>

        <!-- Expiring food sticky note -->
        <div class="col-12 col-lg-5 col-xl-5 offset-xl-1">
          <section
            class="sticky-note-card position-relative p-3 p-sm-4"
            aria-labelledby="urgent-food-title"
            :aria-busy="nearbyLoading"
          >
            <div class="push-pin position-absolute" aria-hidden="true"></div>

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

            <!-- Available expiring food -->
            <template v-if="canShowResults && preview.length">
              <p class="small text-muted mb-3">
                A little help today could save these from going to waste.
              </p>

              <div class="d-flex flex-column gap-2 mb-3">
                <div
                  v-for="item in preview"
                  :key="item._id"
                  class="p-3 bg-white rounded-3 border border-dark"
                >
                  <div class="d-flex align-items-start gap-2">
                    <span
                      class="urgent-food-icon flex-shrink-0"
                      aria-hidden="true"
                    >
                      <FoodIcon :name="item.title" />
                    </span>

                    <div class="flex-grow-1">
                      <strong class="d-block">
                        {{ item.title }}
                      </strong>

                      <p class="small text-muted mb-1">
                        {{ item.quantity }} {{ item.unit }} ·
                        {{ distanceLabel(item.distanceKm) }}
                      </p>

                      <p class="small mb-0">
                        Use by {{ expiryTime(item.expiresAt) }}
                      </p>
                    </div>
                  </div>

                  <div class="d-flex justify-content-end mt-2">
                    <button
                      type="button"
                      class="primary-button urgent-action d-inline-flex align-items-center justify-content-center btn rescue-button btn-primary"
                      @click="emit('request-listing', String(item._id))"
                    >
                      {{
                      item.hasActiveRequest
                      ? 'View request'
                      : 'Request pickup →'
                      }}
                    </button>
                  </div>
                </div>
              </div>

              <button
                v-if="expiringToday.length > preview.length"
                type="button"
                class="more-food-button small mb-3 border-0 p-0 text-start"
                @click="emit('explore')"
              >
                See {{ expiringToday.length - preview.length }} more
                expiring today →
              </button>

              <p class="small text-muted text-center mb-0">
                The owner will confirm your pickup request.
              </p>
            </template>

            <!-- Positive empty state -->
            <div
              v-else-if="canShowResults"
              class="text-center py-3"
            >
              <span
                class="expiry-clear-icon d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                aria-hidden="true"
              >
                ✓
              </span>

              <h4 class="mb-2">
                Nothing urgent today!
              </h4>

              <p class="small text-muted mx-auto mb-3">
                No available food in this area is expiring today.
                That’s a little less food needing a last-minute rescue.
              </p>

              <button
                type="button"
                class="secondary-button compact-btn d-inline-flex align-items-center justify-content-center btn rescue-button btn-outline-dark"
                @click="emit('explore')"
              >
                Discover nearby food ↓
              </button>
            </div>

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
