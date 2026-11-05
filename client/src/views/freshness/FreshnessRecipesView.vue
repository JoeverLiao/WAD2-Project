
<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

// ==========================================
// PAGE STATE
// ==========================================

const inventory = ref([])
const inventoryLoading = ref(false)
const inventoryError = ref('')
const inventoryLoaded = ref(false)

const activeTab = ref('mine')
const recipes = ref([])
const recipesLoading = ref(false)
const recipesError = ref('')

const search = ref('')
const cookingTime = ref('')
const timeEstimates = ref({})
const estimatingTimes = ref(false)
const sort = ref('rescue')
const currentPage = ref(1)
const pageSize = 6

const eatSoonOpen = ref(false)
const eatSoonSearch = ref('')
const eatSoonSort = ref('expiry')
const expandedItem = ref(null)

const modalOpen = ref(false)
const modalSearch = ref('')
const draftIds = ref([])
const selectedIds = ref([])
const selectionApplied = ref(false)

const userRecords = ref([])
const historyError = ref('')
const recipeActionId = ref(null)
const aiUsed = ref(false)

// ==========================================
// AUTHENTICATION
// ==========================================

function authHeaders() {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('fullcircle-token')

  return token
    ? { Authorization: `Bearer ${token}` }
    : {}
}

// ==========================================
// MONGODB INVENTORY
// ==========================================

function normalizeInventoryItem(item) {
  return {
    ...item,
    localId: String(item._id ?? item.id),
    name: String(item.name ?? 'Unnamed ingredient'),
    quantity: item.quantity ?? null,
    unit: item.unit ?? '',
    weightKg: item.weightKg ?? null,
    storage: item.storage ?? '',
    storageZone: item.storageZone ?? null,
    suggestedLocation: item.suggestedLocation ?? null,
    category: item.category ?? null,
    dietType: item.dietType ?? 'unknown',
    purchasedAt: item.purchasedAt ?? null,
    expiresAt: item.expiresAt ?? null,
    purchasePrice: item.purchasePrice ?? null,
  }
}

async function loadInventory() {
  inventoryLoading.value = true
  inventoryError.value = ''
  try {
    const { data } = await axios.get('/api/inventory', {
      withCredentials: true,
      headers: authHeaders(),
    })
    if (!Array.isArray(data.items)) throw new Error('Unexpected inventory response.')
    inventory.value = data.items
      .filter(item => item && (item._id || item.id))
      .map(normalizeInventoryItem)
    inventoryLoaded.value = true
    const validIds = new Set(inventory.value.map(x => x.localId))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  } catch (err) {
    console.error('Failed to load MongoDB inventory:', err)
    inventoryError.value = err.response?.status === 401
      ? 'Please log in to view your inventory.'
      : err.response ? `Inventory request failed (${err.response.status}).` : err.message
  } finally {
    inventoryLoading.value = false
  }
}



// ==========================================
// EXPIRY CALCULATIONS
// ==========================================

function daysUntil(value) {
  if (!value) return null

  const datePart = String(value).slice(0, 10)
  const date = new Date(`${datePart}T12:00:00`)

  if (Number.isNaN(date.getTime())) return null

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  return Math.round((date - today) / 86400000)
}

function expiryText(days) {
  if (days === null) return 'Date unknown'
  if (days < 0) return 'Past date'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days left`
}

function formatDate(value) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function displayQuantity(item) {
  if (item.quantity !== null && item.quantity !== undefined) {
    return `${item.quantity} ${item.unit || 'pcs'}`
  }

  if (item.weightKg !== null && item.weightKg !== undefined) {
    return `${item.weightKg} kg`
  }

  return 'Quantity not specified'
}

function formatLocation(value) {
  if (!value) return 'Not specified'

  return String(value)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

const items = computed(() =>
  inventory.value.map(item => {
    const days = daysUntil(item.expiresAt)

    return {
      ...item,
      days,
      expiryText: expiryText(days),
      status:
        days === null ? 'unknown'
        : days < 0 ? 'expired'
        : days <= 3 ? 'soon'
        : 'fresh',
      storageLabel: formatLocation(
        item.storageZone ?? item.storage ?? item.suggestedLocation
      ),
    }
  })
)

const stats = computed(() => ({
  total: items.value.length,
  fresh: items.value.filter(x => x.status === 'fresh').length,
  soon: items.value.filter(x => x.status === 'soon').length,
  expired: items.value.filter(x => x.status === 'expired').length,
}))

const urgentItems = computed(() =>
  items.value.filter(item =>
    item.days !== null && item.days <= 3
  )
)

const visibleUrgentItems = computed(() => {
  const q = eatSoonSearch.value.toLowerCase().trim()

  return urgentItems.value
    .filter(item => item.name.toLowerCase().includes(q))
    .sort((a, b) =>
      eatSoonSort.value === 'name'
        ? a.name.localeCompare(b.name)
        : a.days - b.days
    )
})

const usableItems = computed(() =>
  items.value.filter(item =>
    item.days === null || item.days >= 0
  )
)

const selectedItems = computed(() =>
  selectionApplied.value
    ? usableItems.value.filter(item =>
        selectedIds.value.includes(item.localId)
      )
    : usableItems.value
)

// ==========================================
// INGREDIENT SELECTION
// ==========================================

const modalItems = computed(() =>
  usableItems.value.filter(item =>
    item.name.toLowerCase().includes(modalSearch.value.toLowerCase())
  )
)

function openModal() {
  draftIds.value = selectionApplied.value
    ? [...selectedIds.value]
    : usableItems.value.map(item => item.localId)

  modalSearch.value = ''
  modalOpen.value = true
}

function toggleDraft(id) {
  draftIds.value = draftIds.value.includes(id)
    ? draftIds.value.filter(x => x !== id)
    : [...draftIds.value, id]
}

function applySelection() {
  selectedIds.value = [...draftIds.value]
  selectionApplied.value = true
  modalOpen.value = false
  activeTab.value = 'mine'
  currentPage.value = 1
}

function resetSelection() {
  selectedIds.value = []
  selectionApplied.value = false
  currentPage.value = 1
}

// ==========================================
// INGREDIENT NORMALISATION
// ==========================================

function canonicalName(value) {
  const name = String(value).toLowerCase().trim()

  const aliases = {
    eggs: 'egg',
    tomatoes: 'tomato',
    potatoes: 'potato',
    carrots: 'carrot',
    onions: 'onion',
    mushrooms: 'mushroom',
    'chicken breast': 'chicken',
    'white rice': 'rice',
    'brown rice': 'rice',
    'fresh milk': 'milk',
  }

  return aliases[name] ?? name
}

const apiIngredients = computed(() =>
  [...new Set(
    selectedItems.value
      .map(item => canonicalName(item.name))
      .filter(Boolean)
  )].slice(0, 8)
)

// ==========================================
// SAVED RECIPES
// ==========================================

const savedIds = computed(() => userRecords.value.filter(x => x.saved).map(x => String(x.recipeId)))
const cookedRecipes = computed(() => userRecords.value.filter(x => Number(x.cookCount || 0) > 0))
function userRecord(id) { return userRecords.value.find(x => String(x.recipeId) === String(id)) }
function isSaved(id) { return savedIds.value.includes(String(id)) }
function cookCount(id) { return Number(userRecord(id)?.cookCount || 0) }

async function historyRequest(path, options = {}) {
  try {
    const response = await axios({
      url: path,
      method: options.method || 'GET',
      data: options.body ? JSON.parse(options.body) : undefined,
      withCredentials: true,
      headers: { ...authHeaders(), ...options.headers },
      signal: options.signal,
    })
    return response.data ?? {}
  } catch (error) {
    if (axios.isCancel(error)) throw error
    const data = error.response?.data
    throw new Error(data?.message || data?.error ||
      (error.response ? `Request failed (${error.response.status})` : error.message))
  }
}



async function loadUserRecipes() {
  try {
    historyError.value = ''
    const data = await historyRequest('/api/user-recipes')
    userRecords.value = Array.isArray(data) ? data : (data.recipes || data.records || [])
  } catch (error) {
    historyError.value = error.message
  }
}

async function toggleSave(recipe) {
  if (recipeActionId.value) return
  recipeActionId.value = String(recipe.id)
  try {
    if (isSaved(recipe.id)) {
      await historyRequest(`/api/user-recipes/${encodeURIComponent(recipe.id)}/save`, { method: 'DELETE' })
    } else {
      await historyRequest('/api/user-recipes/save', { method: 'POST', body: JSON.stringify({
        recipeId: String(recipe.id), name: recipe.name, image: recipe.image,
        ingredients: recipe.ingredients, dietaryTags: recipe.dietaryTags,
      }) })
    }
    await loadUserRecipes()
    if (activeTab.value === 'saved') await loadRecipes()
  } catch (error) { historyError.value = error.message }
  finally { recipeActionId.value = null }
}

async function markCooked(recipe) {
  if (recipeActionId.value) return
  recipeActionId.value = String(recipe.id)
  try {
    await historyRequest('/api/user-recipes/cooked', { method: 'POST', body: JSON.stringify({
      recipeId: String(recipe.id), name: recipe.name, image: recipe.image,
      ingredients: recipe.ingredients, dietaryTags: recipe.dietaryTags,
    }) })
    await loadUserRecipes()
  } catch (error) { historyError.value = error.message }
  finally { recipeActionId.value = null }
}

// ==========================================
// THEMEALDB RECIPES
// ==========================================

function normalizeRecipe(raw) {
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map(item =>
          typeof item === 'string'
            ? item
            : item.name ?? item.ingredient ?? ''
        )
        .filter(Boolean)
    : []

  return {
    ...raw,
    id: String(raw.id ?? raw.idMeal ?? ''),
    name: raw.name ?? raw.strMeal ?? 'Recipe',
    image: raw.image ?? raw.strMealThumb ?? '',
    ingredients,
    prepTime: Number(raw.prepTime) || null,
    dietaryTags: Array.isArray(raw.dietaryTags)
      ? raw.dietaryTags
      : [],
  }
}

async function requestRecipes(url, signal) {
  const response = await axios.get(url, {
    withCredentials: true,
    headers: authHeaders(),
    signal,
  })
  const data = response.data
  const list = Array.isArray(data)
    ? data
    : data?.recipes ?? data?.data?.recipes ?? data?.meals ?? []
  if (!Array.isArray(list)) throw new Error('Invalid recipe response')
  return list.map(normalizeRecipe).filter(recipe => recipe.id)
}



let recipeController = null
let recipeRequestId = 0

async function loadRecipesByIds(ids, signal) {
  const results = await Promise.allSettled(ids.map(async id => {
    const response = await axios.get(`/api/freshness/recipes/${encodeURIComponent(id)}`, {
      withCredentials: true,
      headers: authHeaders(),
      signal,
    })
    const data = response.data
    return normalizeRecipe(data.recipe ?? data)
  }))
  return results.filter(x => x.status === 'fulfilled').map(x => x.value).filter(x => x.id)
}



async function loadRecipes() {
  const requestId = ++recipeRequestId
  recipeController?.abort()
  recipeController = new AbortController()
  const signal = recipeController.signal
  recipesLoading.value = true
  recipesError.value = ''
  recipes.value = []
  aiUsed.value = false
  estimatingTimes.value = false
  try {
    let result = []
    if (activeTab.value === 'mine') {
      if (apiIngredients.value.length) {
        const params = new URLSearchParams({ ingredients: apiIngredients.value.join(',') })
        result = await requestRecipes(`/api/freshness/recipes?${params}`, signal)
      }
    } else if (activeTab.value === 'explore') {
      result = await requestRecipes('/api/freshness/recipes/explore', signal)
    } else if (activeTab.value === 'saved' || activeTab.value === 'cooked') {
      const ids = activeTab.value === 'saved' ? savedIds.value : cookedRecipes.value.map(x => x.recipeId)
      result = await loadRecipesByIds(ids, signal)
      if (ids.length && !result.length && !signal.aborted) throw new Error('Could not retrieve your recipes')
    } else if (activeTab.value === 'ai') {
      const candidatesById = new Map()
      const explore = await requestRecipes('/api/freshness/recipes/explore', signal)
      for (const recipe of explore) candidatesById.set(recipe.id, recipe)
      if (apiIngredients.value.length) {
        const params = new URLSearchParams({ ingredients: apiIngredients.value.join(',') })
        const mine = await requestRecipes(`/api/freshness/recipes?${params}`, signal)
        for (const recipe of mine) candidatesById.set(recipe.id, recipe)
      }
      const candidates = [...candidatesById.values()].slice(0, 50)
      if (candidates.length) {
        const ranked = await historyRequest('/api/recipe-recommendations', {
          method: 'POST', body: JSON.stringify({ candidates }), signal,
        })
        aiUsed.value = Boolean(ranked.aiUsed)
        result = (ranked.recommendations || []).map(item => {
          const recipe = candidatesById.get(String(item.recipeId))
          return recipe ? { ...recipe, aiReason: item.reason } : null
        }).filter(Boolean)
      }
    }
    if (requestId === recipeRequestId && !signal.aborted) {
      recipes.value = result
      void loadTimeEstimates(result, requestId, signal)
    }
  } catch (err) {
    if (axios.isCancel(err) || err.name === 'AbortError') return
    if (requestId === recipeRequestId) {
      console.error('Recipe loading failed:', err)
      recipesError.value = err.message || 'Recipes could not be loaded.'
    }
  } finally {
    if (requestId === recipeRequestId) recipesLoading.value = false
  }
}

// ==========================================
// ESTIMATED COOKING TIMES
// ==========================================

async function loadTimeEstimates(list, requestId, signal) {
  if (!list.length) return
  estimatingTimes.value = true
  try {
    const estimates = {}
    // Backend accepts up to 30 recipes per request.
    for (let i = 0; i < list.length; i += 30) {
      if (signal.aborted) return
      const batch = list.slice(i, i + 30)
      const response = await axios.post('/api/freshness/recipes/estimate-times', {
        recipes: batch.map(recipe => ({
          id: recipe.id,
          name: recipe.name,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
        })),
      }, {
        withCredentials: true,
        headers: authHeaders(),
        signal,
      })
      Object.assign(estimates, response.data?.estimates || {})
    }
    if (requestId === recipeRequestId && !signal.aborted) {
      timeEstimates.value = { ...timeEstimates.value, ...estimates }
    }
  } catch (error) {
    if (!axios.isCancel(error) && error.name !== 'AbortError') {
      console.warn('Cooking-time estimates unavailable:', error.message)
    }
  } finally {
    if (requestId === recipeRequestId) estimatingTimes.value = false
  }
}



function estimatedMinutes(recipe) {
  const value = timeEstimates.value[String(recipe.id)]
  const minutes = Number(value)

  return (
    value != null &&
    Number.isFinite(minutes) &&
    minutes > 0
  )
    ? minutes
    : null
}

// RECIPE MATCHING
// ==========================================

function normaliseIngredient(value) {
  return canonicalName(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesIngredient(recipeIngredient, ownedIngredient) {
  const a = normaliseIngredient(recipeIngredient)
  const b = normaliseIngredient(ownedIngredient)

  if (!a || !b) return false

  return (
    a === b ||
    a.startsWith(`${b} `) ||
    a.endsWith(` ${b}`) ||
    a.includes(` ${b} `) ||
    b.startsWith(`${a} `)
  )
}

const analysedRecipes = computed(() =>
  recipes.value.map(recipe => {
    const matched = []
    const missing = []
    const urgentIds = new Set()

    for (const ingredient of recipe.ingredients) {
      const found = selectedItems.value.find(item =>
        matchesIngredient(ingredient, item.name)
      )

      if (found) {
        matched.push(ingredient)

        if (found.days !== null && found.days <= 3) {
          urgentIds.add(found.localId)
        }
      } else {
        missing.push(ingredient)
      }
    }

    const percentage = recipe.ingredients.length
      ? Math.round(
          matched.length / recipe.ingredients.length * 100
        )
      : 0

    return {
      ...recipe,
      matched,
      missing,
      percentage,
      rescueScore: Math.round(
        percentage * 0.7 +
        Math.min(urgentIds.size, 3) * 10
      ),
    }
  })
)

const filteredRecipes = computed(() => {
  const q = search.value.toLowerCase().trim()

  return analysedRecipes.value
    .filter(recipe => {
      if (activeTab.value === 'saved' && !isSaved(recipe.id)) {
        return false
      }

      if (
        q &&
        ![recipe.name, ...recipe.ingredients]
          .join(' ')
          .toLowerCase()
          .includes(q)
      ) {
        return false
      }

      if (cookingTime.value) {
        const minutes = estimatedMinutes(recipe)
        if (minutes === null) return false
        if (cookingTime.value === '60plus') {
          if (minutes < 60) return false
        } else if (minutes >= Number(cookingTime.value)) {
          return false
        }
      }

      return true
    })
    .sort((a, b) => {
      if (sort.value === 'time') {
        return (estimatedMinutes(a) ?? Infinity) - (estimatedMinutes(b) ?? Infinity)
      }
      if (activeTab.value === 'ai') return 0
      if (sort.value === 'match') {
        return b.percentage - a.percentage
      }

      if (sort.value === 'name') {
        return a.name.localeCompare(b.name)
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

// ==========================================
// WATCHERS
// ==========================================

watch([activeTab, search, cookingTime, sort], () => {
  currentPage.value = 1
})

watch(totalPages, count => {
  if (currentPage.value > count) currentPage.value = count
})

watch(activeTab, loadRecipes)

watch(apiIngredients, () => {
  if ((activeTab.value === 'mine' || activeTab.value === 'ai') && inventoryLoaded.value) {
    loadRecipes()
  }
})

// ==========================================
// NAVIGATION
// ==========================================


function goToInventory() {
  router.push('/dashboard')
}

function goToUrgentItems() {
  eatSoonOpen.value = true

  nextTick(() => {
    document.querySelector('.freshness-drawer')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}



function goToRecipes() {
  document.getElementById('recipe-discovery')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function checkIngredients() {
  eatSoonOpen.value = true
  goToRecipes()
}

function changePage(page) {
  currentPage.value = Math.max(
    1,
    Math.min(totalPages.value, page)
  )
  goToRecipes()
}

function openRecipe(recipe) {
  router.push(`/freshness/recipes/${encodeURIComponent(recipe.id)}`)
}

function handleKeydown(event) {
  if (event.key === 'Escape') modalOpen.value = false
}

async function refreshInventory() {
  await loadInventory()

  if (inventoryLoaded.value && activeTab.value === 'mine') {
    await loadRecipes()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

  await Promise.all([loadInventory(), loadUserRecipes()])

  if (activeTab.value === 'mine') {
    await loadRecipes()
  }
})

onUnmounted(() => {
  recipeController?.abort()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main class="freshness-page">

    <!-- =====================================
         COMPACT ANIMATED BANNER
    ====================================== -->

    <section class="fresh-hero">
      <div class="hero-pattern" aria-hidden="true"></div>

      <div class="floating-leaf leaf-a" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <path d="M14 78C8 42 36 13 87 9c2 43-20 74-73 69Z" />
          <path d="M15 78 77 20M42 52l-5-23M53 43l24 4" />
        </svg>
      </div>

      <div class="floating-leaf leaf-b" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <path d="M14 78C8 42 36 13 87 9c2 43-20 74-73 69Z" />
          <path d="M15 78 77 20M42 52l-5-23M53 43l24 4" />
        </svg>
      </div>

      <div class="floating-leaf leaf-c" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <path d="M14 78C8 42 36 13 87 9c2 43-20 74-73 69Z" />
          <path d="M15 78 77 20M42 52l-5-23M53 43l24 4" />
        </svg>
      </div>

      <div class="hero-copy">
        <div class="hero-eyebrow">
          <span class="eyebrow-dot"></span>
          YOUR LITTLE CORNER OF THE KITCHEN
        </div>

        <h1>
          Good food deserves
          <span>another chance.</span>
        </h1>

        <p>
          Discover delicious recipes using what's already in your kitchen.
        </p>
      </div>

      <div class="hero-actions">
        <button class="primary-action" @click="goToRecipes">
          Find my recipes <span>↗</span>
        </button>

        <button class="secondary-action" @click="checkIngredients">
          Check my ingredients
        </button>
      </div>
    </section>

    <!-- =====================================
         KITCHEN SUMMARY
    ====================================== -->

    <section class="kitchen-summary">
      <div class="summary-heading summary-heading-row">
        <div>
          <span class="small-eyebrow">AT A GLANCE</span>
          <h2>Your kitchen today</h2>
        </div>

        <button
          class="refresh-inventory-button"
          :disabled="inventoryLoading"
          @click="refreshInventory"
        >
          {{ inventoryLoading ? 'Refreshing...' : '↻ Refresh inventory' }}
        </button>
      </div>

      <p v-if="inventoryError" class="inventory-error" role="alert">
        {{ inventoryError }}
      </p>

      <p v-else-if="inventoryLoading" class="inventory-status">
        Loading your kitchen from MongoDB...
      </p>

      <p
        v-else-if="inventoryLoaded && inventory.length === 0"
        class="inventory-status"
      >
        Your kitchen is empty! Scan a receipt and confirm
        your items to start discovering recipes.
      </p>

      
<div class="summary-grid">
  <div class="summary-card total">
    <div class="summary-card-top">
      <span>In your kitchen</span>
      <span class="summary-card-icon" aria-hidden="true">▤</span>
    </div>
    <strong>{{ stats.total }}</strong>
    <small>Ingredients available</small>
    <button class="summary-card-link" type="button"
      @click="goToInventory">
      View inventory <span aria-hidden="true">→</span>
    </button>
  </div>

  <div class="summary-card fresh">
    <div class="summary-card-top">
      <span>Looking fresh</span>
      <span class="summary-card-icon" aria-hidden="true">✿</span>
    </div>
    <strong>{{ stats.fresh }}</strong>
    <small>No immediate expiry concern</small>
    <button class="summary-card-link" type="button"
      @click="goToInventory">
      View ingredients <span aria-hidden="true">→</span>
    </button>
  </div>

  <div class="summary-card soon">
    <div class="summary-card-top">
      <span>Use soon</span>
      <span class="summary-card-icon" aria-hidden="true">◷</span>
    </div>
    <strong>{{ stats.soon }}</strong>
    <small>Estimated within 3 days</small>
    <button class="summary-card-link" type="button"
      @click="goToRecipes">
      Find recipes <span aria-hidden="true">→</span>
    </button>
  </div>

  <div class="summary-card expired">
    <div class="summary-card-top">
      <span>Past estimated date</span>
      <span class="summary-card-icon" aria-hidden="true">!</span>
    </div>
    <strong>{{ stats.expired }}</strong>
    <small>Check before using</small>
    <button class="summary-card-link" type="button"
      @click="goToUrgentItems">
      Review items <span aria-hidden="true">→</span>
    </button>
  </div>
</div>


    </section>

    <!-- =====================================
         RECIPE DISCOVERY
    ====================================== -->

    <section id="recipe-discovery" class="recipe-section">
      <div class="section-heading">
        <div>
          <span class="small-eyebrow">THE FUN PART</span>
          <h2>What should we cook?</h2>
          <p>
            Your ingredients, a little inspiration,
            and a whole lot of possibilities.
          </p>
        </div>

        <div class="section-stamp">LET'S COOK!</div>
      </div>

      <!-- EXPANDABLE EAT SOON -->

      <div class="freshness-drawer">
        <button
          class="drawer-trigger"
          :aria-expanded="eatSoonOpen"
          @click="eatSoonOpen = !eatSoonOpen"
        >
          <div class="drawer-trigger-left">
            <span class="drawer-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12" cy="12" r="9"
                  stroke="currentColor" stroke-width="2"
                />
                <path
                  d="M12 7v5l3 2"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </span>

            <div>
              <strong>Use these ingredients first</strong>
              <small>
                {{ urgentItems.length }} ingredients need attention
              </small>
            </div>
          </div>

          <div class="drawer-preview">
            <span
              v-for="item in urgentItems.slice(0, 2)"
              :key="item.localId"
              class="mini-chip"
            >
              {{ item.name }}
            </span>
          </div>

          <span
            class="drawer-chevron"
            :class="{ rotated: eatSoonOpen }"
          >⌄</span>
        </button>

        <div
          class="drawer-content"
          :class="{ expanded: eatSoonOpen }"
        >
          <div class="drawer-inner">
            <div class="drawer-toolbar">
              <input
                v-model="eatSoonSearch"
                placeholder="Search ingredients..."
                aria-label="Search expiring ingredients"
              />

              <select
                v-model="eatSoonSort"
                aria-label="Sort expiring ingredients"
              >
                <option value="expiry">Expiring first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>

            <div
              v-if="visibleUrgentItems.length"
              class="urgent-grid"
            >
              <div
                v-for="item in visibleUrgentItems"
                :key="item.localId"
                class="urgent-item"
              >
                <button
                  class="urgent-item-main"
                  @click="
                    expandedItem =
                      expandedItem === item.localId
                        ? null
                        : item.localId
                  "
                >
                  <div>
                    <strong>{{ item.name }}</strong>
                    <small>
                      {{ displayQuantity(item) }}
                      · {{ item.storageLabel }}
                    </small>
                  </div>

                  <span
                    class="urgent-pill"
                    :class="item.status"
                  >
                    {{ item.expiryText }}
                  </span>
                </button>

                <div
                  v-if="expandedItem === item.localId"
                  class="urgent-details"
                >
                  <p><strong>Estimated expiry:</strong> {{ formatDate(item.expiresAt) }}</p>
                  <p><strong>Purchased:</strong> {{ formatDate(item.purchasedAt) }}</p>
                  <p><strong>Storage:</strong> {{ item.storageLabel }}</p>
                  <p v-if="item.weightKg !== null">
                    <strong>Weight:</strong> {{ item.weightKg }} kg
                  </p>
                  <p v-if="item.category">
                    <strong>Category:</strong> {{ formatLocation(item.category) }}
                  </p>
                  <p v-if="item.dietType && item.dietType !== 'unknown'">
                    <strong>Diet:</strong> {{ formatLocation(item.dietType) }}
                  </p>
                </div>
              </div>
            </div>

            <p v-else class="empty-note">
              No matching ingredients need attention right now.
            </p>

            <p class="drawer-disclaimer">
              Expiry dates may be AI estimates. Check food labels
              and storage conditions before use.
            </p>
          </div>
        </div>
      </div>

      <!-- RECIPE TABS -->

      <div class="recipe-controls">
        <div class="tabs" role="tablist">
          <button
            role="tab"
            :aria-selected="activeTab === 'mine'"
            :class="{ active: activeTab === 'mine' }"
            @click="activeTab = 'mine'"
          >
            For You
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
            :aria-selected="activeTab === 'ai'"
            :class="{ active: activeTab === 'ai' }"
            @click="activeTab = 'ai'"
          >
            ✨ AI Picks
          </button>

          <button
            role="tab"
            :aria-selected="activeTab === 'cooked'"
            :class="{ active: activeTab === 'cooked' }"
            @click="activeTab = 'cooked'"
          >
            Cooked Before ({{ cookedRecipes.length }})
          </button>

          <button
            role="tab"
            :aria-selected="activeTab === 'saved'"
            :class="{ active: activeTab === 'saved' }"
            @click="activeTab = 'saved'"
          >
            Saved ({{ savedIds.length }})
          </button>
        </div>

        <button
          v-if="activeTab === 'mine'"
          class="ingredient-button"
          :disabled="inventoryLoading || !usableItems.length"
          @click="openModal"
        >
          Choose ingredients <span>+</span>
        </button>
      </div>

      <div class="tab-intro">
        <template v-if="activeTab === 'mine'">
          <strong>Made for your kitchen.</strong>
          Recipes ranked using your MongoDB inventory
          and ingredient freshness.
        </template>

        <template v-else-if="activeTab === 'explore'">
          <strong>Feeling inspired?</strong>
          Discover something new from TheMealDB.
        </template>

        <template v-else-if="activeTab === 'ai'">
          <strong>Picked for you.</strong>
          Recommendations based on your inventory and cooking history.
          {{ aiUsed ? 'AI-powered.' : 'Using smart recipe ranking.' }}
        </template>

        <template v-else-if="activeTab === 'cooked'">
          <strong>Cooked before.</strong>
          Recipes you've made and might want to cook again.
        </template>

        <template v-else>
          <strong>Your favourites.</strong>
          All the recipes you've bookmarked.
        </template>
      </div>

      <!-- SELECTED INGREDIENTS -->

      <div
        v-if="activeTab === 'mine' && selectionApplied"
        class="selection-strip"
      >
        <div class="selection-chips">
          <span
            v-for="item in selectedItems"
            :key="item.localId"
          >
            {{ item.name }}
          </span>

          <span v-if="!selectedItems.length">
            No ingredients selected
          </span>
        </div>

        <button @click="resetSelection">Reset</button>
      </div>

      <p v-if="historyError" class="inventory-error" role="alert">{{ historyError }}</p>

      <!-- FILTERS -->

      <div class="filter-bar">
        <input
          v-model="search"
          type="search"
          placeholder="Search for a recipe..."
          aria-label="Search recipes"
        />

        <select v-model="cookingTime" aria-label="Filter estimated cooking time">
          <option value="">Any cooking time</option>
          <option value="30">Under 30 min</option>
          <option value="45">Under 45 min</option>
          <option value="60">Under 60 min</option>
          <option value="60plus">60 min or longer</option>
        </select>

        <select v-model="sort" aria-label="Sort recipes">
          <option value="rescue">Best rescue score</option>
          <option value="match">Best match</option>
          <option value="time">Quickest to cook</option>
          <option value="name">Name A–Z</option>
        </select>

        <button
          @click="
            search = '';
            cookingTime = '';
            sort = 'rescue'
          "
        >
          Clear
        </button>
      </div>

      <div class="results-line">
        <span>
          {{
            recipesLoading
              ? 'Searching recipes...'
              : `${filteredRecipes.length} recipes found`
          }}
        </span>

        <span v-if="!recipesLoading">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
      </div>

      <!-- LOADING -->

      <div v-if="recipesLoading" class="recipe-grid">
        <div
          v-for="n in 6"
          :key="n"
          class="skeleton-card"
        >
          <div class="skeleton-image shimmer"></div>
          <div class="skeleton-line shimmer"></div>
          <div class="skeleton-line short shimmer"></div>
          <div class="skeleton-line shimmer"></div>
        </div>
      </div>

      <!-- ERROR -->

      <div v-else-if="recipesError" class="recipe-message">
        <h3>Our recipe book isn't loading.</h3>
        <p>{{ recipesError }}</p>
        <button @click="loadRecipes">Try again</button>
      </div>

      <!-- RECIPE CARDS -->

      <template v-else>
        <Transition name="recipe-fade" mode="out-in">
          <div
            v-if="visibleRecipes.length"
            :key="`${activeTab}-${currentPage}-${search}-${cookingTime}-${sort}`"
            class="recipe-grid"
          >
            <article
              v-for="(recipe, index) in visibleRecipes"
              :key="recipe.id"
              class="recipe-card"
              :style="{ '--index': index }"
            >
              <div class="recipe-photo">
                <img
                  v-if="recipe.image"
                  :src="recipe.image"
                  :alt="recipe.name"
                  loading="lazy"
                />

                <div v-else class="no-photo">
                  FRESH IDEAS
                </div>

                <span class="recipe-match">
                  {{ recipe.percentage }}% match
                </span>

                <button
                  class="save-button"
                  :class="{ saved: isSaved(recipe.id) }"
                  :aria-label="
                    isSaved(recipe.id)
                      ? 'Unsave recipe'
                      : 'Save recipe'
                  "
                  @click="toggleSave(recipe)"
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 3h12v18l-6-4-6 4V3Z"
                      :fill="
                        isSaved(recipe.id)
                          ? 'currentColor'
                          : 'none'
                      "
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div class="recipe-body">
                <h3>{{ recipe.name }}</h3>

                <div class="recipe-tags">
                  <span
                    v-for="tag in recipe.dietaryTags.slice(0, 2)"
                    :key="tag"
                  >
                    {{ tag }}
                  </span>

                  <span v-if="estimatedMinutes(recipe)">
                    ⏱ Estimated time: {{ estimatedMinutes(recipe) }} min
                  </span>
                  <span v-else-if="estimatingTimes">
                    ⏱ Estimating...
                  </span>
                </div>

                <div class="match-label">
                  <span>Ingredients you have</span>
                  <strong>{{ recipe.percentage }}%</strong>
                </div>

                <div class="match-track">
                  <div
                    :style="{ width: `${recipe.percentage}%` }"
                  ></div>
                </div>

                <div class="recipe-ingredients">
                  <p>
                    <strong>Have:</strong>
                    {{
                      recipe.matched.slice(0, 3).join(', ')
                      || 'None'
                    }}
                  </p>

                  <p>
                    <strong>Need:</strong>
                    {{
                      recipe.missing.slice(0, 3).join(', ')
                      || 'Nothing else'
                    }}
                  </p>
                </div>

                <p v-if="recipe.aiReason" class="recipe-ai-reason">✨ {{ recipe.aiReason }}</p>
                <div class="recipe-footer">
                  <span>
                    Rescue score: {{ recipe.rescueScore }}
                  </span>

                  <button @click="openRecipe(recipe)">
                    View recipe ↗
                  </button>
                </div>
                <div class="recipe-cooked-action">
                  <span v-if="cookCount(recipe.id)">Cooked {{ cookCount(recipe.id) }} {{ cookCount(recipe.id) === 1 ? 'time' : 'times' }}</span>
                  <button :disabled="recipeActionId === recipe.id" @click="markCooked(recipe)">
                    {{ cookCount(recipe.id) ? '🍳 Cook Again' : '✓ Mark as Cooked' }}
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="recipe-message">
            <h3>
              {{
                activeTab === 'mine' && !inventory.length
                  ? 'Your kitchen is waiting!'
                  : 'No recipes found yet.'
              }}
            </h3>

            <p>
              {{
                activeTab === 'saved'
                  ? 'Bookmark a recipe to see it here.'
                  : activeTab === 'mine' && !inventory.length
                    ? 'Scan a receipt and save ingredients to your inventory first.'
                    : 'Try a different ingredient selection or clear your filters.'
              }}
            </p>

            <button
              v-if="activeTab !== 'saved'"
              @click="
                search = '';
                cookingTime = '';
                resetSelection()
              "
            >
              Reset filters
            </button>
          </div>
        </Transition>

        <!-- PAGINATION -->

        <div v-if="totalPages > 1" class="pagination">
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
        </div>
      </template>
    </section>

    <!-- =====================================
         INGREDIENT MODAL
    ====================================== -->

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="modalOpen"
          class="ingredient-backdrop"
          @click.self="modalOpen = false"
        >
          <div
            class="ingredient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ingredient-title"
          >
            <div class="modal-heading">
              <div>
                <span class="small-eyebrow">YOUR KITCHEN</span>
                <h2 id="ingredient-title">
                  Choose your ingredients
                </h2>
                <p>
                  Tell us what you'd like to cook with.
                </p>
              </div>

              <button
                class="modal-close"
                aria-label="Close"
                @click="modalOpen = false"
              >
                ×
              </button>
            </div>

            <input
              v-model="modalSearch"
              class="modal-search"
              placeholder="Search ingredients..."
              aria-label="Search ingredients"
            />

            <div class="modal-toolbar">
              <strong>{{ draftIds.length }} selected</strong>

              <div>
                <button
                  @click="
                    draftIds = usableItems.map(x => x.localId)
                  "
                >
                  Select all
                </button>

                <button @click="draftIds = []">
                  Clear
                </button>
              </div>
            </div>

            <div class="modal-grid">
              <button
                v-for="item in modalItems"
                :key="item.localId"
                class="modal-choice"
                :class="{
                  selected: draftIds.includes(item.localId)
                }"
                :aria-pressed="draftIds.includes(item.localId)"
                @click="toggleDraft(item.localId)"
              >
                <span class="choice-box">
                  {{ draftIds.includes(item.localId) ? '✓' : '' }}
                </span>

                <span>
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.expiryText }}</small>
                </span>
              </button>
            </div>

            <div class="modal-actions">
              <button
                class="modal-cancel"
                @click="modalOpen = false"
              >
                Cancel
              </button>

              <button
                class="modal-apply"
                @click="applySelection"
              >
                Find recipes →
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.freshness-page {
  --ink: #123f3b;
  --aqua: #0fa89c;
  --paper: #fdfaf3;
  --mint: #d9f4ef;
  --lime: #dff09c;
  --yellow: #ffdd69;
  --muted: #527b75;

  max-width: 1360px;
  margin: 0 auto;
  padding: 32px 28px 90px;

  color: var(--ink);
  font-family: 'Patrick Hand', cursive;
  font-size: 18px;
}

.freshness-page * {
  box-sizing: border-box;
}

.freshness-page button,
.freshness-page input,
.freshness-page select {
  font: inherit;
}

.freshness-page button {
  cursor: pointer;
}

.freshness-page h1,
.freshness-page h2,
.freshness-page h3 {
  font-family: 'Kalam', cursive;
  margin: 0;
}

.freshness-page button:focus-visible,
.freshness-page input:focus-visible,
.freshness-page select:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 3px;
}

/* =====================================
   COMPACT HERO
===================================== */

.fresh-hero {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 32px;

  min-height: 230px;
  padding: 35px 48px;
  margin-bottom: 40px;

  overflow: hidden;
  isolation: isolate;

  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 25px;
  box-shadow: 8px 9px 0 var(--ink);
}

.hero-pattern {
  position: absolute;
  inset: 0;
  z-index: -1;

  background:
    radial-gradient(
      circle at 95% 10%,
      rgba(223, 240, 156, .65),
      transparent 27%
    ),
    radial-gradient(
      circle at 8% 95%,
      rgba(217, 244, 239, .8),
      transparent 38%
    );
}

.hero-copy {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  animation: hero-reveal .8s ease both;
}

.hero-eyebrow,
.small-eyebrow {
  color: #0b948a;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1.8px;
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.eyebrow-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  background: var(--aqua);
  border: 2px solid var(--ink);
  border-radius: 50%;
}

.hero-copy h1 {
  max-width: 650px;
  margin: 0;
  font-size: clamp(2.1rem, 3.2vw, 3.2rem);
  line-height: 1.13;
  color: #232a28;
}

.hero-copy h1 span {
  display: block;
  color: #0b948a;
}

.hero-copy > p {
  max-width: 540px;
  margin: 13px 0 0;
  color: #526d67;
  font-size: 19px;
  line-height: 1.4;
}

.hero-actions {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 13px;
  flex-shrink: 0;
  width: 225px;
  animation: hero-buttons-enter .8s .15s both;
}

.primary-action,
.secondary-action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 50px;
  padding: 11px 16px;
  border: 2px solid var(--ink);
  border-radius: 11px;
  font-size: 19px;
  font-weight: bold;
  transition: transform .22s, box-shadow .22s;
}

.primary-action {
  background: var(--aqua);
  color: white;
  box-shadow: 4px 5px 0 var(--ink);
}

.secondary-action {
  background: white;
  color: var(--ink);
  box-shadow: 3px 4px 0 var(--ink);
}

.primary-action:hover,
.secondary-action:hover {
  transform: translateY(-4px);
  box-shadow: 4px 9px 0 var(--ink);
}

.primary-action:active,
.secondary-action:active {
  transform: translateY(2px);
  box-shadow: 1px 2px 0 var(--ink);
}

/* FLOATING LEAVES */

.floating-leaf {
  position: absolute;
  z-index: 1;
  width: 75px;
  pointer-events: none;
  opacity: .8;
  animation: leaf-float 7s ease-in-out infinite;
}

.floating-leaf svg {
  display: block;
  width: 100%;
  fill: #a9d887;
  stroke: #276e55;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.floating-leaf svg path + path {
  fill: none;
}

.leaf-a {
  top: -15px;
  left: 46%;
  width: 65px;
}

.leaf-b {
  bottom: -35px;
  left: 30%;
  width: 105px;
  animation-delay: -2s;
}

.leaf-c {
  right: -18px;
  top: 12px;
  width: 90px;
  animation-delay: -4s;
}

/* =====================================
   SUMMARY
===================================== */

.kitchen-summary {
  margin-bottom: 46px;
}

.summary-heading {
  margin-bottom: 18px;
}

.summary-heading h2 {
  font-size: 30px;
}

.summary-heading-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.refresh-inventory-button {
  padding: 10px 16px;
  border: 2px solid var(--ink);
  border-radius: 10px;
  background: var(--mint);
  color: var(--ink);
  font-weight: bold;
  box-shadow: 3px 4px 0 var(--ink);
  transition: transform .2s, box-shadow .2s;
}

.refresh-inventory-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 3px 7px 0 var(--ink);
}

.refresh-inventory-button:disabled {
  opacity: .6;
  cursor: wait;
}

.inventory-error {
  padding: 14px 18px;
  margin-bottom: 20px;
  background: #ffe3dd;
  border: 2px solid var(--ink);
  border-radius: 10px;
}

.inventory-status {
  padding: 14px 18px;
  margin-bottom: 20px;
  background: var(--mint);
  border-radius: 10px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  min-height: 145px;
  padding: 21px;
  border: 2px solid var(--ink);
  border-radius: 16px;
  box-shadow: 5px 6px 0 var(--ink);
  animation: card-enter .6s both;
  transition: transform .25s, box-shadow .25s;
}

.summary-card:nth-child(2) { animation-delay: .1s; }
.summary-card:nth-child(3) { animation-delay: .2s; }
.summary-card:nth-child(4) { animation-delay: .3s; }

.summary-card:hover {
  transform: translateY(-5px);
  box-shadow: 5px 11px 0 var(--ink);
}

.summary-card.total { background: var(--mint); }
.summary-card.fresh { background: var(--lime); }
.summary-card.soon { background: #fff3c8; }
.summary-card.expired { background: #ffe3dd; }

.summary-card > span {
  font-size: 17px;
  font-weight: bold;
}

.summary-card strong {
  margin: 9px 0;
  font-family: 'Kalam', cursive;
  font-size: 43px;
  line-height: 1;
}

.summary-card small {
  color: var(--muted);
}

/* =====================================
   RECIPE DISCOVERY
===================================== */

.recipe-section {
  padding: 36px;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 24px;
  box-shadow: 7px 9px 0 var(--ink);
  scroll-margin-top: 90px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}

.section-heading h2 {
  font-size: clamp(2rem, 3.3vw, 3rem);
  margin: 5px 0;
}

.section-heading p {
  color: var(--muted);
  margin: 0;
}

.section-stamp {
  padding: 12px 16px;
  background: var(--lime);
  border: 2px solid var(--ink);
  border-radius: 9px;
  font-weight: bold;
  white-space: nowrap;
  transform: rotate(5deg);
}

/* =====================================
   EXPANDABLE EAT SOON
===================================== */

.freshness-drawer {
  margin-bottom: 29px;
  border: 2px solid var(--ink);
  border-radius: 15px;
  background: #fff8dd;
  overflow: hidden;
}

.drawer-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 18px;
  padding: 19px 22px;
  border: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.drawer-trigger-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.drawer-trigger-left strong,
.drawer-trigger-left small {
  display: block;
}

.drawer-trigger-left strong { font-size: 22px; }
.drawer-trigger-left small { color: var(--muted); }

.drawer-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background: white;
  border: 2px solid var(--ink);
  border-radius: 11px;
}

.drawer-icon svg { width: 24px; }

.drawer-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-left: auto;
}

.mini-chip {
  padding: 5px 10px;
  background: white;
  border: 1px solid var(--ink);
  border-radius: 20px;
  font-size: 15px;
}

.drawer-chevron {
  font-size: 28px;
  transition: transform .3s;
}

.drawer-chevron.rotated {
  transform: rotate(180deg);
}

.drawer-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .35s ease;
}

.drawer-content.expanded {
  grid-template-rows: 1fr;
}

.drawer-inner {
  min-height: 0;
  overflow: hidden;
}

.drawer-content.expanded .drawer-inner {
  padding: 20px;
  border-top: 1px dashed #9bcac5;
}

.drawer-toolbar {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.drawer-toolbar input,
.drawer-toolbar select,
.filter-bar input,
.filter-bar select {
  min-width: 0;
  height: 49px;
  padding: 0 13px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  background: white;
  color: var(--ink);
}

.urgent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.urgent-item {
  border: 1.5px solid #9bcac5;
  border-radius: 10px;
  background: white;
}

.urgent-item-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--ink);
}

.urgent-item-main strong,
.urgent-item-main small {
  display: block;
}

.urgent-item-main small {
  color: var(--muted);
}

.urgent-pill {
  padding: 5px 9px;
  border: 1px solid var(--ink);
  border-radius: 7px;
  background: var(--yellow);
  white-space: nowrap;
  font-size: 14px;
}

.urgent-pill.expired {
  background: #ffb6aa;
}

.urgent-details {
  padding: 10px 13px;
  border-top: 1px dashed #9bcac5;
  font-size: 15px;
}

.urgent-details p {
  margin: 5px 0;
}

.drawer-disclaimer,
.empty-note {
  color: var(--muted);
  font-size: 14px;
}

/* =====================================
   TABS AND FILTERS
===================================== */

.recipe-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tabs button,
.ingredient-button {
  padding: 10px 18px;
  border: 2px solid var(--ink);
  border-radius: 10px;
  background: white;
  color: var(--ink);
  transition: transform .2s, box-shadow .2s;
}

.tabs button:hover,
.ingredient-button:hover {
  transform: translateY(-3px);
}

.tabs button.active {
  background: var(--yellow);
  box-shadow: 3px 4px 0 var(--ink);
  font-weight: bold;
}

.ingredient-button {
  display: flex;
  align-items: center;
  gap: 15px;
  background: var(--mint);
  font-weight: bold;
}

.ingredient-button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.ingredient-button span {
  font-size: 25px;
  line-height: .7;
}

.tab-intro {
  margin: 19px 0;
  color: var(--muted);
}

.tab-intro strong {
  color: var(--ink);
}

.selection-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 13px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: var(--mint);
}

.selection-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.selection-chips span {
  padding: 4px 10px;
  border-radius: 20px;
  background: white;
  font-size: 15px;
}

.selection-strip button {
  border: 0;
  background: transparent;
  text-decoration: underline;
  color: var(--ink);
}

.filter-bar {
  display: grid;
  grid-template-columns: 2fr 1fr 1.2fr auto;
  gap: 10px;
  margin-bottom: 20px;
}

.filter-bar button {
  padding: 0 18px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  background: var(--mint);
  color: var(--ink);
}

.results-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  color: var(--muted);
  font-size: 16px;
}

/* =====================================
   RECIPE CARDS
===================================== */

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 23px;
}

.recipe-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid var(--ink);
  border-radius: 15px;
  background: white;
  box-shadow: 4px 5px 0 var(--ink);
  animation: card-enter .45s both;
  animation-delay: calc(var(--index) * 65ms);
  transition: transform .25s, box-shadow .25s;
}

.recipe-card:hover {
  transform: translateY(-7px);
  box-shadow: 4px 12px 0 var(--ink);
}

.recipe-photo {
  position: relative;
  height: 190px;
  overflow: hidden;
  background: var(--mint);
  border-bottom: 2px solid var(--ink);
}

.recipe-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .5s;
}

.recipe-card:hover .recipe-photo img {
  transform: scale(1.07);
}

.no-photo {
  display: grid;
  place-items: center;
  height: 100%;
  font-family: 'Kalam', cursive;
  color: var(--muted);
}

.recipe-match {
  position: absolute;
  bottom: 12px;
  left: 12px;
  padding: 5px 10px;
  border: 1.5px solid var(--ink);
  border-radius: 7px;
  background: var(--lime);
  font-size: 15px;
}

.save-button {
  position: absolute;
  top: 11px;
  right: 11px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1.5px solid var(--ink);
  border-radius: 9px;
  background: white;
  color: var(--ink);
  transition: transform .2s;
}

.save-button:hover { transform: scale(1.12); }
.save-button.saved { background: var(--yellow); }
.save-button svg { width: 22px; height: 22px; }

.recipe-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 18px;
}

.recipe-body h3 {
  font-size: 24px;
  line-height: 1.25;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 30px;
  margin: 10px 0 15px;
}

.recipe-tags span {
  padding: 4px 9px;
  border-radius: 7px;
  background: var(--mint);
  font-size: 14px;
}

.match-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  font-size: 15px;
}

.match-track {
  height: 10px;
  overflow: hidden;
  border: 1px solid var(--ink);
  border-radius: 20px;
  background: #e6f0ec;
}

.match-track > div {
  height: 100%;
  border-radius: 20px;
  background: var(--aqua);
  transition: width .8s ease;
}

.recipe-ingredients {
  margin: 16px 0;
  padding: 11px;
  background: #f1f8f4;
  border-radius: 9px;
  font-size: 15px;
}

.recipe-ingredients p {
  margin: 4px 0;
  overflow-wrap: anywhere;
}

.recipe-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
}

.recipe-footer > span {
  color: var(--muted);
  font-size: 14px;
}

.recipe-footer button,
.recipe-message button {
  padding: 9px 12px;
  border: 2px solid var(--ink);
  border-radius: 8px;
  background: var(--yellow);
  color: var(--ink);
  font-weight: bold;
  white-space: nowrap;
  transition: transform .2s;
}

.recipe-footer button:hover {
  transform: translateX(3px);
}

.recipe-message {
  padding: 65px 20px;
  text-align: center;
}

.recipe-message h3 { font-size: 28px; }
.recipe-message p { color: var(--muted); }
.recipe-message button { margin-top: 10px; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 17px;
  margin-top: 30px;
}

.pagination button {
  padding: 9px 15px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  background: white;
  color: var(--ink);
}

.pagination button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

/* =====================================
   LOADING
===================================== */

.skeleton-card {
  overflow: hidden;
  padding-bottom: 20px;
  border: 2px solid var(--ink);
  border-radius: 15px;
  background: white;
}

.skeleton-image {
  height: 190px;
  margin-bottom: 22px;
}

.skeleton-line {
  height: 17px;
  margin: 12px 18px;
  border-radius: 5px;
}

.skeleton-line.short { width: 55%; }

.shimmer {
  background: linear-gradient(
    100deg,
    #e7f0eb 20%,
    #f8fcfa 40%,
    #e7f0eb 60%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* =====================================
   ANIMATIONS
===================================== */

@keyframes hero-reveal {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes hero-buttons-enter {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes leaf-float {
  0%, 100% { translate: 0 0; rotate: -8deg; }
  50% { translate: 12px -17px; rotate: 12deg; }
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  to { background-position-x: -200%; }
}

.recipe-fade-enter-active,
.recipe-fade-leave-active {
  transition: opacity .2s, transform .2s;
}

.recipe-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.recipe-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* =====================================
   RESPONSIVE
===================================== */

@media (max-width: 1100px) {
  .fresh-hero {
    gap: 25px;
    padding: 35px 32px;
  }

  .recipe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 800px) {
  .fresh-hero {
    flex-direction: column;
    align-items: flex-start;
    min-height: auto;
    padding: 30px 25px;
    gap: 23px;
  }

  .hero-actions {
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
  }

  .hero-actions button {
    flex: 1;
    min-width: 170px;
  }

  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .urgent-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 550px) {
  .freshness-page {
    padding: 18px 13px 65px;
  }

  .fresh-hero {
    padding: 27px 20px;
  }

  .hero-copy h1 {
    font-size: 2.1rem;
  }

  .hero-copy > p {
    font-size: 17px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-actions button {
    width: 100%;
    min-width: 0;
  }

  .summary-heading-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-grid { gap: 11px; }

  .summary-card {
    padding: 14px;
    min-height: 130px;
  }

  .recipe-section { padding: 19px; }
  .recipe-grid { grid-template-columns: 1fr; }
  .filter-bar { grid-template-columns: 1fr; }
  .filter-bar button { min-height: 45px; }
  .drawer-toolbar { grid-template-columns: 1fr; }

  .drawer-preview,
  .section-stamp { display: none; }

  .drawer-trigger { padding: 14px; }
  .recipe-footer { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .freshness-page *,
  .freshness-page *::before,
  .freshness-page *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
/* Additions only: original page styling above is unchanged */
.recipe-ai-reason { margin: 12px 0; padding: 10px 12px; background: #e8f7f1; border-radius: 9px; font-size: 15px; }
.recipe-cooked-action { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 14px; }
.recipe-cooked-action button { border: 1px solid var(--ink); border-radius: 8px; padding: 6px 10px; background: var(--mint); color: var(--ink); font-weight: bold; }
.recipe-cooked-action button:disabled { opacity: .5; }
</style>

<style>
/* =====================================
   TELEPORTED INGREDIENT MODAL
===================================== */

.ingredient-backdrop {
  --ink: #123f3b;
  --aqua: #0fa89c;
  --mint: #d9f4ef;
  --yellow: #ffdd69;
  --muted: #527b75;

  position: fixed;
  inset: 0;
  z-index: 99999;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;
  background: rgba(255, 255, 255, .78);

  backdrop-filter: blur(9px);
  -webkit-backdrop-filter: blur(9px);
}

.ingredient-modal {
  display: flex;
  flex-direction: column;
  width: min(670px, 100%);
  max-height: 85vh;
  padding: 27px;

  background: #fdfaf3;
  border: 3px solid var(--ink);
  border-radius: 20px;
  box-shadow: 8px 10px 0 var(--ink);

  color: var(--ink);
  font-family: 'Patrick Hand', cursive;
  font-size: 18px;
}

.ingredient-modal * { box-sizing: border-box; }

.ingredient-modal button,
.ingredient-modal input { font: inherit; }

.ingredient-modal button { cursor: pointer; }

.modal-heading {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 20px;
}

.modal-heading h2 {
  margin: 4px 0;
  font-family: 'Kalam', cursive;
  font-size: 30px;
}

.modal-heading p {
  margin: 0;
  color: var(--muted);
}

.modal-close {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  background: white;
  border: 2px solid var(--ink);
  border-radius: 9px;
  font-size: 26px !important;
}

.modal-search {
  height: 48px;
  padding: 0 14px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  background: white;
}

.modal-toolbar {
  display: flex;
  justify-content: space-between;
  margin: 17px 0 13px;
}

.modal-toolbar div {
  display: flex;
  gap: 12px;
}

.modal-toolbar button {
  border: 0;
  background: transparent;
  text-decoration: underline;
  color: var(--ink);
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding: 3px;
}

.modal-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;

  border: 2px solid #a5cac4;
  border-radius: 10px;
  background: white;
  color: var(--ink);
  text-align: left;

  transition: transform .2s, background .2s;
}

.modal-choice:hover {
  transform: translateY(-2px);
}

.modal-choice.selected {
  border-color: var(--aqua);
  background: var(--mint);
}

.choice-box {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 2px solid var(--ink);
  border-radius: 5px;
  background: white;
}

.modal-choice.selected .choice-box {
  background: var(--aqua);
  color: white;
}

.modal-choice strong,
.modal-choice small { display: block; }

.modal-choice small {
  color: var(--muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 19px;
  padding-top: 18px;
  border-top: 1px solid #a5cac4;
}

.modal-actions button {
  padding: 10px 18px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  color: var(--ink);
}

.modal-cancel { background: white; }
.modal-apply { background: var(--yellow); }

.modal-enter-active,
.modal-leave-active {
  transition: opacity .25s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .ingredient-modal,
.modal-leave-active .ingredient-modal {
  transition: transform .3s, opacity .3s;
}

.modal-enter-from .ingredient-modal,
.modal-leave-to .ingredient-modal {
  transform: translateY(20px) scale(.96);
  opacity: 0;
}

@media (max-width: 550px) {
  .ingredient-modal { padding: 17px; }
  .modal-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .ingredient-backdrop *,
  .ingredient-backdrop *::before,
  .ingredient-backdrop *::after {
    animation: none !important;
    transition: none !important;
  }
}

/* Kitchen summary card improvements */

.summary-card {
  display: flex;
  flex-direction: column;
}

.summary-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.summary-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 2px solid currentColor;
  border-radius: 12px;
  font-size: 22px;
  flex-shrink: 0;
}

.summary-card-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  margin-top: auto;
  padding: 12px 0 0;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: gap 0.2s ease;
}

.summary-card-link:hover {
  gap: 14px;
}

.summary-card-link:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
  border-radius: 4px;
}

@media (max-width: 480px) {
  .summary-card-icon {
    width: 30px;
    height: 30px;
    font-size: 18px;
  }

  .summary-card-link {
    font-size: 0.8rem;
  }
}




</style>
