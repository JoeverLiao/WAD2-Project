
<script setup>
import { usePageLoading } from '../../utils/pageLoading.js'
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FoodIcon from '../../components/FoodIcon.vue'
import NoticeIcon from '../../components/NoticeIcon.vue'
import { sampleInventory } from '../../data/freshnessDemo.js'

const router = useRouter()

const USE_API = true
const API = 'http://localhost:3000'

const inventory = ref(sampleInventory)
const recipes = ref([])
const loading = ref(false)
usePageLoading(loading, 'Finding recipes')
const error = ref('')

const tab = ref('mine')
const inventorySearch = ref('')
const statusFilter = ref('all')
const recipeSearch = ref('')
const maxTime = ref('')
const diet = ref('')

function readSaved() {
  try {
    const value = JSON.parse(
      localStorage.getItem('fullcircle-saved-recipes') || '[]'
    )
    return Array.isArray(value) ? value.map(String) : []
  } catch {
    return []
  }
}

const savedIds = ref(readSaved())

function isSaved(id) {
  return savedIds.value.includes(String(id))
}

function toggleSave(id) {
  const key = String(id)

  savedIds.value = isSaved(key)
    ? savedIds.value.filter(x => x !== key)
    : [...savedIds.value, key]

  localStorage.setItem(
    'fullcircle-saved-recipes',
    JSON.stringify(savedIds.value)
  )
}

function daysLeft(dateString) {
  if (!dateString) return null

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null

  const now = new Date()

  const todayUTC = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )

  const expiryUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )

  return Math.round((expiryUTC - todayUTC) / 86400000)
}

const inventoryItems = computed(() =>
  inventory.value.map(item => {
    const days = daysLeft(item.expiresAt)

    const status =
      days === null ? 'unknown' :
      days < 0 ? 'expired' :
      days <= 3 ? 'soon' : 'fresh'

    const label =
      days === null ? 'Unknown' :
      days < 0 ? `Expired ${-days}d ago` :
      days === 0 ? 'Expires today' :
      days === 1 ? 'Tomorrow' :
      `${days} days left`

    return { ...item, days, status, label }
  })
)

const usableItems = computed(() =>
  inventoryItems.value.filter(item =>
    Number(item.quantity) > 0 &&
    item.days !== null &&
    item.days >= 0
  )
)

const usableNames = computed(() =>
  usableItems.value.map(item => item.name.toLowerCase())
)

const stats = computed(() => ({
  total: inventoryItems.value.length,
  fresh: inventoryItems.value.filter(i => i.status === 'fresh').length,
  soon: inventoryItems.value.filter(i => i.status === 'soon').length,
  expired: inventoryItems.value.filter(i => i.status === 'expired').length,
}))

const filteredInventory = computed(() =>
  inventoryItems.value.filter(item =>
    item.name.toLowerCase().includes(
      inventorySearch.value.toLowerCase()
    ) &&
    (
      statusFilter.value === 'all' ||
      item.status === statusFilter.value
    )
  )
)

const eatSoon = computed(() =>
  inventoryItems.value
    .filter(item => item.days !== null && item.days <= 3)
    .sort((a, b) => a.days - b.days)
)

function ingredientMatch(name) {
  const key = name.toLowerCase().trim()

  return usableNames.value.some(owned =>
    owned === key ||
    key.includes(owned) ||
    owned.includes(key)
  )
}

const preparedRecipes = computed(() =>
  recipes.value.map(recipe => {
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : []

    const matched = ingredients.filter(ingredientMatch)
    const missing = ingredients.filter(
      name => !ingredientMatch(name)
    )

    const matchPercentage = ingredients.length
      ? Math.round(100 * matched.length / ingredients.length)
      : 0

    const rescueCount = matched.filter(name =>
      usableItems.value.some(item =>
        item.days >= 0 &&
        item.days <= 3 &&
        (
          item.name.toLowerCase() === name.toLowerCase() ||
          name.toLowerCase().includes(item.name.toLowerCase())
        )
      )
    ).length

    return {
      ...recipe,
      matched,
      missing,
      matchPercentage,
      rescueCount,
    }
  })
)

const visibleRecipes = computed(() =>
  preparedRecipes.value
    .filter(recipe => {
      if (tab.value === 'saved' && !isSaved(recipe.id)) {
        return false
      }

      const searchText = (
        recipe.name + ' ' + recipe.ingredients.join(' ')
      ).toLowerCase()

      if (
        recipeSearch.value &&
        !searchText.includes(recipeSearch.value.toLowerCase())
      ) {
        return false
      }

      if (
        maxTime.value &&
        (
          recipe.prepTime == null ||
          recipe.prepTime > Number(maxTime.value)
        )
      ) {
        return false
      }

      if (
        diet.value &&
        !(recipe.dietaryTags || []).includes(diet.value)
      ) {
        return false
      }

      return true
    })
    .sort((a, b) =>
      tab.value === 'mine'
        ? b.rescueCount - a.rescueCount ||
          b.matchPercentage - a.matchPercentage
        : 0
    )
)

function openRecipe(recipe) {
  router.push({
    name: 'recipe-detail',
    params: { id: String(recipe.id) },
  })
}

function clearFilters() {
  recipeSearch.value = ''
  maxTime.value = ''
  diet.value = ''
}

async function loadRecipes() {
  if (!USE_API) return

  loading.value = true
  error.value = ''

  try {
    const ingredients = [...new Set(usableNames.value)]
      .slice(0, 8)
      .join(',')

    const endpoint = tab.value === 'mine'
      ? `/api/freshness/recipes?ingredients=${encodeURIComponent(ingredients)}`
      : `/api/freshness/recipes/explore?search=${encodeURIComponent(recipeSearch.value)}`

    const response = await fetch(`${API}${endpoint}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Recipes HTTP ${response.status}`)
    }

    const data = await response.json()
    recipes.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// async function loadApi() {
//   if (!USE_API) return

//   loading.value = true
//   error.value = ''

//   try {
//     const response = await fetch(`${API}/api/inventory`, {
//       credentials: 'include',
//     })

//     if (!response.ok) {
//       throw new Error(`Inventory HTTP ${response.status}`)
//     }

//     const data = await response.json()

//     inventory.value = Array.isArray(data)
//       ? data
//       : data.items || data.inventory || []

//     await loadRecipes()
//   } catch (err) {
//     error.value = err.message
//   } finally {
//     loading.value = false
//   }
// }


async function loadApi() {
  if (!USE_API) return

  // Temporarily use demo inventory.
  // Recipe data will come from the real API.
  inventory.value = sampleInventory

  await loadRecipes()
}

watch(tab, () => {
  if (USE_API && tab.value !== 'saved') loadRecipes()
})

let searchTimer

watch(recipeSearch, () => {
  if (!USE_API || tab.value !== 'explore') return

  clearTimeout(searchTimer)

  searchTimer = setTimeout(() => {
    loadRecipes()
  }, 400)
})


onMounted(loadApi)
</script>

<template>
  <main class="freshness-page container py-4">

    <!-- HEADER -->
    <header class="paper hero mb-4">
      <div>
        <p class="eyebrow">
          FULL CIRCLE · YOUR KITCHEN COMPANION
        </p>

        <h1>Freshness & Recipes ✿</h1>

        <p class="mb-0">
          Less food waste, more delicious ideas.
          Let's use what you've got!
        </p>
      </div>

      <span class="hero-doodle" aria-hidden="true"><FoodIcon kind="leaf" /></span>
    </header>

    <div v-if="!USE_API" class="demo-note mb-4">
      ✎ UI preview mode · Using fresh demo ingredients and recipes
    </div>

    <div v-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <!-- SUMMARY -->
    <section class="mb-5">
      <div class="stats-grid">
        <div class="stat paper stat-total">
          <span>📦 Total food</span>
          <strong>{{ stats.total }}</strong>
        </div>

        <div class="stat paper stat-fresh">
          <span>🌱 Fresh</span>
          <strong>{{ stats.fresh }}</strong>
        </div>

        <div class="stat paper stat-soon">
          <span><NoticeIcon name="clock" /> Eat soon</span>
          <strong>{{ stats.soon }}</strong>
        </div>

        <div class="stat paper stat-expired">
          <span><NoticeIcon name="bell" /> Expired</span>
          <strong>{{ stats.expired }}</strong>
        </div>
      </div>
    </section>

    <!-- INVENTORY -->
    <section id="inventory" class="paper section-card mb-5">
      <div class="section-heading">
        <div>
          <p class="eyebrow">WHAT'S IN YOUR KITCHEN?</p>
          <h2>My Food Inventory</h2>
        </div>

        <span class="sticker">Keep it fresh!</span>
      </div>

      <div class="toolbar mb-3">
        <input
          v-model="inventorySearch"
          class="hand-input"
          placeholder="🔎 Search your food..."
          aria-label="Search inventory"
        />

        <select
          v-model="statusFilter"
          class="hand-input"
          aria-label="Filter inventory by freshness"
        >
          <option value="all">All items</option>
          <option value="fresh">Fresh</option>
          <option value="soon">Eat soon</option>
          <option value="expired">Expired</option>
          <option value="unknown">Unknown expiry</option>
        </select>
      </div>

      <div class="table-responsive">
        <table class="table inventory-table align-middle">
          <thead>
            <tr>
              <th>Food</th>
              <th>Quantity</th>
              <th>Storage</th>
              <th>Freshness</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="item in filteredInventory"
              :key="item._id || item.id"
            >
              <td class="food-name">{{ item.name }}</td>
              <td>{{ item.quantity }} {{ item.unit }}</td>
              <td class="text-capitalize">{{ item.storage }}</td>
              <td>
                <span
                  class="status-tag"
                  :class="`status-${item.status}`"
                >
                  {{ item.label }}
                </span>
              </td>
            </tr>

            <tr v-if="filteredInventory.length === 0">
              <td colspan="4" class="text-center py-4">
                No food matches your filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- EAT SOON -->
    <section id="eat-soon" class="paper section-card mb-5">
      <div class="section-heading">
        <div>
          <p class="eyebrow">DON'T LET IT GO TO WASTE</p>
          <h2>Eat Soon Timeline ⏳</h2>
        </div>

        <span class="sticker coral">Use me first!</span>
      </div>

      <p class="section-subtitle">
        Ingredients expiring in the next three days,
        plus anything already expired.
      </p>

      <p v-if="!eatSoon.length" class="empty-state">
        🎉 Nothing expiring soon!
      </p>

      <TransitionGroup
        v-else
        name="pop"
        tag="div"
        class="timeline"
      >
        <div
          v-for="item in eatSoon"
          :key="item._id || item.id"
          class="timeline-item"
        >
          <span
            class="timeline-dot"
            :class="item.status"
          ></span>

          <div
            class="timeline-note"
            :class="{ overdue: item.status === 'expired' }"
          >
            <div>
              <strong>{{ item.name }}</strong>
              <small>
                {{ item.quantity }} {{ item.unit }}
                · {{ item.storage }}
              </small>
            </div>

            <span
              class="status-tag"
              :class="`status-${item.status}`"
            >
              {{ item.label }}
            </span>
          </div>
        </div>
      </TransitionGroup>
    </section>

    <!-- RECIPES -->
    <section id="recipes" class="paper section-card mb-5">
      <div class="section-heading">
        <div>
          <p class="eyebrow">COOK SOMETHING GOOD</p>
          <h2>Recipe Discovery 🍳</h2>
        </div>

        <span class="sticker lime">Let's cook!</span>
      </div>

      <div class="recipe-tabs" role="group" aria-label="Recipe modes">
        <button
          type="button"
          :class="{ active: tab === 'mine' }"
          :aria-pressed="tab === 'mine'"
          @click="tab = 'mine'"
        >
          🧺 My Ingredients
        </button>

        <button
          type="button"
          :class="{ active: tab === 'explore' }"
          :aria-pressed="tab === 'explore'"
          @click="tab = 'explore'"
        >
          ✨ Explore
        </button>

        <button
          type="button"
          :class="{ active: tab === 'saved' }"
          :aria-pressed="tab === 'saved'"
          @click="tab = 'saved'"
        >
          ♥ Saved ({{ savedIds.length }})
        </button>
      </div>

      <p class="section-subtitle mt-3">
        <template v-if="tab === 'mine'">
          Recipes ranked by ingredients you have,
          prioritising food that expires soon.
        </template>

        <template v-else-if="tab === 'explore'">
          Discover recipes beyond your current inventory.
        </template>

        <template v-else>
          Your bookmarked recipes, saved in this browser.
        </template>
      </p>

      <div class="toolbar mb-4">
        <input
          v-model="recipeSearch"
          class="hand-input"
          placeholder="🔎 Search recipe or ingredient..."
          aria-label="Search recipes"
        />

        <select
          v-model="maxTime"
          class="hand-input"
          aria-label="Maximum cooking time"
        >
          <option value="">Any time</option>
          <option value="10">10 min</option>
          <option value="20">20 min</option>
          <option value="30">30 min</option>
        </select>

        <select
          v-model="diet"
          class="hand-input"
          aria-label="Dietary preference"
        >
          <option value="">All diets</option>
          <option value="Vegetarian">Vegetarian</option>
          <option value="Vegan">Vegan</option>
        </select>

        <button
          type="button"
          class="hand-button secondary"
          @click="clearFilters"
        >
          Clear
        </button>
      </div>

      <p v-if="loading">Finding recipes...</p>

      <p
        v-if="!loading && !visibleRecipes.length"
        class="empty-state"
      >
        No recipes here yet. Try another tab or clear the filters!
      </p>

      <TransitionGroup name="pop" tag="div" class="recipe-grid">
        <article
          v-for="recipe in visibleRecipes"
          :key="recipe.id"
          class="recipe-card"
          tabindex="0"
          role="button"
          :aria-label="`Open ${recipe.name} recipe`"
          @click="openRecipe(recipe)"
          @keydown.enter="openRecipe(recipe)"
          @keydown.space.prevent="openRecipe(recipe)"
        >
          <div class="recipe-visual">
            <img
              v-if="recipe.image"
              :src="recipe.image"
              :alt="recipe.name"
              loading="lazy"
            />

            <span v-else aria-hidden="true">🍽️</span>

            <span
              v-if="recipe.rescueCount && tab === 'mine'"
              class="rescue-stamp"
            >
              ♻ Rescue pick
            </span>
          </div>

          <div class="recipe-content">
            <h3>{{ recipe.name }}</h3>

            <p class="recipe-meta">
              <span v-if="recipe.prepTime">
                ⏱ {{ recipe.prepTime }} min
              </span>

              <span
                v-for="tag in recipe.dietaryTags || []"
                :key="tag"
                class="diet-pill"
              >
                {{ tag }}
              </span>
            </p>

            <div class="match-line">
              <span>Ingredient match</span>
              <strong>{{ recipe.matchPercentage }}%</strong>
            </div>

            <div class="match-track">
              <div
                class="match-fill"
                :style="{ width: `${recipe.matchPercentage}%` }"
              ></div>
            </div>

            <p class="ingredient-line">
              <strong>✓ Have:</strong>
              {{ recipe.matched.join(', ') || 'None' }}
            </p>

            <p class="ingredient-line">
              <strong>+ Need:</strong>
              {{ recipe.missing.join(', ') || 'Nothing else!' }}
            </p>

            <div class="recipe-actions">
              <button
                type="button"
                class="hand-button save"
                :aria-pressed="isSaved(recipe.id)"
                @click.stop="toggleSave(recipe.id)"
              >
                {{ isSaved(recipe.id) ? '♥ Saved' : '♡ Save' }}
              </button>

              <span class="view-link">View recipe →</span>
            </div>
          </div>
        </article>
      </TransitionGroup>
    </section>
  </main>
</template>

<style scoped>
.freshness-page {
  max-width: 1220px;
  font-family: var(--font-sans, 'Patrick Hand', cursive);
  color: var(--ink, #123f3b);
  font-size: 18px;
}

.freshness-page h1,
.freshness-page h2,
.freshness-page h3 {
  font-family: var(--font-display, 'Kalam', cursive);
  color: var(--ink, #123f3b);
  margin: 0;
}

.freshness-page h1 {
  font-size: clamp(2rem, 4vw, 3rem);
}

.freshness-page h2 {
  font-size: clamp(1.5rem, 3vw, 2rem);
}

.paper {
  background: var(--paper, #fdfaf3);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 17px;
  box-shadow: var(--shadow-paper, 6px 8px 0 #123f3b);
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 28px;
  background: var(--paper-bright, #fbfffd);
  animation: rise .45s ease both;
}

.hero-doodle {
  font-size: 4rem;
  transform: rotate(-12deg);
}

.eyebrow {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1.6px;
  color: var(--aqua, #0fa89c);
  margin: 0 0 6px;
}

.demo-note {
  padding: 9px 14px;
  background: var(--yellow-sticky, #fff9df);
  border: 2px dashed var(--line, #9bcac5);
  border-radius: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.stat {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: rise .5s ease both;
}

.stat strong {
  font: 700 2.5rem var(--font-display, 'Kalam', cursive);
  line-height: 1;
}

.stat-total {
  background: var(--aqua-soft, #d9f4ef);
}

.stat-fresh {
  background: var(--lime, #dff09c);
}

.stat-soon {
  background: var(--yellow-sticky, #fff9df);
}

.stat-expired {
  background: #ffe1dc;
}

.stat:nth-child(2) { animation-delay: .08s; }
.stat:nth-child(3) { animation-delay: .16s; }
.stat:nth-child(4) { animation-delay: .24s; }

.section-card {
  padding: 26px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.sticker {
  background: var(--yellow, #ffdd69);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 7px;
  padding: 6px 12px;
  transform: rotate(4deg);
  white-space: nowrap;
  box-shadow: 2px 3px 0 var(--ink, #123f3b);
}

.sticker.coral {
  background: var(--coral, #ff9587);
}

.sticker.lime {
  background: var(--lime, #dff09c);
}

.section-subtitle {
  color: var(--muted, #557b77);
}

.toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hand-input {
  min-width: 140px;
  flex: 1;
  padding: 9px 13px;
  border: 2px solid var(--ink, #123f3b);
  border-radius: 10px;
  background: white;
  font-family: inherit;
  color: inherit;
  outline-offset: 3px;
}

.hand-button {
  padding: 8px 16px;
  border: 2px solid var(--ink, #123f3b);
  border-radius: 10px;
  background: var(--yellow, #ffdd69);
  color: var(--ink, #123f3b);
  box-shadow: var(--shadow-small, 3px 4px 0 #123f3b);
  font: inherit;
  cursor: pointer;
  transition: transform .18s, box-shadow .18s;
}

.hand-button:hover {
  transform: translateY(-2px);
  box-shadow: 4px 6px 0 var(--ink, #123f3b);
}

.hand-button.secondary {
  background: var(--aqua-soft, #d9f4ef);
}

.inventory-table {
  --bs-table-bg: transparent;
  --bs-table-color: var(--ink, #123f3b);
  font-size: 17px;
}

.inventory-table thead th {
  background: var(--aqua-soft, #d9f4ef);
  border-bottom: 2px solid var(--ink, #123f3b);
}

.inventory-table td {
  padding: 14px 9px;
  border-color: var(--line, #9bcac5);
}

.inventory-table tbody tr:hover {
  background: var(--yellow-sticky, #fff9df);
}

.food-name {
  font-weight: bold;
}

.status-tag {
  display: inline-block;
  border: 1.5px solid var(--ink, #123f3b);
  border-radius: 9px;
  padding: 3px 10px;
  font-size: 15px;
  white-space: nowrap;
}

.status-fresh { background: var(--lime, #dff09c); }
.status-soon { background: var(--yellow, #ffdd69); }
.status-expired { background: var(--coral, #ff9587); }
.status-unknown { background: #eee; }

.timeline {
  margin-left: 13px;
  border-left: 3px dashed var(--line, #9bcac5);
  padding: 0 0 0 25px;
}

.timeline-item {
  position: relative;
  margin-bottom: 15px;
}

.timeline-dot {
  position: absolute;
  left: -35px;
  top: 18px;
  width: 17px;
  height: 17px;
  border: 3px solid var(--ink, #123f3b);
  border-radius: 50%;
  background: var(--yellow, #ffdd69);
}

.timeline-dot.expired {
  background: var(--coral, #ff9587);
}

.timeline-note {
  background: var(--yellow-sticky, #fff9df);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 12px;
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  transition: transform .2s;
}

.timeline-note:hover {
  transform: translateX(4px);
}

.timeline-note.overdue {
  background: #ffe8e4;
}

.timeline-note strong {
  display: block;
  font-size: 21px;
}

.timeline-note small {
  color: var(--muted, #557b77);
}

.recipe-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  border-bottom: 2px dashed var(--line, #9bcac5);
  padding-bottom: 12px;
}

.recipe-tabs button {
  background: var(--paper-bright, #fbfffd);
  color: var(--ink, #123f3b);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 10px;
  padding: 9px 17px;
  font: inherit;
  cursor: pointer;
  transition: transform .2s, background .2s;
}

.recipe-tabs button:hover {
  transform: translateY(-2px);
}

.recipe-tabs button.active {
  background: var(--yellow, #ffdd69);
  box-shadow: var(--shadow-small, 3px 4px 0 #123f3b);
}

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.recipe-card {
  background: var(--paper-bright, #fbfffd);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 15px;
  box-shadow: var(--shadow-small, 3px 4px 0 #123f3b);
  overflow: hidden;
  cursor: pointer;
  transition: transform .2s, box-shadow .2s;
}

.recipe-card:hover,
.recipe-card:focus-visible {
  transform: translateY(-5px);
  box-shadow: 6px 9px 0 var(--ink, #123f3b);
}

.recipe-visual {
  height: 155px;
  background: var(--aqua-soft, #d9f4ef);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  position: relative;
  overflow: hidden;
  border-bottom: 2px solid var(--ink, #123f3b);
}

.recipe-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .3s;
}

.recipe-card:hover img {
  transform: scale(1.05);
}

.rescue-stamp {
  position: absolute;
  top: 12px;
  left: 12px;
  background: var(--lime, #dff09c);
  font-size: 14px;
  padding: 3px 9px;
  border: 2px solid var(--ink, #123f3b);
  border-radius: 8px;
  transform: rotate(-4deg);
}

.recipe-content {
  padding: 18px;
}

.recipe-content h3 {
  font-size: 1.45rem;
}

.recipe-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted, #557b77);
  font-size: 15px;
  margin: 8px 0 15px;
}

.diet-pill {
  background: var(--aqua-soft, #d9f4ef);
  border-radius: 7px;
  padding: 1px 8px;
}

.match-line {
  display: flex;
  justify-content: space-between;
}

.match-track {
  height: 11px;
  background: #e1e9e4;
  border: 1px solid var(--ink, #123f3b);
  border-radius: 20px;
  overflow: hidden;
  margin: 6px 0 15px;
}

.match-fill {
  height: 100%;
  background: var(--aqua, #0fa89c);
  border-radius: 20px;
  transition: width .6s ease;
}

.ingredient-line {
  font-size: 16px;
  margin: 7px 0;
  line-height: 1.35;
}

.recipe-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 17px;
}

.view-link {
  font-weight: bold;
  color: var(--aqua, #0fa89c);
}

.empty-state {
  text-align: center;
  padding: 28px;
  background: var(--yellow-sticky, #fff9df);
  border: 2px dashed var(--line, #9bcac5);
  border-radius: 12px;
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity .25s, transform .25s;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.pop-move {
  transition: transform .25s;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 800px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-grid {
    grid-template-columns: 1fr;
  }

  .section-card {
    padding: 17px;
  }

  .hero-doodle {
    font-size: 2.8rem;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    gap: 10px;
  }

  .stat {
    padding: 13px;
  }

  .sticker {
    display: none;
  }

  .timeline-note {
    align-items: flex-start;
    flex-direction: column;
  }

  .recipe-tabs button {
    flex: 1;
    padding: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
