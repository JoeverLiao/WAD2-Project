<script setup>
    import { computed, onMounted, nextTick, ref } from 'vue'
    import L from 'leaflet';
    import 'leaflet/dist/leaflet.css';

    const foodItems = ref([
    {
        id: 1,
        name: 'Garden tomatoes',
        description: 'Sweet, ripe and grown in Sarah’s garden.',
        quantity: '500 g · 1 punnet',
        useBy: 'Tomorrow',
        distanceKm: 0.3,
        category: 'Fruit & veg',
        pickupDay: 'today',
        pickup: 'Today, 4–7 pm',
        availability: 'available',
        person: 'Sarah M.',
        image: '',
        icon: '🍅',
        lat: 1.3000,
        lng: 103.8500,
    },
    {
        id: 2,
        name: 'Sourdough loaf',
        description: 'Bakery loaf · Opened · Contains wheat.',
        quantity: '1 whole loaf',
        useBy: 'Tomorrow',
        distanceKm: 0.6,
        category: 'Bakery',
        pickupDay: 'today',
        pickup: 'Today, 5–8 pm',
        availability: 'available',
        person: 'Jamie R.',
        image: '',
        icon: '🍞',
        lat: 1.3020,
        lng: 103.8530,
    },
    {
        id: 3,
        name: 'Veggie box',
        description: 'Carrots and seasonal greens · Bring a bag.',
        quantity: '1 box · About 1.5 kg',
        useBy: 'In 3 days',
        distanceKm: 0.9,
        category: 'Fruit & veg',
        pickupDay: 'tomorrow',
        pickup: 'Tomorrow, 9–11 am',
        availability: 'available',
        person: 'Priya K.',
        image: '',
        icon: '🥬',
        lat: 1.3050,
        lng: 103.8480,
    },
    ])

    const search = ref('')
    const category = ref('all')
    const distance = ref('2')
    const pickupDay = ref('any')
    const availability = ref('all')
    const selectedId = ref(1)
    const mapContainer = ref(null)
    const cardElements = new Map()

    const filteredItems = computed(() =>
    foodItems.value
        .filter(
        item =>
            `${item.name} ${item.description}`
            .toLowerCase()
            .includes(search.value.trim().toLowerCase()) &&
            (category.value === 'all' ||
            item.category === category.value) &&
            item.distanceKm <= Number(distance.value) &&
            (pickupDay.value === 'any' ||
            item.pickupDay === pickupDay.value) &&
            (availability.value === 'all' ||
            item.availability === availability.value),
        )
        .sort((a, b) => a.distanceKm - b.distanceKm),
    )

    function distanceLabel(km) {
    return km < 1
        ? `${Math.round(km * 1000)} m`
        : `${km} km`
    }

    function setCardElement(id, element) {
    element
        ? cardElements.set(id, element)
        : cardElements.delete(id)
    }

    async function selectItem(item, scrollToCard = false) {
    selectedId.value = item.id

    // TODO: Your Leaflet code can panTo([item.lat, item.lng]) here.
    // Call selectItem(item, true) from a future Leaflet marker click handler.
    if (scrollToCard) {
        await nextTick()

        cardElements.get(item.id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        })
    }
    }

    // TODO: Initialize Leaflet in onMounted using mapContainer.value.
    // Use filteredItems for visible markers, and remove your map in onUnmounted.
    // No Leaflet import, tiles, map instance or third-party map assets are included.

    const requestDialog = ref(null)
    const requestItem = ref(null)
    const proposedPickup = ref('')
    const requestMessage = ref('')
    const notice = ref('')

    function openRequest(item) {
    selectedId.value = item.id
    requestItem.value = item
    proposedPickup.value = item.pickup
    requestMessage.value = ''

    requestDialog.value.showModal()
    }

    function prepareRequest() {
    notice.value = `Demo request prepared for ${requestItem.value.name}: ${proposedPickup.value}. Nothing has been sent.`

    requestDialog.value.close()
    }

    let map = null;
    const markers = [];

    onMounted(() => {
        
        map = L.map('food-rescue-map').setView([1.3008, 103.8555], 14)

        L.tileLayer(
        'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=a3soRYRrrsDYTIFau8f0',
        {
            attribution:
            '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
        },
        ).addTo(map)

    })
</script>

<template>
    <section
        class="explore-nearby container py-4"
        aria-labelledby="explore-title"
    >
        <header class="explore-heading">
        <div>

            <h2 id="explore-title">Explore nearby food</h2>

            <p class="muted">
            Your next good meal might be a short walk away.
            </p>
        </div>

        <span class="location-label">⌖ Your neighbourhood</span>
        </header>

        <!-- Search and filters -->
        <div class="explore-filters">
        <label class="search-field">
            <span class="visually-hidden">Search nearby food</span>

            <input
            v-model="search"
            type="search"
            placeholder="What are you hungry for?"
            />
        </label>

        <label>
            <span class="visually-hidden">Food category</span>

            <select v-model="category">
            <option value="all">All categories</option>
            <option>Fruit &amp; veg</option>
            <option>Bakery</option>
            </select>
        </label>

        <label>
            <span class="visually-hidden">Maximum distance</span>

            <select v-model="distance">
            <option value="0.5">Within 500 m</option>
            <option value="1">Within 1 km</option>
            <option value="2">Within 2 km</option>
            </select>
        </label>

        <label>
            <span class="visually-hidden">Pickup day</span>

            <select v-model="pickupDay">
            <option value="any">Any time</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            </select>
        </label>

        <label>
            <span class="visually-hidden">Availability</span>

            <select v-model="availability">
            <option value="all">All availability</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            </select>
        </label>
        </div>

        <!-- Results count -->
        <div class="results-heading">
        <p>
            {{ filteredItems.length }} good
            {{ filteredItems.length === 1 ? 'find' : 'finds' }}
            nearby
        </p>

        <span class="muted">Closest to you first</span>
        </div>

        <div class="explore-layout">
            <!-- Leaflet map placeholder -->
            <div class="map-panel">
                <!-- Keep this element empty when mounting Leaflet into mapContainer. 
                <div
                ref="mapContainer"
                class="leaflet-mount"
                aria-label="Nearby food map"
                ></div>

                Remove this overlay once Leaflet is connected. -->
                <!--<div class="map-placeholder">
                <span aria-hidden="true">⌖</span>
                <strong>Your Leaflet map goes here</strong>
                <p>Map markers can select the matching food card.</p>
                </div>>-->
                <div id="food-rescue-map"></div>
            </div>

            <!-- Food listings -->
            <div
                class="food-results"
                tabindex="0"
                aria-label="Scrollable nearby food listings"
            >
                <article
                v-for="item in filteredItems"
                :key="item.id"
                :ref="element => setCardElement(item.id, element)"
                class="food-card"
                :class="{ selected: selectedId === item.id }"
                >
                <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="food-photo"
                />

                <div
                    v-else
                    class="photo-placeholder"
                    aria-hidden="true"
                >
                    {{ item.icon }}
                </div>

                <div class="food-details">
                    <div class="food-heading">
                    <h3>
                        <button
                        type="button"
                        class="food-title-button"
                        :aria-pressed="selectedId === item.id"
                        @click="selectItem(item)"
                        >
                        {{ item.name }}
                        </button>
                    </h3>

                    <span class="food-distance">
                        ⌖ {{ distanceLabel(item.distanceKm) }}
                    </span>
                    </div>

                    <p class="food-description">
                    {{ item.description }}
                    </p>

                    <dl class="food-facts">
                    <div>
                        <dt>Quantity</dt>
                        <dd>{{ item.quantity }}</dd>
                    </div>

                    <div>
                        <dt>Use by</dt>
                        <dd>{{ item.useBy }}</dd>
                    </div>
                    </dl>

                    <div class="food-footer">
                    <div>
                        <span class="detail-label">Pickup</span>
                        <p>{{ item.pickup }}</p>
                    </div>

                    <button
                        type="button"
                        class="primary-button card-action"
                        :disabled="item.availability !== 'available'"
                        @click="openRequest(item)"
                    >
                        Request collection →
                    </button>
                    </div>
                </div>
                </article>

                <p v-if="!filteredItems.length" class="empty-state">
                No matching food. Try another category or a larger distance.
                </p>
            </div>
        </div>

        <p v-if="notice" class="demo-notice" role="status">
        {{ notice }}
        </p>

        <!-- Collection request dialog -->
        <dialog
        ref="requestDialog"
        class="request-dialog"
        aria-labelledby="request-dialog-title"
        >
        <form @submit.prevent="prepareRequest">
            <h3 id="request-dialog-title">
            Request {{ requestItem?.name }}
            </h3>

            <p class="muted">
            {{ requestItem?.person }}’s pickup window:
            {{ requestItem?.pickup }}
            </p>

            <label>
            Your requested pickup
            <input v-model="proposedPickup" required />
            </label>

            <label>
            Message
            <textarea
                v-model="requestMessage"
                placeholder="Say hello or suggest a different time…"
                rows="3"
            ></textarea>
            </label>

            <div class="dialog-actions">
            <button
                type="button"
                class="secondary-button"
                @click="requestDialog.close()"
            >
                Cancel
            </button>

            <button type="submit" class="primary-button">
                Prepare request
            </button>
            </div>
        </form>
        </dialog>
    </section>
</template>

<style scoped>

#food-rescue-map {
        height: 100%;
        width: 100%;
        z-index: 0;
}
.explore-nearby {
  color: var(--ink);
  font: 19px/1.4 var(--font-sans);
}

.explore-nearby * {
  box-sizing: border-box;
}

p,
h2,
h3,
dl,
dd {
  margin: 0;
}

h2,
h3 {
  font-family: var(--font-display);
  font-weight: 700;
}

h2 {
  font-size: clamp(28px, 3vw, 36px);
}

h3 {
  font-size: 25px;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.muted {
  color: var(--muted);
}

/* Section heading */
.explore-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;
}

.explore-heading h2 {
  margin: 8px 0;
}

.eyebrow {
  color: var(--aqua);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.location-label {
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 8px 14px;
  background: var(--paper-bright);
  font-size: 16px;
}

/* Search and filters */
.explore-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  border: 1.5px solid var(--ink);
  border-radius: 14px;
  background: var(--paper-bright);
}

.search-field {
  flex: 1 1 220px;
}

input,
select,
textarea {
  width: 100%;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper-bright);
  color: var(--ink);
}

.search-field input {
  border: 0;
}

.results-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0 12px;
  font-size: 16px;
}

/* Map and results layout */
.explore-layout {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  align-items: start;
  gap: 22px;
}

.map-panel {
  position: relative;
  height: 700px;
  border: 1.5px solid var(--ink);
  border-radius: 18px;
  overflow: hidden;
  background: var(--aqua-soft);
}

.leaflet-mount {
  width: 100%;
  height: 100%;
}

.map-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  text-align: center;
  pointer-events: none;
  color: var(--muted);
}

.map-placeholder > span {
  font-size: 60px;
}

.map-placeholder strong {
  font-family: var(--font-display);
  color: var(--ink);
  font-size: 26px;
}

.food-results {
  display: grid;
  align-content: start;
  gap: 14px;
  max-height: 700px;
  overflow-y: auto;
  padding: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--aqua) var(--aqua-soft);
}

/* Food cards */
.food-card {
  display: grid;
  grid-template-columns: 28% 1fr;
  border: 1.5px solid var(--ink);
  border-radius: 16px;
  overflow: hidden;
  background: var(--paper-bright);
}

.food-card.selected {
  border-color: var(--aqua);
  box-shadow:
    inset 0 0 0 1px var(--aqua),
    3px 3px 0 var(--aqua-soft);
}

.food-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  display: grid;
  place-items: center;
  min-height: 180px;
  font-size: 64px;
  background: var(--paper);
}

.food-details {
  display: grid;
  gap: 10px;
  padding: 16px;
  min-width: 0;
}

.food-heading,
.food-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.food-title-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
}

.food-distance {
  white-space: nowrap;
  font-size: 18px;
}

.food-description {
  font-size: 19px;
}

.food-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.food-facts dt,
.detail-label {
  display: block;
  font-size: 14px;
  text-transform: uppercase;
  color: var(--muted);
}

.food-facts dd {
  font-size: 22px;
}

/* Buttons */
.card-action,
.secondary-button,
.dialog-actions .primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 14px;
  border: 1.5px solid var(--ink);
  border-radius: 10px;
  color: var(--paper-bright);
  background: var(--aqua);
  font-size: 18px;
}

.secondary-button {
  color: var(--ink);
  background: var(--paper);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  padding: 28px;
}

.demo-notice {
  margin-top: 14px;
  color: var(--muted);
}

/* Collection request dialog */
.request-dialog {
  width: min(500px, calc(100vw - 32px));
  padding: 24px;
  border: 2px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  color: var(--ink);
}

.request-dialog::backdrop {
  background: rgba(18, 63, 59, 0.4);
}

.request-dialog form,
.request-dialog label {
  display: grid;
  gap: 8px;
}

.request-dialog form {
  gap: 18px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* Responsive layout */
@media (max-width: 1100px) {
  .explore-layout {
    grid-template-columns: 1fr;
  }

  .map-panel {
    height: 360px;
  }

  .food-results {
    max-height: 650px;
  }
}

@media (max-width: 575px) {
  .food-card {
    grid-template-columns: 90px minmax(0, 1fr);
  }

  .food-details {
    padding: 12px;
  }

  .photo-placeholder {
    font-size: 42px;
  }

  .food-heading h3 {
    font-size: 23px;
  }

  .food-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .food-facts {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>