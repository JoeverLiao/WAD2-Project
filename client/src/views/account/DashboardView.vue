<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useInventoryStore, storageAreas, isInArea } from '../../stores/inventory.js'
import { getDaysRemaining, getExpiryStatus } from '../../utils/expiryUtils.js'
import { useAuthStore } from '../../stores/auth.js'

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)

// The user's Smart Fridge items, loaded from the backend
const inventoryStore = useInventoryStore()
const { items, loading, error } = storeToRefs(inventoryStore)

// Every item tagged with its area title and days left, most urgent first
const allExpiryItems = computed(() => {
  const now = new Date()

  return items.value
    .map((item) => {
      const area = storageAreas.find((a) => isInArea(item, a))
      const days = getDaysRemaining(item.expiresAt, now)
      return { ...item, storageLabel: area?.title ?? item.storage, daysRemaining: days, status: getExpiryStatus(days) }
    })
    .sort((a, b) => {
      if (a.daysRemaining === null) return 1
      if (b.daysRemaining === null) return -1
      return a.daysRemaining - b.daysRemaining
    })
})

// Not expired yet, soonest first: still worth cooking
const urgentItems = computed(() => allExpiryItems.value.filter((i) => i.status === 'eat-soon' || i.status === 'fresh').slice(0, 3))

// Per-area summary for the storage cards
const areaSummaries = computed(() =>
  storageAreas.map((area) => {
    const areaItems = allExpiryItems.value.filter((i) => isInArea(i, area))
    const healthy = areaItems.filter((i) => i.status === 'fresh').length
    return {
      ...area,
      count: areaItems.length,
      healthyPercent: areaItems.length ? Math.round((healthy / areaItems.length) * 100) : null,
      expiringSoon: areaItems.filter((i) => i.status === 'eat-soon' || i.status === 'expired'),
    }
  }),
)

// Real TheMealDB recipes ranked by how many of the user's ingredients they use.
// Ingredients that expire soonest go first, so suggestions help use them up.
const recipes = ref([])
const recipesLoading = ref(false)
const recipesError = ref('')

const usableIngredients = computed(() => [
  ...new Set(
    allExpiryItems.value
      .filter((i) => i.status !== 'expired' && Number(i.quantity) > 0)
      .map((i) => i.name.toLowerCase()),
  ),
].slice(0, 8))

async function loadRecipes(ingredients) {
  if (!ingredients.length) {
    recipes.value = []
    return
  }
  recipesLoading.value = true
  recipesError.value = ''
  try {
    const response = await fetch(`/api/freshness/recipes?ingredients=${encodeURIComponent(ingredients.join(','))}`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error(`Recipes HTTP ${response.status}`)
    const data = await response.json()
    recipes.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error('Failed to load recipes:', err)
    recipes.value = []
    recipesError.value = 'Unable to load recipe suggestions right now.'
  } finally {
    recipesLoading.value = false
  }
}

// Only refetch when the ingredient list actually changes
watch(() => usableIngredients.value.join(','), () => loadRecipes(usableIngredients.value), { immediate: true })

// Pill copy + colour for the "time left" cards and expiry list
function useByLabel(days) {
  if (days === null) return 'No date'
  if (days < 0) return 'Expired'
  if (days === 0) return 'Use by today'
  if (days === 1) return 'Use by tomorrow'
  return `Use by in ${days} days`
}

function pillClass(days) {
  if (days === null) return 'pill-muted'
  return days <= 1 ? 'pill-coral' : 'pill-lime'
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Expiry list filter chips
const expiryFilters = [
  { id: 'all', label: 'All' },
  { id: 'eat-soon', label: 'Eat soon' },
  { id: 'fresh', label: 'Fresh' },
  { id: 'expired', label: 'Expired' },
]
const activeFilter = ref('all')
const filteredExpiryItems = computed(() =>
  activeFilter.value === 'all' ? allExpiryItems.value : allExpiryItems.value.filter((i) => i.status === activeFilter.value),
)
function filterCount(id) {
  return id === 'all' ? allExpiryItems.value.length : allExpiryItems.value.filter((i) => i.status === id).length
}

// Hero stat counts up from 0 (and re-animates when the total changes)
const displayedCount = ref(0)
function animateCount(target) {
  if (prefersReducedMotion()) {
    displayedCount.value = target
    return
  }
  const start = displayedCount.value
  const startTime = performance.now()
  const duration = 900
  const step = (now) => {
    const t = Math.min((now - startTime) / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    displayedCount.value = Math.round(start + (target - start) * eased)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
watch(() => allExpiryItems.value.length, animateCount)

// Healthy bars grow from 0 once the page has painted
const barsReady = ref(false)
onMounted(() => {
  inventoryStore.loadInventory()
  animateCount(allExpiryItems.value.length)
  requestAnimationFrame(() => (barsReady.value = true))
})

// v-reveal: fade/slide an element in when it scrolls into view
const vReveal = {
  mounted(el, binding) {
    el.style.setProperty('--reveal-delay', `${binding.value ?? 0}ms`)
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      el.classList.add('is-visible')
      return
    }
    el.classList.add('reveal')
    el._revealObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        el.classList.add('is-visible')
        el._revealObserver.disconnect()
      },
      { threshold: 0.15 },
    )
    el._revealObserver.observe(el)
  },
  unmounted(el) {
    el._revealObserver?.disconnect()
  },
}
</script>

<template>
  <div class="dashboard-page">
  <section aria-label="Dashboard" class="dashboard container-xl py-4">
      <!-- ================= HERO ================= -->
      <header class="hero row align-items-center g-4 mb-5">
        <div v-reveal class="col-lg-7">
          <p class="eyebrow">
              ✿ {{ isAuthenticated && user?.name ? `${user.name.toUpperCase()}'S` : 'YOUR' }} KITCHEN AT A GLANCE
          </p>
          <h1 class="hero-title">
            Good food, <span class="scribble">well kept.</span>
          </h1>
          <p class="hero-sub">
            See what's in your storage, what needs eating soon,<br class="d-none d-md-inline" />
            and what you can cook with it tonight.
          </p>
        </div>

        <div v-reveal="150" class="col-lg-5 d-flex align-items-center justify-content-lg-end gap-4 flex-wrap">
          <div class="stamp">
            <svg class="stamp-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
            <p class="stamp-title" :aria-label="`${allExpiryItems.length} items tracked.`">{{ displayedCount }} items tracked.</p>
            <p class="stamp-sub">across {{ storageAreas.length }} storage areas</p>
          </div>
          <RouterLink :to="{ name: 'fridge' }" class="btn-cta">
            <span aria-hidden="true">+</span> Add food
          </RouterLink>
        </div>
      </header>

      <p v-if="loading" class="status-note mb-4" role="status">Loading your Smart Fridge…</p>
      <div v-else-if="error" class="status-note status-error mb-4" role="alert">
        {{ error }}
        <button type="button" class="chip ms-2" @click="inventoryStore.loadInventory()">Retry</button>
      </div>

      <!-- ================= TIME LEFT PANEL ================= -->
      <section v-reveal class="panel panel-tint mb-5" aria-labelledby="time-left-heading">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
          <div class="d-flex align-items-center gap-3">
            <span class="clock-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
                <path class="clock-hand clock-hand-hour" d="M12 12V8" />
                <path class="clock-hand clock-hand-minute" d="M12 12l2.5 1.5" />
              </svg>
            </span>
            <div>
              <h2 id="time-left-heading" class="panel-title">Quick Bites. Use them before they're gone!</h2>
              <p class="panel-sub">From your storage · Use them up first</p>
            </div>
          </div>
          <p class="scrawl d-none d-md-block">Let's save these! ↘</p>
        </div>

        <div v-if="urgentItems.length" class="row g-3">
          <div v-for="(item, index) in urgentItems" :key="item.id" v-reveal="120 + index * 110" class="col-md-4">
            <article class="item-card">
              <span class="item-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15Zm0 0 8-8" /></svg>
              </span>
              <div class="flex-grow-1 min-w-0">
                <h3 class="item-name">{{ item.name }}</h3>
                <p class="item-meta">Qty {{ item.quantity }}{{ item.unit ? ` ${item.unit}` : '' }} · {{ item.storageLabel }}</p>
                <span class="pill" :class="[pillClass(item.daysRemaining), { 'pill-pulse': item.daysRemaining !== null && item.daysRemaining <= 1 }]">
                  {{ useByLabel(item.daysRemaining) }}
                </span>
              </div>
              <RouterLink :to="{ name: 'freshness-recipes', query: { search: item.name } }" class="link-arrow">
                Cook <span aria-hidden="true">→</span>
              </RouterLink>
            </article>
          </div>
        </div>
        <p v-else-if="!allExpiryItems.length" class="empty">Your fridge is empty. Add some food to start tracking.</p>
        <p v-else class="empty">Nothing urgent. Your fridge is in great shape!</p>
      </section>

      <div class="row g-4">
        <!-- ================= LEFT COLUMN ================= -->
        <div class="col-lg-7 d-flex flex-column gap-4">
          <h2 class="section-title">Your storage units</h2>

          <article v-for="(area, index) in areaSummaries" :key="area.id" v-reveal="index * 100" class="panel storage-card">
            <div class="d-flex gap-3">
              <div class="preview-box" aria-hidden="true">{{ area.icon }}</div>

              <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <div>
                    <h3 class="storage-name">{{ area.title }}</h3>
                    <p class="area-meta">{{ area.count }} {{ area.count === 1 ? 'item' : 'items' }} · {{ area.subtitle }}</p>
                  </div>
                  <span v-if="area.healthyPercent !== null" class="pill pill-aqua">Healthy {{ area.healthyPercent }}%</span>
                </div>

                <div
                  v-if="area.healthyPercent !== null"
                  class="health-bar mb-3"
                  role="progressbar"
                  :aria-valuenow="area.healthyPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`${area.title} freshness`"
                >
                  <span class="health-fill" :style="{ width: barsReady ? `${area.healthyPercent}%` : '0%' }" />
                </div>

                <p class="label">Expiring soon</p>
                <div v-if="area.expiringSoon.length" class="d-flex flex-wrap gap-2">
                  <span v-for="item in area.expiringSoon" :key="item.id" class="pill pill-coral">
                    {{ item.name }}
                  </span>
                </div>
                <p v-else class="empty m-0">{{ area.count ? 'None. Nice work!' : 'Empty for now.' }}</p>
              </div>
            </div>

            <div class="storage-foot">
              <RouterLink :to="{ name: 'fridge' }" class="link-arrow">
                Open {{ area.title }} <span aria-hidden="true">→</span>
              </RouterLink>
            </div>
          </article>

          <!-- Recipe suggestions from the user's ingredients -->
          <section v-reveal class="panel" aria-labelledby="recipes-heading">
            <h2 id="recipes-heading" class="panel-title mb-2">Try these recipes!</h2>
            <p v-if="recipesLoading" class="empty m-0" role="status">Finding recipes for your ingredients…</p>
            <p v-else-if="recipesError" class="empty m-0" role="alert">{{ recipesError }}</p>
            <p v-else-if="!recipes.length" class="empty m-0">
              {{ usableIngredients.length ? 'No recipes found for your ingredients yet.' : 'Add some food to get recipe ideas.' }}
            </p>
            <ul v-else class="recipe-list">
              <li v-for="recipe in recipes.slice(0, 3)" :key="recipe.id">
                <RouterLink :to="{ name: 'recipe-detail', params: { id: String(recipe.id) } }" class="recipe-link">
                  <div>
                    <strong class="recipe-name">{{ recipe.name }}</strong>
                    <span v-if="recipe.ingredients?.length" class="recipe-meta">
                      {{ recipe.matchedIngredients?.length ?? 0 }} of {{ recipe.ingredients.length }} ingredients in your fridge
                    </span>
                  </div>
                  <span class="link-arrow">View <span aria-hidden="true">→</span></span>
                </RouterLink>
              </li>
            </ul>
          </section>
        </div>

        <!-- ================= RIGHT COLUMN ================= -->
        <div class="col-lg-5 d-flex flex-column gap-4">
          <h2 class="section-title">Expiry list</h2>

          <div v-reveal class="filter-chips" role="group" aria-label="Filter expiry list">
            <button
              v-for="filter in expiryFilters"
              :key="filter.id"
              type="button"
              class="chip"
              :class="{ 'is-active': activeFilter === filter.id }"
              :aria-pressed="activeFilter === filter.id"
              @click="activeFilter = filter.id"
            >
              {{ filter.label }} <span class="chip-count">{{ filterCount(filter.id) }}</span>
            </button>
          </div>

          <div v-reveal="100" class="panel p-0 expiry-wrap">
            <table class="expiry-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Storage</th>
                  <th scope="col">Qty</th>
                  <th scope="col"><span class="visually-hidden">Status</span></th>
                </tr>
              </thead>
              <TransitionGroup tag="tbody" name="row">
                <tr v-for="item in filteredExpiryItems" :key="item.id">
                  <td class="fw-bold">{{ item.name }}</td>
                  <td class="muted">{{ item.storageLabel }}</td>
                  <td>{{ item.quantity }}</td>
                  <td><span class="pill pill-sm" :class="pillClass(item.daysRemaining)">{{ useByLabel(item.daysRemaining) }}</span></td>
                </tr>
                <tr v-if="!filteredExpiryItems.length" key="empty">
                  <td colspan="4" class="text-center py-4 muted">
                    {{ allExpiryItems.length ? 'Nothing in this group right now.' : 'Your fridge is empty. Add some food to start tracking.' }}
                  </td>
                </tr>
              </TransitionGroup>
            </table>
          </div>

          <!-- Donation callout -->
          <section v-reveal class="donate" aria-labelledby="donate-heading">
            <svg class="donate-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
            <h2 id="donate-heading" class="donate-title">A little extra? <span class="scribble">Pass it on.</span></h2>
            <p class="donate-sub">Good food deserves a home, not a bin.</p>
            <RouterLink :to="{ name: 'food-rescue' }" class="btn-cta">
              Neighbour rescue <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </div>
      </div>
  </section>
  </div>
</template>

<style scoped>
/* Same page shell as Home: grid paper, handwritten fonts, ink text */
.dashboard-page {
  --aqua-dark: #087d73;
  min-height: 100svh;
  color: var(--ink);
  background-color: #eafaf7;
  background-image:
    linear-gradient(rgb(33 144 133 / 7%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(33 144 133 / 7%) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: var(--font-sans);
  font-size: 1.1rem;
}
.dashboard {
  max-width: 1200px;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- shared bits ---------- */
.panel {
  background: var(--paper-bright);
  border: 2px solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--shadow-paper);
  padding: 1.5rem;
}
.panel-tint {
  background: var(--aqua-soft);
}
.panel-title {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 700;
}
.panel-sub {
  margin: 0;
  color: var(--muted);
}

.section-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
}

.label {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 0.95rem;
}
.empty {
  color: var(--muted);
}
.muted {
  color: var(--muted);
}

.pill {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 0.95rem;
  line-height: 1.4;
  white-space: nowrap;
}
.pill-sm {
  padding: 1px 10px;
  font-size: 0.85rem;
}
.pill-coral {
  background: #ffd2ca;
  color: var(--ink);
}
.pill-lime {
  background: var(--lime);
  color: var(--ink);
}
.pill-aqua {
  background: var(--aqua-soft);
  color: var(--aqua-dark);
}
.pill-muted {
  background: var(--paper);
  color: var(--muted);
}

.link-arrow {
  color: var(--aqua-dark);
  font-size: 1.1rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.link-arrow span {
  display: inline-block;
  transition: transform 150ms ease;
}
.link-arrow:hover span {
  transform: translateX(3px);
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 15px 27px;
  border: 3px solid var(--ink);
  border-radius: 16px;
  background: var(--aqua);
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 4px 5px 0 var(--ink);
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.btn-cta:hover {
  color: #fff;
  background: #0b968b;
  transform: translate(2px, 2px);
  box-shadow: 2px 3px 0 var(--ink);
}
.btn-cta:active {
  transform: translate(4px, 5px);
  box-shadow: none;
}
.btn-cta span:first-child {
  font-size: 1.8rem;
  line-height: 1;
}

.scribble {
  position: relative;
  white-space: nowrap;
}
.scribble::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.05em;
  height: 0.16em;
  border-radius: 50%;
  background: #72d7cc;
  transform: rotate(-1deg);
  z-index: -1;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  isolation: isolate;
}
/* Yellow sticker tag, same as Home's kitchen tag */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 1.25rem;
  padding: 8px 15px;
  border: 2px solid var(--ink);
  border-radius: 5px;
  background: var(--yellow);
  box-shadow: 2px 2px 0 var(--ink);
  color: var(--ink);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.eyebrow svg {
  width: 22px;
  height: 22px;
}
.hero-title {
  margin: 0 0 1rem;
  font-size: clamp(2.6rem, 6vw, 4.2rem);
  font-weight: 700;
}
.hero-sub {
  margin: 0;
  color: #366e6a;
  font-size: 1.35rem;
}

.stamp {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 260px;
  height: 190px;
  padding: 1rem;
  border: 2px dashed var(--line);
  border-radius: 50%;
  text-align: center;
  transform: rotate(-4deg);
}
.stamp-heart {
  width: 40px;
  height: 40px;
  color: var(--aqua);
}
.stamp-title {
  margin: 0.25rem 0 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
}
.stamp-sub {
  margin: 0;
  color: var(--muted);
}

/* ---------- time-left panel ---------- */
.clock-badge {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--yellow);
}
.clock-badge svg {
  width: 28px;
  height: 28px;
}
.scrawl {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 1.4rem;
  transform: rotate(-4deg);
}

.item-card {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  padding: 1.1rem;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: var(--paper-bright);
}
.item-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--lime);
  color: var(--ink);
  transform: rotate(-4deg);
}
.item-icon svg {
  width: 38px;
  height: 38px;
}
.item-name {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.4rem;
}
.item-meta {
  margin: 0 0 6px;
  color: var(--muted);
}
.min-w-0 {
  min-width: 0;
}

/* ---------- storage cards ---------- */
.storage-card {
  padding: 1.25rem;
}
.preview-box {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: var(--aqua-soft);
  color: var(--aqua-dark);
  font-size: 2.6rem;
}
.area-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.storage-name {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.45rem;
}
.storage-foot {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1.5px dashed var(--line);
  text-align: right;
}

/* ---------- recipes ---------- */
.recipe-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.recipe-list li {
  border-bottom: 1.5px dashed var(--line);
}
/* Whole row is the link to the recipe page */
.recipe-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0.7rem 0.5rem;
  color: inherit;
  text-decoration: none;
}
.recipe-link:hover .link-arrow > span {
  transform: translateX(3px);
}
.recipe-list li:last-child {
  border-bottom: none;
}
.recipe-name {
  font-size: 1.2rem;
}
.recipe-meta {
  margin-left: 8px;
  color: var(--muted);
}

/* ---------- expiry table ---------- */
.expiry-wrap {
  max-height: 480px;
  overflow: auto;
}
.expiry-table {
  width: 100%;
  border-collapse: collapse;
}
.expiry-table th {
  position: sticky;
  top: 0;
  padding: 14px 16px;
  background: var(--aqua-soft);
  border-bottom: 2px solid var(--ink);
  font-family: var(--font-display);
  font-weight: 700;
  text-align: left;
}
.expiry-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e3efec;
  vertical-align: middle;
}
.expiry-table tbody tr:last-child td {
  border-bottom: none;
}
.expiry-table tbody tr:hover {
  background: #f4fbf9;
}

/* ---------- donate callout ---------- */
.donate {
  position: relative;
  isolation: isolate;
  padding: 1.75rem 1.5rem;
  border: 2px dashed var(--line);
  border-radius: 20px;
  background: var(--paper-bright);
  text-align: center;
}
.donate-heart {
  width: 36px;
  height: 36px;
  color: var(--aqua);
}
.donate-title {
  margin: 0.25rem 0;
  font-size: 1.8rem;
  font-weight: 700;
}
.donate-sub {
  margin: 0 0 1.1rem;
  color: var(--muted);
}

/* ---------- load status ---------- */
.status-note {
  padding: 0.75rem 1rem;
  border: 2px dashed var(--line);
  border-radius: 14px;
  background: var(--paper-bright);
  color: var(--muted);
}
.status-error {
  border-color: #e8907f;
  background: #fff3f0;
  color: var(--ink);
}

/* ---------- motion ---------- */
/* Scroll reveal (class added by v-reveal) */
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 600ms ease var(--reveal-delay, 0ms),
    transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1) var(--reveal-delay, 0ms);
}
.reveal.is-visible {
  opacity: 1;
  transform: none;
}

/* Hero: beating hearts, wiggling sticker */
.stamp-heart,
.donate-heart {
  animation: heartbeat 1.8s ease-in-out infinite;
  transform-origin: center;
}
.eyebrow {
  transition: transform 200ms ease;
}
.eyebrow:hover {
  animation: sticker-wiggle 500ms ease;
}
.scribble::after {
  transform-origin: left center;
  animation: scribble-draw 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 400ms both;
}

/* Ticking clock */
.clock-hand {
  transform-origin: 12px 12px;
}
.clock-hand-minute {
  animation: clock-spin 6s linear infinite;
}
.clock-hand-hour {
  animation: clock-spin 72s linear infinite;
}
.clock-badge {
  transition: transform 200ms ease;
}
.clock-badge:hover {
  transform: rotate(-10deg) scale(1.08);
}

/* Cards lift on hover */
.item-card,
.storage-card,
.donate {
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
.item-card:hover {
  transform: translateY(-5px) rotate(-0.5deg);
  border-color: var(--ink);
  box-shadow: 4px 6px 0 var(--ink);
}
.item-card:hover .item-icon {
  animation: wiggle 600ms ease;
}
.storage-card:hover {
  transform: translateY(-4px);
  box-shadow: 6px 8px 0 var(--ink);
}
.preview-box {
  transition: transform 300ms cubic-bezier(0.3, 1.6, 0.5, 1);
}
.storage-card:hover .preview-box {
  transform: scale(1.08) rotate(-5deg);
}
.donate:hover {
  transform: rotate(-1deg) scale(1.01);
  border-color: var(--aqua);
}

/* Urgent pills breathe */
.pill-pulse {
  animation: pill-pulse 1.6s ease-in-out infinite;
}

/* Healthy bar fills on load */
.health-bar {
  height: 8px;
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  background: var(--paper);
  overflow: hidden;
}
.health-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--aqua), #72d7cc);
  transition: width 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) 300ms;
}

/* Recipe rows slide on hover */
.recipe-list li {
  transition: transform 200ms ease, background-color 200ms ease;
  border-radius: 10px;
}
.recipe-list li:hover {
  transform: translateX(6px);
  background: #f4fbf9;
}

/* Expiry filter chips */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: -0.5rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--paper-bright);
  color: var(--ink);
  font-weight: 700;
  box-shadow: 2px 2px 0 var(--ink);
  transition: transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
}
.chip:hover {
  transform: translateY(-2px);
  box-shadow: 2px 4px 0 var(--ink);
}
.chip:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.chip.is-active {
  background: var(--yellow);
}
.chip-count {
  min-width: 1.5em;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--aqua-soft);
  color: var(--aqua-dark);
  font-size: 0.85rem;
}

/* Expiry rows animate in/out when filtering */
.row-move,
.row-enter-active,
.row-leave-active {
  transition: opacity 280ms ease, transform 280ms ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
@keyframes heartbeat {
  0%, 60%, 100% { transform: scale(1); }
  15% { transform: scale(1.18); }
  30% { transform: scale(0.95); }
  45% { transform: scale(1.1); }
}
@keyframes wiggle {
  0%, 100% { transform: rotate(-4deg); }
  25% { transform: rotate(6deg); }
  50% { transform: rotate(-8deg); }
  75% { transform: rotate(3deg); }
}
@keyframes sticker-wiggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(3deg); }
  50% { transform: rotate(-3deg); }
  75% { transform: rotate(1.5deg); }
}
@keyframes scribble-draw {
  from { transform: rotate(-1deg) scaleX(0); }
  to { transform: rotate(-1deg) scaleX(1); }
}
@keyframes clock-spin {
  to { transform: rotate(360deg); }
}
@keyframes pill-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgb(255 120 100 / 45%); }
  50% { box-shadow: 0 0 0 6px rgb(255 120 100 / 0%); }
}

@media (prefers-reduced-motion: reduce) {
  .stamp-heart,
  .donate-heart,
  .scribble::after,
  .clock-hand,
  .pill-pulse,
  .eyebrow:hover,
  .item-card:hover .item-icon {
    animation: none;
  }
  .item-card:hover,
  .storage-card:hover,
  .storage-card:hover .preview-box,
  .donate:hover,
  .recipe-list li:hover,
  .chip:hover {
    transform: none;
  }
  .health-fill,
  .row-move,
  .row-enter-active,
  .row-leave-active {
    transition: none;
  }
}

@media (max-width: 575.98px) {
  .stamp {
    width: 220px;
    height: 160px;
  }
  .stamp-title {
    font-size: 1.3rem;
  }
  .item-card {
    flex-wrap: wrap;
  }
}
</style>
