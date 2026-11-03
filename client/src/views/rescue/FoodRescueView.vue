<script setup>
  import {ref, reactive} from 'vue';
  import Header from '@/components/rescue/RescueHeader.vue';
  import SharingCorner from '@/components/rescue/SharingCorner.vue'
  import MyListings from '@/components/rescue/MyListings.vue'
  import RescueMap from '@/components/rescue/RescueMap.vue'

  const sharingSummary = reactive({
  received: 6,
  newRequests: 2,
  needsReply: 3,
  sent: 2,
  awaitingReply: 1,
  listings: 24,
  available: 15,
})

const sharingSection = ref(null)

function openSharingSection(section) {
  sharingSection.value = section;
}
</script>

<template>
    <Header />

    <div class="container my-4">
      <section
        class="sharing-dashboard"
        aria-labelledby="sharing-dashboard-title"
        >
        <header class="sharing-dashboard__header">
          <h2 id="sharing-dashboard-title">Your sharing</h2>

          <button
            type="button"
            class="sharing-dashboard__add"
            @click="openSharingSection('add')"
          >
            <svg
              class="sharing-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>

            Share food
          </button>
        </header>

        <div class="sharing-dashboard__grid">
          <!-- Requests received -->
          <button
            type="button"
            class="sharing-stat sharing-stat--received"
            @click="openSharingSection('received')"
          >
            <span class="sharing-stat__heading">
              <span class="sharing-stat__label">
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path
                    d="m5.45 5.11-3.1 5.34A3 3 0 0 0 2 11.96V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6.04a3 3 0 0 0-.35-1.51l-3.1-5.34A2 2 0 0 0 16.82 4H7.18a2 2 0 0 0-1.73 1.11Z"
                  />
                </svg>

                Requests received
              </span>

              <span
                v-if="sharingSummary.newRequests > 0"
                class="sharing-stat__badge"
                :aria-label="`${sharingSummary.newRequests} new requests`"
              >
                {{ sharingSummary.newRequests }} NEW
              </span>
            </span>

            <span class="sharing-stat__value-row">
              <span class="sharing-stat__total">
                {{ sharingSummary.received }}
                <span class="visually-hidden">requests received</span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail">
              {{
                sharingSummary.needsReply > 0
                  ? `${sharingSummary.needsReply} awaiting reply`
                  : 'All caught up'
              }}
            </span>
          </button>

          <!-- Requests sent -->
          <button
            type="button"
            class="sharing-stat sharing-stat--sent"
            @click="openSharingSection('sent')"
          >
            <span class="sharing-stat__heading">
              <span class="sharing-stat__label">
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>

                Requests sent
              </span>
            </span>

            <span class="sharing-stat__value-row">
              <span class="sharing-stat__total">
                {{ sharingSummary.sent }}
                <span class="visually-hidden">requests sent</span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail">
              {{
                sharingSummary.awaitingReply > 0
                  ? `${sharingSummary.awaitingReply} awaiting reply`
                  : 'No replies pending'
              }}
            </span>
          </button>

          <!-- My listings -->
          <button
            type="button"
            class="sharing-stat sharing-stat--listings"
            @click="openSharingSection('listings')"
          >
            <span class="sharing-stat__heading">
              <span class="sharing-stat__label">
                <svg
                  class="sharing-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="17" rx="2" />
                  <path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5" />
                </svg>

                My listings
              </span>
            </span>

            <span class="sharing-stat__value-row">
              <span class="sharing-stat__total">
                {{ sharingSummary.listings }}
                <span class="visually-hidden">listings</span>
              </span>

              <svg
                class="sharing-icon sharing-stat__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

            <span class="sharing-stat__detail">
              {{ sharingSummary.available }} available
            </span>
          </button>
        </div>
      </section>
    </div>

    <MyListings
      :activeSection = "sharingSection"
      @close = "sharingSection = null"
    />

    <SharingCorner 
      :activeSection = "sharingSection"
      @close = "sharingSection = null"
    />

    <RescueMap />

</template>

<style scoped>
.primary-button {
      font-family: var(--font-sans);
      padding: 16px 26px;
      border: 2px solid var(--ink);
      border-radius: 14px 11px 16px 10px;
      background: var(--aqua);
      color: white;
      font-size: 18px;
      font-weight: 500;
      box-shadow: var(--shadow-small);
      transition: transform 150ms ease, box-shadow 150ms ease;
      cursor: pointer;
      text-wrap: nowrap;
}
.primary-button:hover:not(:disabled) {
      box-shadow: 1px 2px 0 var(--ink);
      transform: translate(2px, 2px);
      background: #0d968b;
      color: white;
    }

.sharing-basket{
    background: var(--aqua-soft);
    border: 3px solid var(--ink);
    border-radius: 24px;
    padding: 36px;
    box-shadow: var(--shadow-paper);
    position: relative;
    font-family: var(--font-display);
}

.row-items{
  display: flex;
}

.item-expiring, .expire-soon {
  text-align: center;
  border-radius: 9px;
  font-weight: 500;
  padding: 8px 24px;
  font-family: var(--font-sans);
}

.item-expiring {
  background-color: var(--paper-bright);
}

.expire-soon{
  background-color: #FFDD69;
  color: black;
}
.sharing-dashboard {
  padding: 18px 24px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 5px 6px 0 var(--ink);
  font-family: var(--font-sans);
}

.sharing-dashboard,
.sharing-dashboard * {
  box-sizing: border-box;
}

.sharing-dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.sharing-dashboard__header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(24px, 2.2vw, 29px);
  font-weight: 700;
  line-height: 1.3;
}

/* Shared icon style */
.sharing-icon {
  display: block;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Add listing */
.sharing-dashboard__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  padding: 16px 26px;
  border: 2px solid var(--ink);
  border-radius: 14px 11px 16px 10px;
  background: var(--aqua);
  color: white;
  font-size: 18px;
  font-weight: 500;
  box-shadow: var(--shadow-small);
  transition: transform 150ms ease, box-shadow 150ms ease;
  cursor: pointer;
  text-wrap: nowrap;
}

.sharing-dashboard__add:hover(:disabled){
  box-shadow: 1px 2px 0 var(--ink);
  transform: translate(2px, 2px);
  background: #0d968b;
  color: white;
}

.sharing-dashboard__add:hover {
  background: #0d968b;
}

.sharing-dashboard__add:active {
  transform: translateY(2px);
}

/* Dashboard cards */
.sharing-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.sharing-stat {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  min-height: 182px;
  padding: 14px 18px;
  border: 2px solid transparent;
  border-radius: 16px;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}

.sharing-stat--received {
  background: #fff0c2;
}

.sharing-stat--sent {
  background: var(--aqua-soft);
}

.sharing-stat--listings {
  background: #f0f4e5;
}

.sharing-stat__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-height: 36px;
}

.sharing-stat__label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-size: 23px;
  font-weight: 700;
  line-height: 1.3;
}

.sharing-stat__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--coral);
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.sharing-stat__value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sharing-stat__total {
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sharing-stat__chevron {
  width: 24px;
  height: 24px;
}

.sharing-stat__detail {
  margin-top: auto;
  font-family: var(--font-sans);
  font-size: 25px;
  line-height: 1.3;
}

.sharing-dashboard button:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 4px;
}

@media (hover: hover) {
  .sharing-stat:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 0 rgba(18, 63, 59, 0.15);
  }
}

@media (max-width: 1199px) {
  .sharing-dashboard__grid {
    gap: 12px;
  }

  .sharing-stat {
    padding: 14px;
  }

  .sharing-stat__label {
    gap: 8px;
    font-size: 21px;
  }

  .sharing-stat__detail {
    font-size: 22px;
  }
}

@media (max-width: 767px) {
  .sharing-dashboard {
    padding: 18px;
  }

  .sharing-dashboard__grid {
    grid-template-columns: 1fr;
  }

  .sharing-stat {
    min-height: 160px;
    padding: 16px 20px;
  }
}

@media (max-width: 399px) {
  .sharing-dashboard__header {
    align-items: stretch;
    flex-direction: column;
  }

  .sharing-dashboard__add {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sharing-stat,
  .sharing-dashboard__add {
    transition: none;
  }

  .sharing-stat:hover,
  .sharing-dashboard__add:active {
    transform: none;
  }
}
</style>