
<script setup>
import { computed, ref } from 'vue'

import {
  sampleInventory,
  sampleRecipes,
} from '../../data/freshnessDemo.js'

import {
  getDaysRemaining,
  getExpiryStatus,
  getExpiryLabel,
} from '../../utils/expiryUtils.js'

import {
  matchRecipes,
  filterRecipes,
} from '../../utils/recipeUtils.js'

// Temporary data until backend integration.
const inventory = ref(sampleInventory)
const recipes = ref(sampleRecipes)

// Recipe filters.
const maxTime = ref('')
const diet = ref('')
const ingredient = ref('')

// Feature 1: Calculate expiry dates.
const inventoryWithExpiry = computed(() => {
  return inventory.value.map(item => {
    const daysRemaining = getDaysRemaining(item.expiresAt)

    return {
      ...item,
      daysRemaining,
      status: getExpiryStatus(daysRemaining),
      expiryLabel: getExpiryLabel(daysRemaining),
    }
  })
})

// Feature 2: Eat Soon timeline.
const eatSoonItems = computed(() => {
  return inventoryWithExpiry.value
    .filter(item => item.daysRemaining !== null)
    .filter(item => item.daysRemaining <= 3)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
})

function getTimelineColor(days) {
  if (days <= 0) return 'danger'
  if (days === 1) return 'warning'
  return 'success'
}

function getTimelineHeading(days) {
  if (days < 0) return 'EXPIRED'
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  return `IN ${days} DAYS`
}

// Features 3 and 4: Recommendations and missing ingredients.
const recommendedRecipes = computed(() => {
  return matchRecipes(recipes.value, inventoryWithExpiry.value)
})

// Feature 5: Recipe filters.
const displayedRecipes = computed(() => {
  return filterRecipes(recommendedRecipes.value, {
    maxTime: maxTime.value,
    diet: diet.value,
    ingredient: ingredient.value,
  })
})

function clearFilters() {
  maxTime.value = ''
  diet.value = ''
  ingredient.value = ''
}
</script>

<template>
  <main class="container py-4">
    <h1 class="mb-2">Freshness & Recipes</h1>

    <p class="text-muted mb-4">
      Track food expiry dates and discover recipes
      using ingredients you already have.
    </p>

    <div class="alert alert-info">
      Demo mode: displaying sample inventory and recipes.
    </div>

    <!-- FEATURE 1: EXPIRY TRACKING -->
    <section class="mb-5">
      <h2 class="mb-3">My Food Inventory</h2>

      <div class="table-responsive">
        <table class="table table-bordered align-middle">
          <thead class="table-light">
            <tr>
              <th>Food</th>
              <th>Quantity</th>
              <th>Storage</th>
              <th>Expiry Status</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="item in inventoryWithExpiry"
              :key="item._id"
            >
              <td class="fw-semibold">{{ item.name }}</td>

              <td>{{ item.quantity }} {{ item.unit }}</td>

              <td class="text-capitalize">
                {{ item.storage }}
              </td>

              <td>
                <span
                  class="badge"
                  :class="{
                    'text-bg-danger': item.status === 'expired',
                    'text-bg-warning': item.status === 'eat-soon',
                    'text-bg-success': item.status === 'fresh',
                    'text-bg-secondary': item.status === 'unknown',
                  }"
                >
                  {{ item.expiryLabel }}
                </span>
              </td>
            </tr>

            <tr v-if="inventoryWithExpiry.length === 0">
              <td colspan="4" class="text-center text-muted">
                No food items found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- FEATURE 2: EAT SOON TIMELINE -->
    <section class="mb-5">
      <h2 class="mb-3">Eat Soon Timeline</h2>

      <p class="text-muted">
        Groceries that have expired or will expire
        within the next 3 days.
      </p>

      <div
        v-if="eatSoonItems.length === 0"
        class="alert alert-success"
      >
        No groceries are expiring within the next 3 days.
      </div>

      <div v-else class="expiry-timeline">
        <div
          v-for="item in eatSoonItems"
          :key="item._id"
          class="timeline-item"
        >
          <div
            class="timeline-dot"
            :class="`dot-${getTimelineColor(item.daysRemaining)}`"
          ></div>

          <div class="timeline-content">
            <small class="text-muted fw-bold">
              {{ getTimelineHeading(item.daysRemaining) }}
            </small>

            <div class="card shadow-sm mt-2">
              <div class="card-body">
                <div
                  class="d-flex justify-content-between align-items-center gap-3"
                >
                  <div>
                    <h5 class="mb-1">{{ item.name }}</h5>

                    <p class="text-muted mb-1">
                      {{ item.quantity }} {{ item.unit }}
                    </p>

                    <small>{{ item.expiryLabel }}</small>
                  </div>

                  <span
                    class="badge"
                    :class="`text-bg-${getTimelineColor(item.daysRemaining)}`"
                  >
                    {{ item.daysRemaining < 0
                      ? 'Expired'
                      : 'Eat Soon' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES 3, 4 AND 5: RECIPES -->
    <section class="mb-5">
      <h2 class="mb-3">Recommended Recipes</h2>

      <p class="text-muted">
        Recipes are ranked by how many required
        ingredients you already have.
      </p>

      <!-- RECIPE FILTERS -->
      <div class="row g-3 mb-3">
        <div class="col-md-4">
          <label for="max-time" class="form-label">
            Maximum preparation time
          </label>

          <select
            id="max-time"
            v-model="maxTime"
            class="form-select"
          >
            <option value="">Any time</option>
            <option value="10">10 minutes</option>
            <option value="20">20 minutes</option>
            <option value="30">30 minutes</option>
          </select>
        </div>

        <div class="col-md-4">
          <label for="diet" class="form-label">
            Dietary preference
          </label>

          <select
            id="diet"
            v-model="diet"
            class="form-select"
          >
            <option value="">All diets</option>
            <option value="Vegetarian">Vegetarian</option>
            <option value="Vegan">Vegan</option>
          </select>
        </div>

        <div class="col-md-4">
          <label for="ingredient" class="form-label">
            Filter by ingredient
          </label>

          <input
            id="ingredient"
            v-model="ingredient"
            class="form-control"
            placeholder="e.g. Apple"
          />
        </div>
      </div>

      <button
        type="button"
        class="btn btn-outline-secondary btn-sm mb-4"
        @click="clearFilters"
      >
        Clear Filters
      </button>

      <p v-if="displayedRecipes.length === 0">
        No recipes match your selected filters.
      </p>

      <!-- RECIPE CARDS -->
      <div class="row g-4">
        <div
          v-for="recipe in displayedRecipes"
          :key="recipe.id"
          class="col-md-6"
        >
          <div class="card h-100 recipe-card">
            <div class="card-body">
              <h4 class="card-title">{{ recipe.name }}</h4>

              <p class="text-muted mb-2">
                Preparation time:
                {{ recipe.prepTime }} minutes
              </p>

              <div class="mb-3">
                <span
                  v-for="tag in recipe.dietaryTags"
                  :key="tag"
                  class="badge text-bg-light border me-2"
                >
                  {{ tag }}
                </span>
              </div>

              <div class="mb-3">
                <div
                  class="d-flex justify-content-between mb-1"
                >
                  <span>Ingredient match</span>
                  <strong>
                    {{ recipe.matchPercentage }}%
                  </strong>
                </div>

                <div
                  class="progress"
                  role="progressbar"
                  :aria-valuenow="recipe.matchPercentage"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    class="progress-bar bg-success"
                    :style="{ width: `${recipe.matchPercentage}%` }"
                  ></div>
                </div>
              </div>

              <h6>Available Ingredients</h6>
              <p class="text-success">
                {{ recipe.matchedIngredients.join(', ') || 'None' }}
              </p>

              <h6>Missing Ingredients</h6>
              <p class="text-danger">
                {{ recipe.missingIngredients.join(', ') || 'None!' }}
              </p>

              <span
                v-if="recipe.missingIngredients.length === 0"
                class="badge text-bg-success"
              >
                Ready to make
              </span>

              <span
                v-else
                class="badge text-bg-secondary"
              >
                {{ recipe.missingIngredients.length }}
                missing ingredient(s)
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.expiry-timeline {
  position: relative;
  padding-left: 30px;
}

.timeline-item {
  position: relative;
  padding-left: 25px;
  padding-bottom: 25px;
  border-left: 3px solid #dce5df;
}

.timeline-item:last-child {
  border-left-color: transparent;
}

.timeline-dot {
  position: absolute;
  left: -10px;
  top: 3px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 0 0 2px #dce5df;
}

.dot-danger {
  background-color: #dc3545;
}

.dot-warning {
  background-color: #ffc107;
}

.dot-success {
  background-color: #198754;
}

.timeline-content {
  padding-left: 5px;
}

.timeline-content .card {
  border-radius: 12px;
}

.recipe-card {
  border-radius: 12px;
  transition: transform 0.2s ease;
}

.recipe-card:hover {
  transform: translateY(-3px);
}

.progress {
  height: 10px;
}
</style>
