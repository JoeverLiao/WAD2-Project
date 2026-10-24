
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { sampleInventory } from '../../data/freshnessDemo.js'
import {
  getDaysRemaining,
  getExpiryStatus,
  getExpiryLabel,
} from '../../utils/expiryUtils.js'

const router = useRouter()

// Temporary demo inventory until MongoDB API is ready.
const inventory = ref(sampleInventory)

const recipes = ref([])
const recipesLoading = ref(false)
const recipesError = ref('')
const ingredientSearch = ref('')

const inventoryWithExpiry = computed(() =>
  inventory.value.map(item => {
    const daysRemaining = getDaysRemaining(item.expiresAt)

    return {
      ...item,
      daysRemaining,
      status: getExpiryStatus(daysRemaining),
      expiryLabel: getExpiryLabel(daysRemaining),
    }
  })
)

const eatSoonItems = computed(() =>
  inventoryWithExpiry.value
    .filter(item =>
      item.daysRemaining !== null &&
      item.daysRemaining >= 0 &&
      item.daysRemaining <= 3 &&
      Number(item.quantity) > 0
    )
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
)

const expiredItems = computed(() =>
  inventoryWithExpiry.value.filter(item =>
    item.daysRemaining !== null &&
    item.daysRemaining < 0 &&
    Number(item.quantity) > 0
  )
)

const availableIngredients = computed(() =>
  [
    ...new Set(
      inventoryWithExpiry.value
        .filter(item =>
          Number(item.quantity) > 0 &&
          (item.daysRemaining === null || item.daysRemaining >= 0)
        )
        .map(item => String(item.name || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
)

const recommendedRecipes = computed(() =>
  [...recipes.value].sort(
    (a, b) =>
      b.matchPercentage - a.matchPercentage ||
      a.missingIngredients.length - b.missingIngredients.length
  )
)

const displayedRecipes = computed(() => {
  const search = ingredientSearch.value.trim().toLowerCase()

  if (!search) return recommendedRecipes.value

  return recommendedRecipes.value.filter(recipe =>
    [
      recipe.title,
      ...recipe.matchedIngredients,
      ...recipe.missingIngredients,
    ].some(value => String(value).toLowerCase().includes(search))
  )
})

function expiryClass(days) {
  if (days === null) return 'expiry-neutral'
  if (days < 0) return 'expiry-expired'
  if (days <= 1) return 'expiry-urgent'
  if (days <= 3) return 'expiry-soon'
  return 'expiry-fresh'
}

function expiryHeading(days) {
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  return `IN ${days} DAYS`
}

async function loadRecipes() {
  recipesLoading.value = true
  recipesError.value = ''

  try {
    if (!availableIngredients.value.length) {
      recipes.value = []
      return
    }

    const params = new URLSearchParams({
      ingredients: availableIngredients.value.join(','),
    })

    const response = await fetch(
      `/api/freshness/recipes?${params.toString()}`,
      { credentials: 'include' }
    )

    if (!response.ok) {
      throw new Error(`Recipe request failed (${response.status})`)
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      throw new Error('Unexpected recipe response')
    }

    recipes.value = data.map(recipe => ({
      ...recipe,
      name: recipe.title,
      matchedIngredients: (recipe.usedIngredients || [])
        .map(item => item.name),
      missingIngredients: (recipe.missedIngredients || [])
        .map(item => item.name),
      matchPercentage: Number(recipe.matchPercentage) || 0,
    }))
  } catch (error) {
    console.error('Recipe loading error:', error)
    recipesError.value = error.message
    recipes.value = []
  } finally {
    recipesLoading.value = false
  }
}

function openRecipe(recipe) {
  router.push({
    name: 'recipe-detail',
    params: { id: recipe.id },
  })
}

function clearFilters() {
  ingredientSearch.value = ''
}

onMounted(loadRecipes)
</script>

<template>
  <main class="freshness-page">
    <div class="page-container">

      <!-- HERO -->
      <section class="hero-card paper-card">
        <div>
          <span class="eyebrow">✿ THE FULL CIRCLE FOOD JOURNAL</span>

          <h1>Fresh today,<br />delicious tomorrow!</h1>

          <p class="hero-description">
            Keep track of your groceries, use them before they expire,
            and turn what you have into something wonderful.
          </p>

          <a href="#recipes" class="action-button">
            Explore Recipes ↓
          </a>
        </div>

        <div class="hero-decoration" aria-hidden="true">
          <span>🥬</span>
          <span>🍅</span>
          <span>🥕</span>
          <span>🍋</span>
        </div>
      </section>

      <!-- SUMMARY -->
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-icon">🧺</span>
          <div>
            <strong>{{ inventoryWithExpiry.length }}</strong>
            <span>Inventory Items</span>
          </div>
        </div>

        <div class="summary-card">
          <span class="summary-icon">⏰</span>
          <div>
            <strong>{{ eatSoonItems.length }}</strong>
            <span>Eat Soon</span>
          </div>
        </div>

        <div class="summary-card">
          <span class="summary-icon">🍳</span>
          <div>
            <strong>{{ recipes.length }}</strong>
            <span>Recipe Ideas</span>
          </div>
        </div>
      </div>

      <!-- INVENTORY -->
      <section class="paper-card section-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">YOUR KITCHEN</span>
            <h2>What's in your fridge?</h2>
          </div>
          <span class="section-emoji">🥑</span>
        </div>

        <p class="section-description">
          A little overview of everything you have at home.
        </p>

        <div v-if="inventoryWithExpiry.length" class="table-wrap">
          <table class="inventory-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Quantity</th>
                <th>Storage</th>
                <th>Freshness</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="(item, index) in inventoryWithExpiry"
                :key="item._id || item.id || index"
              >
                <td class="ingredient-name">
                  {{ item.name }}
                </td>

                <td>
                  {{ item.quantity }}
                  {{ item.unit || '' }}
                </td>

                <td class="storage-cell">
                  {{ item.storage || 'Not specified' }}
                </td>

                <td>
                  <span
                    class="expiry-badge"
                    :class="expiryClass(item.daysRemaining)"
                  >
                    {{ item.expiryLabel }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="empty-message">
          Your inventory is empty.
        </p>
      </section>

      <!-- EAT SOON -->
      <section class="paper-card section-card eat-soon-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">DON'T LET GOOD FOOD GO TO WASTE</span>
            <h2>Eat Soon! ⏰</h2>
          </div>
          <span class="section-emoji">🥦</span>
        </div>

        <p class="section-description">
          These ingredients are approaching their expiry dates.
          Give them a little extra love!
        </p>

        <div v-if="eatSoonItems.length" class="timeline">
          <div
            v-for="(item, index) in eatSoonItems"
            :key="item._id || item.id || index"
            class="timeline-item"
          >
            <div
              class="timeline-marker"
              :class="expiryClass(item.daysRemaining)"
            ></div>

            <div class="timeline-content">
              <div>
                <strong>{{ item.name }}</strong>
                <p>
                  {{ item.quantity }} {{ item.unit || '' }}
                  · {{ item.storage || 'Storage unknown' }}
                </p>
              </div>

              <span
                class="timeline-label"
                :class="expiryClass(item.daysRemaining)"
              >
                {{ expiryHeading(item.daysRemaining) }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="empty-message">
          Nothing needs urgent attention right now!
        </div>

        <p v-if="expiredItems.length" class="expired-note">
          ⚠ {{ expiredItems.length }} item(s) have passed their
          recorded expiry dates and are excluded from recipe matching.
          Check them before deciding whether to use or discard them.
        </p>
      </section>

      <!-- RECIPES -->
      <section id="recipes" class="paper-card section-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">MADE WITH WHAT YOU HAVE</span>
            <h2>What can we cook? 🍳</h2>
          </div>
        </div>

        <p class="section-description">
          Discover recipes using ingredients already in your kitchen.
          Recommendations are powered by TheMealDB.
        </p>

        <!-- FILTER -->
        <div class="filter-bar">
          <div class="filter-input-group">
            <label for="ingredient-search">
              Search by recipe or ingredient
            </label>

            <input
              id="ingredient-search"
              v-model="ingredientSearch"
              type="text"
              placeholder="Try chicken, egg, rice..."
              class="filter-input"
            />
          </div>

          <button
            type="button"
            class="clear-button"
            @click="clearFilters"
          >
            Clear Filters
          </button>
        </div>

        <!-- LOADING -->
        <div v-if="recipesLoading" class="status-message">
          <div class="spinner-border text-success mb-3"></div>
          <p>Finding delicious recipes for you...</p>
        </div>

        <!-- ERROR -->
        <div v-else-if="recipesError" class="status-message">
          <h3>Oops! We couldn't load recipes.</h3>
          <p>{{ recipesError }}</p>

          <button
            type="button"
            class="action-button"
            @click="loadRecipes"
          >
            Try Again
          </button>
        </div>

        <!-- NO INVENTORY -->
        <div
          v-else-if="!availableIngredients.length"
          class="status-message"
        >
          <h3>No available ingredients yet</h3>
          <p>
            Add some non-expired groceries to your inventory
            to discover recipe recommendations.
          </p>
        </div>

        <!-- NO MATCHES -->
        <div
          v-else-if="!displayedRecipes.length"
          class="status-message"
        >
          <h3>No recipes found</h3>
          <p>
            Try a different search or check your inventory ingredients.
          </p>
        </div>

        <!-- RECIPE GRID -->
        <div v-else class="recipe-grid">
          <article
            v-for="recipe in displayedRecipes"
            :key="recipe.id"
            class="recipe-card"
          >
            <img
              v-if="recipe.image"
              :src="recipe.image"
              :alt="recipe.title"
              class="recipe-image"
            />

            <div class="recipe-content">
              <span class="match-badge">
                {{ recipe.matchPercentage }}% INGREDIENT MATCH
              </span>

              <h3>{{ recipe.title }}</h3>

              <p class="recipe-category">
                {{ recipe.category || 'Recipe Idea' }}
                <span v-if="recipe.area">
                  · {{ recipe.area }}
                </span>
              </p>

              <div class="ingredient-info">
                <p>
                  <strong>✓ You have:</strong>
                  {{ recipe.matchedIngredients.join(', ') || 'None yet' }}
                </p>

                <p>
                  <strong>+ Still need:</strong>
                  {{ recipe.missingIngredients.join(', ') || 'Nothing!' }}
                </p>
              </div>

              <button
                type="button"
                class="action-button recipe-button"
                @click="openRecipe(recipe)"
              >
                View Full Recipe →
              </button>
            </div>
          </article>
        </div>
      </section>

      <p class="footer-note">
        ✿ Small steps, less waste, a happier kitchen.
      </p>
    </div>
  </main>
</template>

<style scoped>
.freshness-page {
  min-height: 100vh;
  background: transparent;
  padding: 32px 20px 70px;
  color: var(--ink);
  font-family: inherit;
}

.page-container {
  max-width: 1160px;
  margin: 0 auto;
}

.paper-card {
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 24px;
  box-shadow: var(--shadow-paper);
}

.hero-card {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  align-items: center;
  gap: 24px;
  padding: 40px;
  margin-bottom: 30px;
}

.eyebrow {
  color: #109e91;
  font-size: 12px;
  letter-spacing: 2px;
  font-weight: 800;
}

.hero-card h1,
.section-heading h2,
.status-message h3 {
  font-family: var(--font-display);
  font-weight: 800;
}

.hero-card h1 {
  font-size: clamp(36px, 5vw, 58px);
  line-height: 1.1;
  margin: 18px 0;
}

.hero-description {
  max-width: 590px;
  line-height: 1.8;
  color: #64746b;
  margin-bottom: 25px;
}

.hero-decoration {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  justify-items: center;
  font-size: clamp(55px, 7vw, 90px);
}

.hero-decoration span {
  display: inline-block;
  transform: rotate(-10deg);
}

.hero-decoration span:nth-child(even) {
  transform: rotate(12deg);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
  margin-bottom: 30px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 18px;
  background: #e1f3e6;
  border: 2px solid #194b39;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 4px 4px 0 #194b39;
}

.summary-card:nth-child(2) {
  background: #fff0bf;
}

.summary-card:nth-child(3) {
  background: #fbd7cc;
}

.summary-icon {
  font-size: 34px;
}

.summary-card div {
  display: flex;
  flex-direction: column;
}

.summary-card strong {
  font-size: 30px;
}

.summary-card div span {
  font-size: 13px;
  font-weight: 700;
}

.section-card {
  padding: 34px;
  margin-bottom: 30px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.section-heading h2 {
  font-size: clamp(26px, 3vw, 36px);
  margin: 10px 0;
}

.section-emoji {
  font-size: 42px;
}

.section-description {
  color: #64746b;
  line-height: 1.7;
  margin-bottom: 25px;
}

.table-wrap {
  overflow-x: auto;
}

.inventory-table {
  width: 100%;
  border-collapse: collapse;
}

.inventory-table th {
  background: #e1f3e6;
  color: #194b39;
  padding: 16px;
  text-align: left;
  border-bottom: 2px solid #194b39;
}

.inventory-table td {
  padding: 17px 16px;
  border-bottom: 1px dashed #c1cfc3;
}

.ingredient-name {
  font-weight: 800;
}

.storage-cell {
  text-transform: capitalize;
}

.expiry-badge,
.timeline-label {
  display: inline-block;
  padding: 7px 13px;
  border: 1.5px solid #194b39;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 800;
}

.expiry-fresh {
  background: #c9efce;
}

.expiry-soon {
  background: #fff0a8;
}

.expiry-urgent {
  background: #ffb8a7;
}

.expiry-expired {
  background: #e8c7c7;
}

.expiry-neutral {
  background: #e6e6e6;
}

.eat-soon-section {
  background: #fff7dc;
}

.timeline {
  position: relative;
  margin-left: 12px;
  border-left: 3px dashed #109e91;
}

.timeline-item {
  position: relative;
  padding: 0 0 24px 28px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-marker {
  position: absolute;
  left: -11px;
  top: 18px;
  width: 19px;
  height: 19px;
  border: 3px solid #194b39;
  border-radius: 50%;
}

.timeline-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  background: #fffdf5;
  border: 2px solid #194b39;
  border-radius: 13px;
  padding: 18px;
}

.timeline-content strong {
  font-size: 18px;
}

.timeline-content p {
  margin: 6px 0 0;
  color: #64746b;
}

.expired-note {
  margin-top: 24px;
  color: #8b4949;
  font-size: 14px;
  line-height: 1.6;
}

.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.filter-input-group {
  flex: 1;
  min-width: 230px;
}

.filter-input-group label {
  display: block;
  font-weight: 800;
  margin-bottom: 8px;
}

.filter-input {
  width: 100%;
  border: 2px solid #194b39;
  border-radius: 12px;
  background: #fffdf5;
  padding: 12px 15px;
  outline-color: #109e91;
}

.clear-button {
  padding: 12px 18px;
  background: #fff0bf;
  border: 2px solid #194b39;
  border-radius: 12px;
  color: #194b39;
  font-weight: 800;
  cursor: pointer;
}

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.recipe-card {
  background: #fffdf5;
  border: 2px solid #194b39;
  border-radius: 17px;
  overflow: hidden;
  box-shadow: 4px 4px 0 #194b39;
  display: flex;
  flex-direction: column;
}

.recipe-image {
  width: 100%;
  height: 195px;
  object-fit: cover;
  border-bottom: 2px solid #194b39;
}

.recipe-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.match-badge {
  align-self: flex-start;
  background: #d8f2df;
  border: 1.5px solid #194b39;
  border-radius: 20px;
  padding: 6px 11px;
  font-size: 11px;
  font-weight: 800;
}

.recipe-content h3 {
  font-family: var(--font-display);  
  font-size: 21px;
  font-weight: 800;
  margin: 16px 0 8px;
}

.recipe-category {
  color: #64746b;
  font-size: 13px;
}

.ingredient-info {
  font-size: 13px;
  line-height: 1.6;
  margin-top: 12px;
  flex: 1;
}

.ingredient-info p {
  margin-bottom: 10px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 13px 26px;
  border: 2px solid var(--ink);
  border-radius: 14px 11px 16px 10px;
  background: var(--aqua);
  color: white;
  font-size: 17px;
  font-weight: 800;
  box-shadow: var(--shadow-small);
  transition: transform 150ms ease, box-shadow 150ms ease;
  cursor: pointer;
  text-decoration: none;
}

.action-button:hover:not(:disabled) {
  box-shadow: 1px 2px 0 var(--ink);
  transform: translate(2px, 2px);
  background: #0d968b;
  color: white;
}



.recipe-button {
  margin-top: 15px;
  width: 100%;
}

.status-message {
  text-align: center;
  padding: 35px 15px;
}

.status-message h3 {
  font-size: 25px;
}

.status-message p,
.empty-message {
  color: #64746b;
}

.footer-note {
  text-align: center;
  color: #64746b;
  margin-top: 30px;
  font-size: 14px;
}

@media (max-width: 900px) {
  .recipe-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-card {
    grid-template-columns: 1fr;
  }

  .hero-decoration {
    display: none;
  }
}

@media (max-width: 650px) {
  .summary-grid,
  .recipe-grid {
    grid-template-columns: 1fr;
  }

  .section-card,
  .hero-card {
    padding: 23px;
  }

  .timeline-content {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* Full Circle typography */
.recipe-page,
.freshness-page {
  font-family: var(--font-sans);
  font-size: 18px;
}

.recipe-page h1,
.recipe-page h2,
.recipe-page h3,
.freshness-page h1,
.freshness-page h2,
.freshness-page h3 {
  font-family: var(--font-display);
}

.recipe-page button,
.recipe-page input,
.freshness-page button,
.freshness-page input {
  font-family: var(--font-sans);
}
</style>
