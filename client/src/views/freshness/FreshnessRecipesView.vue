
<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { sampleInventory } from '../../data/freshnessDemo.js'

const router = useRouter()

// ========================================
// DEMO INVENTORY
// Replace with MongoDB inventory later.
// ========================================

const expiryOffsets = [2, 1, 30, 3, 5, 7, 2, 14, 1, 10, 21, 4]

function dateFromToday(offset) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const inventory = ref(
  sampleInventory.map((item, index) => ({
    ...item,
    localId: String(item._id ?? item.id ?? index),
    expiresAt: dateFromToday(
      expiryOffsets[index % expiryOffsets.length]
    ),
  }))
)

// ========================================
// RECIPE STATE
// ========================================

const recipes = ref([])
const recipesLoading = ref(false)
const recipesError = ref('')

const activeTab = ref('mine')
const recipeSearch = ref('')
const maxTime = ref('')
const diet = ref('')
const sortBy = ref('rescue')

const currentPage = ref(1)
const pageSize = 6

// ========================================
// EAT SOON STATE
// ========================================

const eatSoonSearch = ref('')
const eatSoonSort = ref('expiry')
const expandedItem = ref(null)
const showAllEatSoon = ref(false)

// ========================================
// INGREDIENT MODAL STATE
// ========================================

const showIngredientModal = ref(false)
const ingredientSearch = ref('')
const draftSelected = ref([])
const appliedSelected = ref([])
const selectionApplied = ref(false)

// ========================================
// SAVED RECIPES
// ========================================

const SAVED_KEY = 'fullcircle-saved-recipes'

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')

    if (!Array.isArray(raw)) return []

    return [...new Set(
      raw.map(value =>
        String(
          typeof value === 'object' && value !== null
            ? value.id ?? value.idMeal ?? ''
            : value
        )
      ).filter(Boolean)
    )]
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

  if (isSaved(key)) {
    savedIds.value = savedIds.value.filter(value => value !== key)

    if (activeTab.value === 'saved') {
      recipes.value = recipes.value.filter(
        recipe => recipe.id !== key
      )
    }
  } else {
    savedIds.value = [...savedIds.value, key]
  }

  localStorage.setItem(SAVED_KEY, JSON.stringify(savedIds.value))
}

// ========================================
// RECIPE NORMALISATION
// ========================================

function normalizeRecipe(raw) {
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(ingredient =>
        typeof ingredient === 'string'
          ? ingredient
          : ingredient.name ?? ingredient.ingredient ?? ''
      ).filter(Boolean)
    : []

  return {
    ...raw,
    id: String(raw.id ?? raw.idMeal ?? ''),
    name: raw.name ?? raw.strMeal ?? raw.title ?? 'Recipe',
    image: raw.image ?? raw.strMealThumb ?? '',
    ingredients,
    prepTime: Number(raw.prepTime) || null,
    dietaryTags: Array.isArray(raw.dietaryTags)
      ? raw.dietaryTags
      : [],
  }
}

// ========================================
// BACKEND API
// ========================================

function authHeaders() {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('fullcircle-token')

  return token
    ? { Authorization: `Bearer ${token}` }
    : {}
}

async function requestRecipes(url, signal) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: authHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Recipe API returned HTTP ${response.status}`)
  }

  const data = await response.json()

  const list = Array.isArray(data)
    ? data
    : data?.recipes ??
      data?.data?.recipes ??
      data?.meals ??
      []

  if (!Array.isArray(list)) {
    throw new Error('Unexpected recipe API response')
  }

  return list.map(normalizeRecipe).filter(recipe => recipe.id)
}

function canonicalIngredient(name) {
  const original = String(name || '')
    .toLowerCase()
    .trim()

  const aliases = {
    eggs: 'egg',
    tomatoes: 'tomato',
    potatoes: 'potato',
    carrots: 'carrot',
    onions: 'onion',
    mushrooms: 'mushroom',
    bananas: 'banana',
    apples: 'apple',
    'chicken breast': 'chicken',
    'chicken breasts': 'chicken',
    'minced beef': 'beef',
    'ground beef': 'beef',
    'white rice': 'rice',
    'brown rice': 'rice',
    'fresh milk': 'milk',
    'whole milk': 'milk',
  }

  return aliases[original] ?? original
}

// Keep the original names for the UI.
// Convert common plurals for TheMealDB ingredient lookup.
const apiIngredients = computed(() =>
  [...new Set(
    selectedInventory.value
      .map(item => canonicalIngredient(item.name))
      .filter(Boolean)
  )].slice(0, 8)
)

let activeController = null
let requestNumber = 0

async function loadRecipes() {
  const thisRequest = ++requestNumber

  if (activeController) {
    activeController.abort()
  }

  activeController = new AbortController()
  const signal = activeController.signal

  recipesLoading.value = true
  recipesError.value = ''

  try {
    let loaded = []

    if (activeTab.value === 'mine') {
      if (!apiIngredients.value.length) {
        recipes.value = []
        return
      }

      const params = new URLSearchParams({
        ingredients: apiIngredients.value.join(','),
      })

      loaded = await requestRecipes(
        `/api/freshness/recipes?${params.toString()}`,
        signal
      )
    } else if (activeTab.value === 'explore') {
      loaded = await requestRecipes(
        '/api/freshness/recipes/explore',
        signal
      )
    } else {
      const ids = [...savedIds.value]

      const results = await Promise.allSettled(
        ids.map(async id => {
          const response = await fetch(
            `/api/freshness/recipes/${encodeURIComponent(id)}`,
            {
              credentials: 'include',
              headers: authHeaders(),
              signal,
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to load recipe ${id}`)
          }

          return normalizeRecipe(await response.json())
        })
      )

      loaded = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(recipe => recipe.id)

      if (
        ids.length &&
        results.every(result => result.status === 'rejected') &&
        !signal.aborted
      ) {
        throw new Error('Unable to retrieve saved recipes')
      }
    }

    if (thisRequest === requestNumber && !signal.aborted) {
      recipes.value = loaded
    }
  } catch (error) {
    if (error.name === 'AbortError') return

    console.error('Failed to load recipes:', error)

    if (thisRequest === requestNumber) {
      recipesError.value =
        'Unable to load recipes. Check that your backend is running.'
      recipes.value = []
    }
  } finally {
    if (thisRequest === requestNumber) {
      recipesLoading.value = false
    }
  }
}

// ========================================
// EXPIRY CALCULATIONS
// ========================================

function daysUntil(value) {
  if (!value) return null

  const expiry = new Date(`${String(value).slice(0, 10)}T12:00:00`)

  if (Number.isNaN(expiry.getTime())) return null

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  return Math.round(
    (expiry.getTime() - today.getTime()) / 86400000
  )
}

function expiryText(days) {
  if (days === null) return 'Unknown date'
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days left`
}

const inventoryWithStatus = computed(() =>
  inventory.value.map(item => {
    const days = daysUntil(item.expiresAt)

    return {
      ...item,
      days,
      status:
        days === null
          ? 'unknown'
          : days < 0
            ? 'expired'
            : days <= 3
              ? 'soon'
              : 'fresh',
      expiryText: expiryText(days),
      storageLabel:
        item.storage ??
        item.suggestedLocation ??
        'Not specified',
    }
  })
)

const summary = computed(() => ({
  total: inventoryWithStatus.value.length,
  fresh: inventoryWithStatus.value.filter(
    item => item.status === 'fresh'
  ).length,
  soon: inventoryWithStatus.value.filter(
    item => item.status === 'soon'
  ).length,
  expired: inventoryWithStatus.value.filter(
    item => item.status === 'expired'
  ).length,
}))

const eatSoonItems = computed(() =>
  inventoryWithStatus.value.filter(
    item => item.days !== null && item.days <= 3
  )
)

const filteredEatSoon = computed(() => {
  const search = eatSoonSearch.value.trim().toLowerCase()

  const list = eatSoonItems.value.filter(item =>
    String(item.name).toLowerCase().includes(search)
  )

  return [...list].sort((a, b) =>
    eatSoonSort.value === 'name'
      ? String(a.name).localeCompare(String(b.name))
      : a.days - b.days
  )
})

const visibleEatSoon = computed(() =>
  showAllEatSoon.value
    ? filteredEatSoon.value
    : filteredEatSoon.value.slice(0, 4)
)

function toggleExpanded(id) {
  expandedItem.value = expandedItem.value === id ? null : id
}

// ========================================
// INGREDIENT SELECTION
// ========================================

const usableInventory = computed(() =>
  inventoryWithStatus.value.filter(
    item => item.days === null || item.days >= 0
  )
)

const modalInventory = computed(() =>
  usableInventory.value.filter(item =>
    String(item.name)
      .toLowerCase()
      .includes(ingredientSearch.value.trim().toLowerCase())
  )
)

const selectedInventory = computed(() =>
  selectionApplied.value
    ? usableInventory.value.filter(item =>
        appliedSelected.value.includes(item.localId)
      )
    : usableInventory.value
)

function openIngredientModal() {
  ingredientSearch.value = ''

  draftSelected.value = selectionApplied.value
    ? [...appliedSelected.value]
    : usableInventory.value.map(item => item.localId)

  showIngredientModal.value = true
}

function toggleIngredient(id) {
  draftSelected.value = draftSelected.value.includes(id)
    ? draftSelected.value.filter(value => value !== id)
    : [...draftSelected.value, id]
}

function applyIngredients() {
  appliedSelected.value = [...draftSelected.value]
  selectionApplied.value = true
  showIngredientModal.value = false
  activeTab.value = 'mine'
  currentPage.value = 1
}

function resetIngredients() {
  appliedSelected.value = []
  selectionApplied.value = false
  currentPage.value = 1
}

// ========================================
// INGREDIENT MATCHING
// ========================================

function clean(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singular(value) {
  const text = clean(value)

  if (text.endsWith('ies')) {
    return `${text.slice(0, -3)}y`
  }

  if (text.endsWith('oes')) {
    return text.slice(0, -2)
  }

  if (text.endsWith('s') && !text.endsWith('ss')) {
    return text.slice(0, -1)
  }

  return text
}

function ingredientMatches(recipeIngredient, inventoryIngredient) {
  const recipe = singular(recipeIngredient)
  const owned = singular(inventoryIngredient)

  if (!recipe || !owned) return false

  return (
    recipe === owned ||
    recipe.includes(` ${owned} `) ||
    recipe.startsWith(`${owned} `) ||
    recipe.endsWith(` ${owned}`) ||
    owned.startsWith(`${recipe} `)
  )
}

const analysedRecipes = computed(() =>
  recipes.value.map(recipe => {
    const matched = []
    const missing = []
    const urgentIds = new Set()

    for (const ingredient of recipe.ingredients) {
      const item = selectedInventory.value.find(inventoryItem =>
        ingredientMatches(ingredient, inventoryItem.name)
      )

      if (item) {
        matched.push(ingredient)

        if (item.days !== null && item.days <= 3) {
          urgentIds.add(item.localId)
        }
      } else {
        missing.push(ingredient)
      }
    }

    const matchPercentage = recipe.ingredients.length
      ? Math.round(
          matched.length / recipe.ingredients.length * 100
        )
      : 0

    const rescueScore = Math.round(
      matchPercentage * 0.7 +
      Math.min(urgentIds.size, 3) / 3 * 30
    )

    return {
      ...recipe,
      matched,
      missing,
      matchedCount: matched.length,
      matchPercentage,
      rescueScore,
    }
  })
)

// ========================================
// FILTERING & PAGINATION
// ========================================

const filteredRecipes = computed(() => {
  const search = recipeSearch.value.trim().toLowerCase()

  const list = analysedRecipes.value.filter(recipe => {
    if (activeTab.value === 'saved' && !isSaved(recipe.id)) {
      return false
    }

    if (
      activeTab.value === 'mine' &&
      selectionApplied.value &&
      recipe.matchedCount === 0
    ) {
      return false
    }

    const searchable = [
      recipe.name,
      ...recipe.ingredients,
    ].join(' ').toLowerCase()

    if (search && !searchable.includes(search)) {
      return false
    }

    if (maxTime.value) {
      if (
        recipe.prepTime === null ||
        recipe.prepTime > Number(maxTime.value)
      ) {
        return false
      }
    }

    if (
      diet.value &&
      !recipe.dietaryTags.some(
        tag => tag.toLowerCase() === diet.value.toLowerCase()
      )
    ) {
      return false
    }

    return true
  })

  return [...list].sort((a, b) => {
    if (sortBy.value === 'match') {
      return b.matchPercentage - a.matchPercentage
    }

    if (sortBy.value === 'time') {
      return (a.prepTime ?? Infinity) - (b.prepTime ?? Infinity)
    }

    return b.rescueScore - a.rescueScore
  })
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredRecipes.value.length / pageSize))
)

const visibleRecipes = computed(() => {
  const start = (currentPage.value - 1) * pageSize

  return filteredRecipes.value.slice(start, start + pageSize)
})

watch(
  [activeTab, recipeSearch, maxTime, diet, sortBy],
  () => {
    currentPage.value = 1
  }
)

watch(totalPages, count => {
  if (currentPage.value > count) {
    currentPage.value = count
  }
})

watch(activeTab, loadRecipes)

watch(apiIngredients, () => {
  if (activeTab.value === 'mine') {
    loadRecipes()
  }
})

function changePage(page) {
  currentPage.value = Math.max(
    1,
    Math.min(totalPages.value, page)
  )

  document.getElementById('recipe-discovery')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function clearRecipeFilters() {
  recipeSearch.value = ''
  maxTime.value = ''
  diet.value = ''
  sortBy.value = 'rescue'
}

function openRecipe(recipe) {
  router.push(
    `/freshness/recipes/${encodeURIComponent(recipe.id)}`
  )
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    showIngredientModal.value = false
  }
}

onMounted(() => {
  loadRecipes()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  activeController?.abort()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main class="freshness-page">

    <!-- HERO -->
    <header class="hero-panel animate-rise">
      <div class="hero-content">
        <p class="eyebrow">YOUR SMART KITCHEN</p>
        <h1>Freshness & Recipes</h1>
        <p>
          Make the most of what's in your kitchen.
          Less waste, more delicious ideas.
        </p>
      </div>

      <span class="hero-doodle" aria-hidden="true"><FoodIcon kind="leafy" /></span>
    </header>

    <!-- SUMMARY CARDS -->
    <section class="stats-grid" aria-label="Kitchen summary">
      <article class="stat-card stat-total">
        <span class="stat-label">TOTAL FOOD</span>
        <strong>{{ summary.total }}</strong>
        <span class="stat-caption">Items in your kitchen</span>
      </article>

      <article class="stat-card stat-fresh">
        <span class="stat-label">FRESH</span>
        <strong>{{ summary.fresh }}</strong>
        <span class="stat-caption">Good to keep</span>
      </article>

      <article class="stat-card stat-soon">
        <span class="stat-label">EAT SOON</span>
        <strong>{{ summary.soon }}</strong>
        <span class="stat-caption">Within 3 days</span>
      </article>

      <article class="stat-card stat-expired">
        <span class="stat-label">EXPIRED</span>
        <strong>{{ summary.expired }}</strong>
        <span class="stat-caption">Needs attention</span>
      </article>
    </section>

    <!-- EAT SOON -->
    <section class="paper-panel eat-soon-panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">YOUR FRESHNESS TIMELINE</p>
          <h2>Eat Soon</h2>
          <p class="section-subtitle">
            Keep an eye on food approaching its estimated expiry date.
          </p>
        </div>

        <span class="section-counter">
          {{ eatSoonItems.length }} items
        </span>
      </div>

      <div class="timeline-toolbar">
        <label class="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>

          <input
            v-model="eatSoonSearch"
            type="search"
            placeholder="Search your ingredients..."
          />
        </label>

        <select v-model="eatSoonSort" class="styled-select">
          <option value="expiry">Expiring first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div class="timeline-list">
        <TransitionGroup name="timeline">
          <article
            v-for="item in visibleEatSoon"
            :key="item.localId"
            class="timeline-item"
            :class="item.status"
          >
            <button
              class="timeline-main"
              :aria-expanded="expandedItem === item.localId"
              @click="toggleExpanded(item.localId)"
            >
              <span class="timeline-dot"></span>

              <span class="timeline-info">
                <strong>{{ item.name }}</strong>
                <small>
                  {{ item.quantity }} {{ item.unit || '' }}
                  <span class="detail-separator">·</span>
                  {{ item.storageLabel }}
                </small>
              </span>

              <span class="expiry-pill" :class="item.status">
                {{ item.expiryText }}
              </span>

              <span
                class="expand-chevron"
                :class="{ rotated: expandedItem === item.localId }"
              >
                ⌄
              </span>
            </button>

            <Transition name="expand">
              <div
                v-if="expandedItem === item.localId"
                class="timeline-details"
              >
                <div>
                  <span>Expiry date</span>
                  <strong>{{ item.expiresAt }}</strong>
                </div>

                <div>
                  <span>Storage</span>
                  <strong>{{ item.storageLabel }}</strong>
                </div>

                <div>
                  <span>Quantity</span>
                  <strong>
                    {{ item.quantity }} {{ item.unit || '' }}
                  </strong>
                </div>

                <p class="expiry-disclaimer">
                  These are demo expiry dates.
                  Check food labels and condition before use.
                </p>
              </div>
            </Transition>
          </article>
        </TransitionGroup>

        <div
          v-if="!filteredEatSoon.length"
          class="empty-state"
        >
          <h3>No ingredients found</h3>
          <p>
            {{
              eatSoonSearch
                ? 'Try another ingredient name.'
                : 'Nothing needs attention right now.'
            }}
          </p>
        </div>
      </div>

      <button
        v-if="filteredEatSoon.length > 4"
        class="show-more-button"
        @click="showAllEatSoon = !showAllEatSoon"
      >
        {{
          showAllEatSoon
            ? 'Show less'
            : 'View all expiring items'
        }}
        <span>{{ showAllEatSoon ? '↑' : '↓' }}</span>
      </button>
    </section>

    <!-- RECIPE DISCOVERY -->
    <section id="recipe-discovery" class="paper-panel recipe-panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">MAKE SOMETHING GOOD</p>
          <h2>Recipe Discovery</h2>
          <p class="section-subtitle">
            Turn what you have into something delicious.
          </p>
        </div>

        <span class="recipe-stamp">LET'S COOK!</span>
      </div>

      <!-- TABS -->
      <div class="recipe-nav">
        <div class="tab-group" role="tablist">
          <button
            role="tab"
            :aria-selected="activeTab === 'mine'"
            :class="{ active: activeTab === 'mine' }"
            @click="activeTab = 'mine'"
          >
            My Ingredients
          </button>

          <button
            role="tab"
            :aria-selected="activeTab === 'explore'"
            :class="{ active: activeTab === 'explore' }"
            @click="activeTab = 'explore'"
          >
            Explore
          </button>

          <button
            role="tab"
            :aria-selected="activeTab === 'saved'"
            :class="{ active: activeTab === 'saved' }"
            @click="activeTab = 'saved'"
          >
            Saved
            <span class="saved-count">{{ savedIds.length }}</span>
          </button>
        </div>

        <button
          v-if="activeTab === 'mine'"
          class="choose-ingredients-button"
          @click="openIngredientModal"
        >
          <span>Choose Ingredients</span>
          <span class="plus-sign">+</span>
        </button>
      </div>

      <!-- TAB DESCRIPTION -->
      <Transition name="fade-slide" mode="out-in">
        <div :key="`${activeTab}-${selectionApplied}`" class="tab-description">
          <template v-if="activeTab === 'mine'">
            <div v-if="selectionApplied" class="selection-summary">
              <div>
                <strong>
                  Cooking with {{ selectedInventory.length }} ingredients
                </strong>
                <p>Recipes matching your selected ingredients.</p>
              </div>

              <button @click="resetIngredients">
                Reset selection
              </button>

              <div class="selected-tags">
                <span
                  v-for="item in selectedInventory"
                  :key="item.localId"
                >
                  {{ item.name }}
                </span>
              </div>
            </div>

            <p v-else>
              Real recipes ranked by your available ingredients and
              their expiry urgency.
            </p>
          </template>

          <p v-else-if="activeTab === 'explore'">
            Discover recipes from TheMealDB.
          </p>

          <p v-else>
            Your bookmarked recipes in one place.
          </p>
        </div>
      </Transition>

      <!-- FILTERS -->
      <div class="recipe-toolbar">
        <label class="search-field recipe-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>

          <input
            v-model="recipeSearch"
            type="search"
            placeholder="Search recipes..."
          />
        </label>

        <select v-model="maxTime" class="styled-select">
          <option value="">Any cooking time</option>
          <option value="15">Under 15 min</option>
          <option value="30">Under 30 min</option>
          <option value="60">Under 60 min</option>
        </select>

        <select v-model="diet" class="styled-select">
          <option value="">All diets</option>
          <option value="Vegetarian">Vegetarian</option>
          <option value="Vegan">Vegan</option>
        </select>

        <select v-model="sortBy" class="styled-select">
          <option value="rescue">Best rescue score</option>
          <option value="match">Best ingredient match</option>
          <option value="time">Quickest first</option>
        </select>

        <button class="clear-filters" @click="clearRecipeFilters">
          Clear
        </button>
      </div>

      <!-- RESULTS -->
      <div class="results-heading">
        <span>
          <strong>{{ filteredRecipes.length }}</strong>
          recipes found
        </span>

        <span v-if="!recipesLoading">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
      </div>

      <!-- LOADING -->
      <div v-if="recipesLoading" class="recipe-loading">
        <div class="loading-spinner"></div>
        <h3>Finding something delicious...</h3>
        <p>Searching TheMealDB for recipes.</p>
      </div>

      <!-- ERROR -->
      <div v-else-if="recipesError" class="recipe-error">
        <h3>Couldn't load recipes</h3>
        <p>{{ recipesError }}</p>
        <button @click="loadRecipes">Try Again</button>
      </div>

      <!-- RECIPE CARDS -->
      <Transition v-else name="fade-slide" mode="out-in">
        <div
          :key="`${activeTab}-${currentPage}-${recipeSearch}-${maxTime}-${diet}-${sortBy}-${selectionApplied}`"
        >
          <div v-if="visibleRecipes.length" class="recipe-grid">
            <article
              v-for="(recipe, index) in visibleRecipes"
              :key="recipe.id"
              class="recipe-card"
              :style="{ '--card-index': index }"
            >
              <div class="recipe-image-wrap">
                <img
                  v-if="recipe.image"
                  :src="recipe.image"
                  :alt="recipe.name"
                  loading="lazy"
                />

                <div v-else class="recipe-image-placeholder">
                  <span>FRESH IDEAS</span>
                </div>

                <span class="match-badge">
                  {{ recipe.matchPercentage }}% match
                </span>

                <button
                  class="bookmark-button"
                  :class="{ saved: isSaved(recipe.id) }"
                  :aria-label="
                    isSaved(recipe.id)
                      ? `Unsave ${recipe.name}`
                      : `Save ${recipe.name}`
                  "
                  @click="toggleSave(recipe.id)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    :fill="isSaved(recipe.id) ? 'currentColor' : 'none'"
                  >
                    <path
                      d="M6 3.5h12v17l-6-4-6 4z"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div class="recipe-card-body">
                <h3>{{ recipe.name }}</h3>

                <div class="recipe-meta">
                  <span v-if="recipe.prepTime">
                    {{ recipe.prepTime }} min
                  </span>

                  <span
                    v-for="tag in recipe.dietaryTags.slice(0, 2)"
                    :key="tag"
                  >
                    {{ tag }}
                  </span>
                </div>

                <div class="match-section">
                  <div class="match-labels">
                    <span>Ingredient match</span>
                    <strong>{{ recipe.matchPercentage }}%</strong>
                  </div>

                  <div
                    class="progress-track"
                    role="progressbar"
                    :aria-valuenow="recipe.matchPercentage"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-label="Ingredient match"
                  >
                    <div
                      class="progress-fill"
                      :style="{ width: `${recipe.matchPercentage}%` }"
                    ></div>
                  </div>
                </div>

                <div class="ingredient-counts">
                  <span>
                    <strong>{{ recipe.matched.length }}</strong> have
                  </span>
                  <span>
                    <strong>{{ recipe.missing.length }}</strong> missing
                  </span>
                </div>

                <div class="ingredient-preview">
                  <p>
                    <strong>Have:</strong>
                    {{
                      recipe.matched.slice(0, 3).join(', ') || 'None'
                    }}
                  </p>

                  <p>
                    <strong>Need:</strong>
                    {{
                      recipe.missing.slice(0, 3).join(', ') ||
                      'Nothing else'
                    }}
                  </p>
                </div>

                <div class="recipe-card-footer">
                  <span class="rescue-score">
                    Rescue score: {{ recipe.rescueScore }}
                  </span>

                  <button
                    class="view-recipe-button"
                    @click="openRecipe(recipe)"
                  >
                    View Recipe <span>→</span>
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="empty-state recipe-empty">
            <h3>
              {{
                activeTab === 'saved'
                  ? 'No saved recipes found'
                  : 'No recipes found'
              }}
            </h3>

            <p>
              {{
                activeTab === 'saved'
                  ? 'Save recipes to see them here.'
                  : 'Try adjusting your filters or ingredient selection.'
              }}
            </p>

            <button
              v-if="activeTab !== 'saved'"
              class="empty-action"
              @click="clearRecipeFilters(); resetIngredients()"
            >
              Reset filters
            </button>
          </div>
        </div>
      </Transition>

      <!-- PAGINATION -->
      <nav
        v-if="!recipesLoading && !recipesError && totalPages > 1"
        class="pagination"
        aria-label="Recipe pagination"
      >
        <button
          :disabled="currentPage === 1"
          @click="changePage(currentPage - 1)"
        >
          ← Previous
        </button>

        <span>{{ currentPage }} / {{ totalPages }}</span>

        <button
          :disabled="currentPage === totalPages"
          @click="changePage(currentPage + 1)"
        >
          Next →
        </button>
      </nav>
    </section>

    <!-- INGREDIENT MODAL -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showIngredientModal"
          class="ingredient-backdrop"
          @click.self="showIngredientModal = false"
        >
          <section
            class="ingredient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-heading"
          >
            <div class="modal-heading">
              <div>
                <p class="eyebrow">YOUR KITCHEN, YOUR RECIPES</p>
                <h2 id="modal-heading">Choose Ingredients</h2>
                <p>Select the ingredients you want to cook with.</p>
              </div>

              <button
                class="modal-close"
                aria-label="Close"
                @click="showIngredientModal = false"
              >
                ×
              </button>
            </div>

            <label class="search-field modal-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>

              <input
                v-model="ingredientSearch"
                type="search"
                placeholder="Search your ingredients..."
              />
            </label>

            <div class="modal-selection-header">
              <strong>{{ draftSelected.length }} selected</strong>

              <div class="modal-text-actions">
                <button
                  @click="
                    draftSelected = usableInventory.map(
                      item => item.localId
                    )
                  "
                >
                  Select all
                </button>

                <button @click="draftSelected = []">
                  Clear
                </button>
              </div>
            </div>

            <div class="ingredient-picker-grid">
              <button
                v-for="item in modalInventory"
                :key="item.localId"
                class="ingredient-choice"
                :class="{
                  selected: draftSelected.includes(item.localId)
                }"
                :aria-pressed="draftSelected.includes(item.localId)"
                @click="toggleIngredient(item.localId)"
              >
                <span class="choice-check">
                  {{
                    draftSelected.includes(item.localId)
                      ? '✓'
                      : ''
                  }}
                </span>

                <span class="choice-info">
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.expiryText }}</small>
                </span>
              </button>
            </div>

            <div class="modal-footer">
              <button
                class="cancel-button"
                @click="showIngredientModal = false"
              >
                Cancel
              </button>

              <button
                class="apply-button"
                :disabled="!draftSelected.length"
                @click="applyIngredients"
              >
                Find Recipes →
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.freshness-page {
  --fc-ink: #123f3b;
  --fc-aqua: #0fa89c;
  --fc-soft: #d9f4ef;
  --fc-paper: #fdfaf3;
  --fc-yellow: #ffdd69;
  --fc-lime: #dff09c;
  --fc-muted: #527b75;

  max-width: 1280px;
  margin: 0 auto;
  padding: 35px 24px 80px;
  color: var(--fc-ink);
  font-family: 'Patrick Hand', cursive;
  font-size: 18px;
}

.freshness-page *,
.ingredient-modal * {
  box-sizing: border-box;
}

.freshness-page h1,
.freshness-page h2,
.freshness-page h3,
.ingredient-modal h2 {
  font-family: 'Kalam', cursive;
  color: var(--fc-ink);
  margin: 0;
}

.freshness-page button,
.freshness-page input,
.freshness-page select,
.ingredient-modal button,
.ingredient-modal input {
  font: inherit;
}

.freshness-page button,
.ingredient-modal button {
  cursor: pointer;
}

.freshness-page button:focus-visible,
.freshness-page input:focus-visible,
.freshness-page select:focus-visible,
.ingredient-modal button:focus-visible,
.ingredient-modal input:focus-visible {
  outline: 3px solid var(--fc-aqua);
  outline-offset: 3px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--fc-aqua);
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1.6px;
}

.paper-panel {
  background: var(--fc-paper);
  border: 2px solid var(--fc-ink);
  border-radius: 19px;
  padding: 30px;
  box-shadow: 6px 7px 0 var(--fc-ink);
  margin-bottom: 35px;
}

/* HERO */

.hero-panel {
  position: relative;
  display: flex;
  justify-content: space-between;
  overflow: hidden;
  padding: 34px 38px;
  margin-bottom: 30px;
  border: 2px solid var(--fc-ink);
  border-radius: 20px;
  background: #fbfffd;
  box-shadow: 6px 7px 0 var(--fc-ink);
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-content h1 {
  font-size: clamp(2.3rem, 4vw, 3.2rem);
  line-height: 1.2;
}

.hero-content > p:last-child {
  margin: 12px 0 0;
  color: var(--fc-muted);
  font-size: 19px;
}

.hero-decoration {
  position: absolute;
  top: 0;
  right: 0;
  width: 230px;
  height: 100%;
  pointer-events: none;
}

.decoration-circle {
  position: absolute;
  border: 2px solid var(--fc-ink);
  border-radius: 50%;
}

.circle-one {
  width: 150px;
  height: 150px;
  right: -30px;
  top: -65px;
  background: var(--fc-lime);
}

.circle-two {
  width: 90px;
  height: 90px;
  right: 110px;
  bottom: -50px;
  background: var(--fc-soft);
}

.decoration-spark {
  position: absolute;
  right: 65px;
  bottom: 8px;
  font-size: 62px;
  color: var(--fc-aqua);
  animation: float-slow 5s ease-in-out infinite;
}

/* SUMMARY CARDS */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 35px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  min-height: 160px;
  padding: 22px;
  border: 2px solid var(--fc-ink);
  border-radius: 17px;
  box-shadow: 5px 6px 0 var(--fc-ink);
  transition: transform .25s ease, box-shadow .25s ease;
  animation: rise-in .55s both;
}

.stat-card:nth-child(1) { animation-delay: .08s; }
.stat-card:nth-child(2) { animation-delay: .15s; }
.stat-card:nth-child(3) { animation-delay: .22s; }
.stat-card:nth-child(4) { animation-delay: .29s; }

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 5px 11px 0 var(--fc-ink);
}

.stat-total { background: var(--fc-soft); }
.stat-fresh { background: var(--fc-lime); }
.stat-soon { background: #fff7d7; }
.stat-expired { background: #ffe2dd; }

.stat-label {
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 1px;
}

.stat-card strong {
  margin-top: 10px;
  font-family: 'Kalam', cursive;
  font-size: 3rem;
  line-height: 1;
}

.stat-caption {
  margin-top: auto;
  font-size: 15px;
  color: var(--fc-muted);
}

/* SECTION HEADINGS */

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 22px;
}

.section-header h2 {
  font-size: 2rem;
}

.section-subtitle {
  margin: 7px 0 0;
  color: var(--fc-muted);
}

.section-counter {
  flex-shrink: 0;
  padding: 7px 13px;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  background: var(--fc-yellow);
  font-weight: bold;
}

/* SEARCH AND CONTROLS */

.search-field {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 0 14px;
  background: white;
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  transition: box-shadow .2s ease, border-color .2s ease;
}

.search-field:focus-within {
  border-color: var(--fc-aqua);
  box-shadow: 0 0 0 3px rgba(15, 168, 156, .13);
}

.search-field svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  flex-shrink: 0;
}

.search-field input {
  width: 100%;
  min-width: 0;
  height: 47px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fc-ink);
}

.search-field input:focus-visible {
  outline: none;
}

.styled-select {
  min-width: 0;
  height: 51px;
  padding: 0 12px;
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  background: white;
  color: var(--fc-ink);
  cursor: pointer;
}

/* EAT SOON */

.timeline-toolbar {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
  margin-bottom: 23px;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item {
  border: 1.5px solid #a5cac4;
  border-radius: 12px;
  background: #fffefa;
  overflow: hidden;
  transition:
    border-color .2s ease,
    background .2s ease,
    transform .2s ease;
}

.timeline-item:hover {
  transform: translateX(4px);
  border-color: var(--fc-ink);
}

.timeline-item.expired {
  background: #fff0ec;
}

.timeline-main {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 15px;
  padding: 17px 18px;
  background: transparent;
  border: none;
  color: var(--fc-ink);
  text-align: left;
}

.timeline-dot {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border: 2px solid var(--fc-ink);
  border-radius: 50%;
  background: var(--fc-yellow);
  box-shadow: 0 0 0 5px #fff6d4;
}

.timeline-item.expired .timeline-dot {
  background: #ff9587;
  box-shadow: 0 0 0 5px #ffe2dd;
}

.timeline-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.timeline-info strong {
  font-size: 20px;
}

.timeline-info small {
  margin-top: 2px;
  font-size: 15px;
  color: var(--fc-muted);
}

.detail-separator {
  margin: 0 4px;
}

.expiry-pill {
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1.5px solid var(--fc-ink);
  border-radius: 8px;
  background: var(--fc-yellow);
  font-size: 15px;
}

.expiry-pill.expired {
  background: #ffb1a4;
}

.expand-chevron {
  font-size: 24px;
  transition: transform .25s ease;
}

.expand-chevron.rotated {
  transform: rotate(180deg);
}

.timeline-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  padding: 17px 20px;
  border-top: 1px dashed #9bcac5;
  background: rgba(217, 244, 239, .4);
}

.timeline-details > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.timeline-details span {
  color: var(--fc-muted);
  font-size: 14px;
}

.timeline-details strong {
  font-size: 17px;
}

.expiry-disclaimer {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 13px;
  color: var(--fc-muted);
}

.show-more-button {
  display: block;
  margin: 22px auto 0;
  padding: 9px 16px;
  border: none;
  background: transparent;
  color: var(--fc-ink);
  font-weight: bold;
  text-decoration: underline;
}

.show-more-button span {
  margin-left: 8px;
}

/* RECIPE NAV */

.recipe-panel {
  scroll-margin-top: 85px;
}

.recipe-stamp {
  flex-shrink: 0;
  padding: 10px 15px;
  background: var(--fc-lime);
  border: 2px solid var(--fc-ink);
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  transform: rotate(4deg);
}

.recipe-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
  padding-bottom: 19px;
  border-bottom: 2px dashed #a5cac4;
}

.tab-group {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.tab-group button {
  padding: 10px 17px;
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  background: white;
  color: var(--fc-ink);
  transition:
    background .2s ease,
    transform .2s ease,
    box-shadow .2s ease;
}

.tab-group button:hover {
  transform: translateY(-2px);
}

.tab-group button.active {
  background: var(--fc-yellow);
  box-shadow: 3px 4px 0 var(--fc-ink);
  transform: translateY(-2px);
}

.saved-count {
  margin-left: 4px;
  font-weight: bold;
}

.choose-ingredients-button {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 17px;
  background: var(--fc-soft);
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  color: var(--fc-ink);
  font-weight: bold;
  transition: transform .2s ease, box-shadow .2s ease;
}

.choose-ingredients-button:hover {
  transform: translateY(-3px);
  box-shadow: 3px 4px 0 var(--fc-ink);
}

.plus-sign {
  font-size: 24px;
  line-height: .7;
}

.tab-description {
  min-height: 52px;
  padding: 17px 0;
  color: var(--fc-muted);
}

.tab-description > p {
  margin: 0;
}

.selection-summary {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 15px;
  background: #e9f8f3;
  border: 1.5px solid #9bcac5;
  border-radius: 12px;
}

.selection-summary strong {
  color: var(--fc-ink);
}

.selection-summary p {
  margin: 4px 0 0;
}

.selection-summary > button {
  border: none;
  background: transparent;
  color: var(--fc-ink);
  text-decoration: underline;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  gap: 7px;
}

.selected-tags span {
  padding: 4px 10px;
  border: 1px solid #9bcac5;
  border-radius: 20px;
  background: white;
  color: var(--fc-ink);
  font-size: 15px;
}

/* FILTERS */

.recipe-toolbar {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.3fr auto;
  gap: 10px;
  margin: 15px 0 22px;
}

.clear-filters {
  padding: 0 18px;
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  background: var(--fc-soft);
  color: var(--fc-ink);
}

.results-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 19px;
  color: var(--fc-muted);
  font-size: 16px;
}

/* LOADING AND ERROR */

.recipe-loading,
.recipe-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  gap: 12px;
  padding: 30px;
  text-align: center;
}

.recipe-loading h3,
.recipe-error h3 {
  font-size: 1.6rem;
}

.recipe-loading p,
.recipe-error p {
  margin: 0;
  color: var(--fc-muted);
}

.loading-spinner {
  width: 45px;
  height: 45px;
  border: 5px solid var(--fc-soft);
  border-top-color: var(--fc-aqua);
  border-radius: 50%;
  animation: recipe-spin .8s linear infinite;
}

.recipe-error button {
  margin-top: 8px;
  padding: 10px 20px;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  background: var(--fc-yellow);
  color: var(--fc-ink);
}

/* RECIPE CARDS */

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}

.recipe-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid var(--fc-ink);
  border-radius: 15px;
  background: #fffefa;
  box-shadow: 4px 5px 0 var(--fc-ink);
  transition: transform .25s ease, box-shadow .25s ease;
  animation: rise-in .45s both;
  animation-delay: calc(var(--card-index) * 55ms);
}

.recipe-card:hover {
  transform: translateY(-6px);
  box-shadow: 4px 11px 0 var(--fc-ink);
}

.recipe-image-wrap {
  position: relative;
  height: 180px;
  overflow: hidden;
  background: var(--fc-soft);
  border-bottom: 2px solid var(--fc-ink);
}

.recipe-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .45s ease;
}

.recipe-card:hover .recipe-image-wrap img {
  transform: scale(1.06);
}

.recipe-image-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--fc-muted);
  font-family: 'Kalam', cursive;
  font-size: 22px;
  letter-spacing: 2px;
}

.match-badge {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 5px 10px;
  border: 1.5px solid var(--fc-ink);
  border-radius: 7px;
  background: var(--fc-lime);
  font-size: 14px;
  font-weight: bold;
}

.bookmark-button {
  position: absolute;
  top: 11px;
  right: 11px;
  display: grid;
  place-items: center;
  width: 37px;
  height: 37px;
  border: 1.5px solid var(--fc-ink);
  border-radius: 9px;
  background: white;
  color: var(--fc-ink);
  transition: transform .2s ease, background .2s ease;
}

.bookmark-button:hover {
  transform: scale(1.1);
}

.bookmark-button.saved {
  background: var(--fc-yellow);
}

.bookmark-button svg {
  width: 21px;
  height: 21px;
}

.recipe-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 18px;
}

.recipe-card-body h3 {
  font-size: 1.45rem;
  line-height: 1.25;
}

.recipe-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0 18px;
}

.recipe-meta span {
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--fc-soft);
  font-size: 14px;
}

.match-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  font-size: 15px;
}

.progress-track {
  height: 10px;
  overflow: hidden;
  border: 1px solid var(--fc-ink);
  border-radius: 10px;
  background: #e8f0ec;
}

.progress-fill {
  height: 100%;
  border-radius: 10px;
  background: var(--fc-aqua);
  transition: width .7s ease;
}

.ingredient-counts {
  display: flex;
  justify-content: space-between;
  margin-top: 11px;
  font-size: 15px;
}

.ingredient-preview {
  padding: 12px;
  margin-top: 15px;
  border-radius: 9px;
  background: #f1f8f4;
  font-size: 15px;
}

.ingredient-preview p {
  margin: 4px 0;
  overflow-wrap: anywhere;
}

.recipe-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 18px;
}

.rescue-score {
  font-size: 14px;
  color: var(--fc-muted);
}

.view-recipe-button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border: 2px solid var(--fc-ink);
  border-radius: 8px;
  background: var(--fc-yellow);
  color: var(--fc-ink);
  font-weight: bold;
  white-space: nowrap;
  transition: transform .2s ease;
}

.view-recipe-button:hover {
  transform: translateX(3px);
}

/* PAGINATION */

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 18px;
  margin-top: 30px;
}

.pagination button {
  padding: 9px 15px;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  background: white;
  color: var(--fc-ink);
}

.pagination button:hover:not(:disabled) {
  background: var(--fc-yellow);
}

.pagination button:disabled {
  opacity: .35;
  cursor: not-allowed;
}

/* EMPTY STATES */

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--fc-muted);
}

.empty-state h3 {
  margin-bottom: 8px;
  font-size: 1.5rem;
}

.empty-state p {
  margin: 0;
}

.recipe-empty {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.empty-action {
  margin-top: 15px;
  padding: 8px 16px;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  background: var(--fc-yellow);
}

/* ANIMATIONS */

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float-slow {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-9px) rotate(8deg); }
}

@keyframes recipe-spin {
  to { transform: rotate(360deg); }
}

.animate-rise {
  animation: rise-in .6s ease both;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.timeline-enter-active,
.timeline-leave-active {
  transition: all .25s ease;
}

.timeline-enter-from,
.timeline-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.timeline-move {
  transition: transform .3s ease;
}

.expand-enter-active,
.expand-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* RESPONSIVE */

@media (max-width: 1100px) {
  .recipe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-search {
    grid-column: 1 / -1;
  }

  .clear-filters {
    min-height: 48px;
  }
}

@media (max-width: 750px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-decoration {
    opacity: .35;
  }

  .timeline-toolbar {
    grid-template-columns: 1fr;
  }

  .paper-panel {
    padding: 21px;
  }

  .recipe-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .freshness-page {
    padding: 20px 14px 60px;
  }

  .hero-panel {
    padding: 25px 20px;
  }

  .stat-card {
    min-height: 135px;
    padding: 15px;
  }

  .stat-card strong {
    font-size: 2.5rem;
  }

  .section-header {
    align-items: flex-start;
  }

  .recipe-stamp {
    display: none;
  }

  .recipe-toolbar {
    grid-template-columns: 1fr;
  }

  .recipe-search {
    grid-column: auto;
  }

  .timeline-details {
    grid-template-columns: repeat(2, 1fr);
  }

  .timeline-main {
    gap: 10px;
    padding: 14px 12px;
  }

  .expiry-pill {
    font-size: 13px;
    padding: 4px 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .freshness-page *,
  .freshness-page *::before,
  .freshness-page *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
</style>

<style>
/* Ingredient modal is teleported to body. */

.ingredient-backdrop {
  --fc-ink: #123f3b;
  --fc-aqua: #0fa89c;
  --fc-soft: #d9f4ef;
  --fc-yellow: #ffdd69;
  --fc-muted: #527b75;

  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: rgba(255, 255, 255, .78);
  backdrop-filter: blur(9px);
  -webkit-backdrop-filter: blur(9px);
}

.ingredient-modal {
  display: flex;
  flex-direction: column;
  width: min(670px, 100%);
  max-height: min(85vh, 760px);
  padding: 26px;
  border: 2px solid var(--fc-ink);
  border-radius: 19px;
  background: #fdfaf3;
  box-shadow: 7px 9px 0 var(--fc-ink);
  color: var(--fc-ink);
  font-family: 'Patrick Hand', cursive;
  font-size: 18px;
}

.ingredient-modal * {
  box-sizing: border-box;
}

.ingredient-modal .eyebrow {
  margin: 0 0 7px;
  color: var(--fc-aqua);
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1.5px;
}

.modal-heading {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 20px;
}

.modal-heading h2 {
  margin: 0;
  font-family: 'Kalam', cursive;
  font-size: 2rem;
}

.modal-heading p:last-child {
  margin: 5px 0 0;
  color: var(--fc-muted);
}

.modal-close {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  flex-shrink: 0;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  background: white;
  font-size: 25px;
  cursor: pointer;
}

.ingredient-modal .search-field {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 14px;
  border: 2px solid var(--fc-ink);
  border-radius: 10px;
  background: white;
}

.ingredient-modal .search-field svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.ingredient-modal .search-field input {
  width: 100%;
  height: 47px;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
}

.modal-selection-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 13px;
}

.modal-text-actions {
  display: flex;
  gap: 15px;
}

.modal-text-actions button {
  border: none;
  background: transparent;
  color: var(--fc-ink);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.ingredient-picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding: 3px;
}

.ingredient-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;
  border: 2px solid #a5cac4;
  border-radius: 11px;
  background: white;
  color: var(--fc-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background .2s ease,
    transform .2s ease,
    border-color .2s ease;
}

.ingredient-choice:hover {
  transform: translateY(-2px);
}

.ingredient-choice.selected {
  border-color: var(--fc-aqua);
  background: var(--fc-soft);
}

.choice-check {
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  flex-shrink: 0;
  border: 2px solid var(--fc-ink);
  border-radius: 6px;
  background: white;
  font-weight: bold;
}

.ingredient-choice.selected .choice-check {
  background: var(--fc-aqua);
  color: white;
}

.choice-info {
  display: flex;
  flex-direction: column;
}

.choice-info small {
  color: var(--fc-muted);
  font-size: 14px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 18px;
  margin-top: 18px;
  border-top: 1px solid #a5cac4;
}

.cancel-button,
.apply-button {
  padding: 10px 18px;
  border: 2px solid var(--fc-ink);
  border-radius: 9px;
  color: var(--fc-ink);
  font: inherit;
  cursor: pointer;
}

.cancel-button {
  background: white;
}

.apply-button {
  background: var(--fc-yellow);
}

.apply-button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity .25s ease;
}

.modal-enter-active .ingredient-modal,
.modal-leave-active .ingredient-modal {
  transition: transform .3s ease, opacity .3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .ingredient-modal,
.modal-leave-to .ingredient-modal {
  transform: translateY(20px) scale(.97);
  opacity: 0;
}

@media (max-width: 550px) {
  .ingredient-modal {
    padding: 17px;
  }

  .ingredient-picker-grid {
    grid-template-columns: 1fr;
  }

  .modal-footer {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ingredient-backdrop *,
  .ingredient-backdrop *::before,
  .ingredient-backdrop *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
</style>
