<script setup>
import { canonicalName, daysUntil, normalizeRecipe, analyseRecipes } from '../../utils/recipeSuggestions.js'
import EggCompanion from '../../components/analytics/VegetableCompanions.vue'

const eggTips = [
  'The expiry filters can help you focus on what needs attention.',
  'Tap the impact cards to jump to the daily graph.',
  'Use the arrows above the fridge if you have another one.',
  'Quick Bites shows you what to use up first!',
  'Tap a food in the expiry list and I’ll help you spot it.',
  'Need dinner ideas? See what you can cook with what you have!',
]
import ImpactOverview from '../../components/analytics/ImpactOverview.vue'
import { summarizeFoodEvents } from '../../utils/analyticsUtils.js'

const impactEvents = ref([])
const impactError = ref('')
const impactTotals = computed(() => summarizeFoodEvents(impactEvents.value))
async function loadImpact() {
  impactError.value = ''
  try {
    const response = await fetch('/api/analytics/history', { credentials: 'include' })
    if (!response.ok) throw new Error('Could not load your impact.')
    const data = await response.json()
    impactEvents.value = data.events || []
  } catch (error) { impactError.value = error.message }
}
onMounted(loadImpact)

import { navbarBusy, pageIsLoading, usePageLoading } from '../../utils/pageLoading.js'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'

import { useInventoryStore, storageAreas, isInArea } from '../../stores/inventory.js'
import { getDaysRemaining, getExpiryStatus } from '../../utils/expiryUtils.js'
import { useAuthStore } from '../../stores/auth.js'
import SmartKitchen from '../fridge/FridgeView.vue'

const unreadMessages = ref(0)
let unreadTimer
let unreadRequest
async function refreshUnreadMessages() {
  if (document.hidden || unreadRequest) return
  unreadRequest = new AbortController()
  try {
    const response = await fetch('/api/rescue/messages/unread-count', {
      credentials: 'include', signal: unreadRequest.signal,
    })
    if (response.ok) {
      const data = await response.json()
      unreadMessages.value = Number(data.count) || 0
    }
  } catch { /* Retry on the next poll. */ }
  finally { unreadRequest = null }
}
onMounted(() => {
  refreshUnreadMessages()
  unreadTimer = setInterval(refreshUnreadMessages, 30000)
})
onBeforeUnmount(() => {
  clearInterval(unreadTimer)
  unreadRequest?.abort()
})

const fridgeSection = ref(null)
const fridgeSectionHeight = ref(800)
let fridgeSizeObserver
onMounted(() => {
  if (!fridgeSection.value || typeof ResizeObserver === 'undefined') return
  fridgeSizeObserver = new ResizeObserver(() => {
    fridgeSectionHeight.value = fridgeSection.value.offsetHeight
  })
  fridgeSizeObserver.observe(fridgeSection.value)
})
onBeforeUnmount(() => fridgeSizeObserver?.disconnect())

const dashboardFridge = ref(null)
import FoodIcon from '../../components/FoodIcon.vue'

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)

// The user's Smart Fridge items, loaded from the backend
const inventoryStore = useInventoryStore()
const { items, loading, error } = storeToRefs(inventoryStore)
watch(items, loadImpact)
usePageLoading(loading, 'Loading your dashboard')

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

// Match the recipe page's default "From my fridge" recommendations.
const recipes = ref([])
const recipesLoading = ref(false)
const recipesError = ref('')
const recipeInventory = computed(() => items.value
  .map(item => ({ ...item, days: daysUntil(item.expiresAt) }))
  .filter(item => item.days === null || item.days >= 0))
const usableIngredients = computed(() => [...new Set(recipeInventory.value
  .map(item => canonicalName(item.name)).filter(Boolean))].slice(0, 8))
const suggestedRecipes = computed(() => analyseRecipes(recipes.value, recipeInventory.value)
  .sort((a, b) => b.rescueScore - a.rescueScore).slice(0, 5))
let recipeRequestId = 0

async function loadRecipes(ingredients) {
  const requestId = ++recipeRequestId
  if (!ingredients.length) {
    recipes.value = []
    recipesLoading.value = false
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
    if (requestId !== recipeRequestId) return
    const list = Array.isArray(data) ? data : data?.recipes ?? data?.data?.recipes ?? []
    recipes.value = list.map(normalizeRecipe).filter(recipe => recipe.id)
  } catch (err) {
    if (requestId !== recipeRequestId) return
    console.error('Failed to load recipes:', err)
    recipes.value = []
    recipesError.value = 'Unable to load recipe suggestions right now.'
  } finally {
    if (requestId === recipeRequestId) recipesLoading.value = false
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

const inventoryReady = ref(false)
const entranceReady = ref(false)
watch([inventoryReady, pageIsLoading, loading, recipesLoading, navbarBusy], ([ready, pageBusy, inventoryBusy, recipesBusy, navBusy]) => {
  if (ready && !pageBusy && !inventoryBusy && !recipesBusy && !navBusy) entranceReady.value = true
}, { flush: 'post' })

onMounted(async () => {
  await inventoryStore.loadInventory()
  inventoryReady.value = true
  animateCount(allExpiryItems.value.length)
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
  <section aria-label="Dashboard" class="dashboard container-xl py-3" :class="{ 'entrance-ready': entranceReady }">
      <header class="dashboard-header fc-page-heading">
        <div>
          <p class="eyebrow">✿ {{ isAuthenticated && user?.name ? `${user.name.toUpperCase()}'S` : 'YOUR' }} KITCHEN AT A GLANCE</p>
          <h1 class="hero-title">Good food, <span class="scribble">well kept.</span></h1>
          <p class="stamp-title" :aria-label="`${allExpiryItems.length} items tracked.`">{{ displayedCount }} items tracked.</p>
        </div>
        <aside class="quick-bites" aria-labelledby="quick-bites-heading">
          <h2 id="quick-bites-heading">◷ Quick Bites <span>Use these up first</span></h2>
          <ul v-if="urgentItems.length" class="quick-bites-list">
            <li v-for="item in urgentItems" :key="item.id">
              <strong><FoodIcon :item="item" /> {{ item.name }}</strong>
              <span>{{ useByLabel(item.daysRemaining) }}</span>
              <RouterLink :to="{ name: 'freshness-recipes', query: { search: item.name } }">Cook →</RouterLink>
            </li>
          </ul>
          <p v-else class="mb-0">{{ loading ? 'Checking your food…' : !allExpiryItems.length ? 'Add food to see what to use first.' : 'Nothing to use up right now.' }}</p>
        </aside>
      </header>

      <p v-if="loading" class="status-note mb-2" role="status">Loading your Smart Fridge…</p>
      <div v-else-if="error" class="status-note status-error mb-2" role="alert">
        {{ error }}
        <button type="button" class="chip ms-2" @click="inventoryStore.loadInventory()">Retry</button>
      </div>

      <div class="row g-3 dashboard-workspace" :style="{ '--fridge-section-height': fridgeSectionHeight + 'px' }">
        <!-- ================= LEFT COLUMN ================= -->
        <div class="col-lg-7 d-flex flex-column gap-3">
          <section ref="fridgeSection" aria-labelledby="dashboard-fridge-heading">
            <h2 id="dashboard-fridge-heading" class="section-title">Your Smart Fridge</h2>
            <SmartKitchen ref="dashboardFridge" embedded />
          </section>


        </div>

        <!-- ================= RIGHT COLUMN ================= -->
        <div class="col-lg-5 d-flex flex-column gap-3 dashboard-expiry-column">
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
                <tr v-for="item in filteredExpiryItems" :key="item.id" class="expiry-item-row">
                  <td class="fw-bold">
                    <button type="button" class="expiry-food-link" :aria-label="`Show ${item.name} in storage`" @click="dashboardFridge?.highlightFood(item.id)">
                      <FoodIcon :item="item" /> {{ item.name }}
                    </button>
                  </td>
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
            <RouterLink class="neighbour-message-link" :to="{ name: 'food-rescue', query: { inbox: 'received' } }">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
              Neighbour messages
              <span v-if="unreadMessages" class="message-count" :aria-label="`${unreadMessages} unread messages`">{{ unreadMessages > 99 ? '99+' : unreadMessages }}</span>
            </RouterLink>
            <RouterLink :to="{ name: 'food-rescue' }" class="btn-cta">
              Neighbour rescue <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </div>
      </div>
          <!-- Recipe suggestions from the user's ingredients -->
          <section v-reveal class="panel dashboard-recipes mt-3" aria-labelledby="recipes-heading">
            <h2 id="recipes-heading" class="panel-title mb-2">Try these recipes!</h2>
            <p v-if="recipesLoading" class="empty m-0" role="status">Finding recipes for your ingredients…</p>
            <p v-else-if="recipesError" class="empty m-0" role="alert">{{ recipesError }}</p>
            <p v-else-if="!recipes.length" class="empty m-0">
              {{ usableIngredients.length ? 'No recipes found for your ingredients yet.' : 'Add some food to get recipe ideas.' }}
            </p>
            <ul v-else class="dashboard-recipe-grid">
              <li v-for="recipe in suggestedRecipes" :key="recipe.id">
                <RouterLink :to="{ name: 'recipe-detail', params: { id: String(recipe.id) } }" class="dashboard-recipe-card">
                  <div class="dashboard-recipe-photo">
                    <img v-if="recipe.image" :src="recipe.image" alt="" loading="lazy">
                    <FoodIcon v-else kind="bowl" />
                  </div>
                  <div class="dashboard-recipe-copy">
                    <strong class="recipe-name">{{ recipe.name }}</strong>
                    <span v-if="recipe.ingredients?.length" class="recipe-meta">
                      {{ recipe.matched.length }}/{{ recipe.ingredients.length }} ingredients
                    </span>
                  </div>
                </RouterLink>
              </li>
            </ul>
          </section>
    <p v-if="impactError" role="alert">{{ impactError }}</p>
    <RouterLink class="impact-link d-block mt-4 mb-3" :to="{ name: 'analytics', hash: '#daily-food-impact' }">
      <ImpactOverview :totals="impactTotals" />
    </RouterLink>
    <EggCompanion always-happy :messages="eggTips" />
  </section>
  </div>
</template>

<style scoped>
.message-count { display:inline-grid; place-items:center; min-width:24px; height:24px; padding:0 5px; border-radius:14px; background:#b7352f; color:white; font-size:14px; font-weight:700; }

.neighbour-message-link {
  display:flex; align-items:center; justify-content:center; gap:8px; width:fit-content;
  margin:0 auto 14px; min-height:44px; padding:7px 13px; border:1.5px solid var(--ink);
  border-radius:12px; color:var(--ink); background:var(--paper-bright); text-decoration:none;
}
.neighbour-message-link svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.dashboard-recipe-grid {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%, 150px),1fr));
  gap:12px; margin:0; padding:0; list-style:none;
}
.dashboard-recipe-card {
  display:flex; flex-direction:column; height:100%; overflow:hidden;
  border:1.5px solid var(--ink); border-radius:14px; background:var(--paper-bright);
  color:var(--ink); text-decoration:none;
}
.dashboard-recipe-card:focus-visible { outline:2px solid var(--ink); outline-offset:3px; }
.dashboard-recipe-photo {
  aspect-ratio:4 / 3; display:grid; place-items:center; overflow:hidden;
  background:var(--aqua-soft);
}
.dashboard-recipe-photo img { width:100%; height:100%; object-fit:cover; }
.dashboard-recipe-photo :deep(.food-icon) { width:48px; height:48px; }
.dashboard-recipe-copy { display:grid; gap:5px; padding:10px 12px; }
.dashboard-recipe-copy .recipe-meta { margin:0; }
.expiry-item-row { position:relative; cursor:pointer; }
.expiry-food-link { color:inherit; background:none; border:0; padding:0; text-align:left; font:inherit; }
.expiry-food-link::after { content:''; position:absolute; inset:0; }
.expiry-item-row:focus-within { outline:2px solid var(--ink); outline-offset:-2px; }
.impact-link { color: inherit; text-decoration: none; }
.impact-link:focus-visible { outline: 3px solid var(--ink); outline-offset: 6px; border-radius: 20px; }
@media (prefers-reduced-motion: no-preference) {
  .entrance-ready :deep(.fridge-is-idle) {
    animation: dashboard-fridge-shake 4.6s ease-in-out 700ms infinite;
  }
  .entrance-ready .dashboard-header {
    position: relative;
    animation: dashboard-arrive 520ms cubic-bezier(.2,.75,.25,1) both;
  }
  .entrance-ready .dashboard-header::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(115deg, transparent 35%, #fff9d3aa 50%, transparent 65%);
    background-size: 250% 100%;
    animation: dashboard-glint 850ms ease-out 150ms both;
  }
  .entrance-ready [aria-labelledby="dashboard-fridge-heading"] {
    animation: dashboard-arrive 560ms cubic-bezier(.2,.75,.25,1) 100ms backwards;
  }
  .dashboard :is(a, button):not(:disabled) {
    transition: translate 160ms ease, filter 160ms ease;
  }
  .dashboard :is(a, button):not(:disabled):focus-visible {
    translate: 0 -2px;
  }
  @media (hover: hover) {
    .dashboard :is(a, button):not(:disabled):hover {
      translate: 0 -2px;
      filter: brightness(1.04);
    }
  }
  .dashboard :is(a, button):not(:disabled):active {
    translate: 0 1px;
  }
}
@keyframes dashboard-fridge-shake {
  0%, 25%, 100% { rotate: 0deg; }
  5%, 15% { rotate: -.65deg; }
  10%, 20% { rotate: .65deg; }
}
@keyframes dashboard-arrive {
  from { opacity: 0; translate: 0 14px; }
  to { opacity: 1; translate: none; }
}
@keyframes dashboard-glint {
  from { background-position: 100% 0; opacity: 0; }
  30% { opacity: 1; }
  to { background-position: 0 0; opacity: 0; }
}
/* Same page shell as Home: grid paper, handwritten fonts, ink text */
.dashboard-page {
  --aqua-dark: #087d73;
  min-height: 100svh;
  color: var(--ink);
  background: transparent;
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

/* Keep the fridge and expiry list in the first desktop viewport. */
.dashboard-header { display:grid; grid-template-columns:1fr minmax(320px,440px); align-items:center; gap:24px; margin-bottom:16px; }
.dashboard-header .eyebrow { margin:0 0 8px; padding:4px 10px; font-size:13px; }
.dashboard-header .hero-title { margin:0 0 6px; font-size:clamp(30px,3.1vw,43px); }
.dashboard-header .stamp-title { margin:0; color:var(--muted); font-family:var(--font-sans); font-size:17px; font-weight:400; }
.quick-bites { padding:12px 16px; background:#fff9df; border:1px solid #c7b77c; border-left:4px solid var(--aqua); border-radius:12px; box-shadow:2px 3px 0 #123f3b10; }
.quick-bites h2 { display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; margin:0 0 6px; font-size:19px; }
.quick-bites h2 span { font:400 15px var(--font-sans); color:var(--muted); }
.quick-bites p { font-size:16px; }
.quick-bites-list { margin:0; padding:0; list-style:none; }
.quick-bites-list li { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px; padding:3px 0; font-size:15px; }
.quick-bites-list strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.quick-bites-list span { color:#526f65; }
.quick-bites-list a { color:var(--aqua-dark); font-weight:700; white-space:nowrap; }
.dashboard-workspace .section-title { font-size:27px; margin-bottom:4px; }
.fridge-instruction { font-size:16px; margin-bottom:8px; }
@media(min-width:992px) {
  .dashboard-page { --dashboard-fridge-height:clamp(370px,calc(100svh - 380px),600px); }
  .expiry-wrap { max-height:calc(100svh - 280px); overflow:auto; }
  .expiry-table thead { position:sticky; top:0; z-index:1; background:var(--paper-bright); }
}
@media(max-width:991px) {
  .dashboard-header { grid-template-columns:1fr; gap:12px; }
  .quick-bites { max-width:100%; }
}
@media (min-width: 992px) {
  .dashboard-workspace .dashboard-expiry-column {
    height:var(--fridge-section-height);
    min-height:0;
  }
  .dashboard-expiry-column > :is(.section-title,.filter-chips,.donate) { flex-shrink:0; }
  .dashboard-expiry-column .expiry-wrap {
    flex:1 1 0; min-height:0; max-height:none; overflow:auto;
  }
  .dashboard-expiry-column .donate {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    flex:0 0 auto; padding:24px 16px;
  }
  .dashboard-recipe-grid { grid-template-columns:repeat(5,minmax(0,1fr)); }
}
</style>
