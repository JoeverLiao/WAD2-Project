
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePageLoading } from '../../utils/pageLoading.js'

import {
  getUserRecipes,
  saveUserRecipe,
  unsaveUserRecipe,
  markUserRecipeCooked,
} from '../../services/userRecipeApi.js'

const route = useRoute()
const router = useRouter()

const API = 'http://localhost:3000'

const recipe = ref(null)
const loading = ref(true)
const error = ref('')

const userRecord = ref(null)
const actionLoading = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

usePageLoading(loading, 'Loading recipe')

function authHeaders() {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('fullcircle-token')

  return token
    ? { Authorization: `Bearer ${token}` }
    : {}
}

const isSaved = computed(() =>
  Boolean(userRecord.value?.saved)
)

const cookCount = computed(() =>
  Number(userRecord.value?.cookCount || 0)
)

const lastCooked = computed(() => {
  const value = userRecord.value?.lastCookedAt

  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
})

async function loadUserStatus(id) {
  try {
    const records = await getUserRecipes()

    // Prevent an older request from changing
    // the status of a newly opened recipe.
    if (String(route.params.id) !== String(id)) return

    userRecord.value =
      records.find(record =>
        String(record.recipeId) === String(id)
      ) || null

  } catch (err) {
    actionError.value =
      err.message || 'Unable to load recipe history.'
  }
}

async function loadRecipe(id) {
  recipe.value = null
  userRecord.value = null

  loading.value = true
  error.value = ''
  actionError.value = ''
  actionSuccess.value = ''

  try {
    if (!/^\d+$/.test(String(id))) {
      throw new Error(
        'Invalid recipe ID. Please select a TheMealDB recipe.'
      )
    }

    const response = await fetch(
      `${API}/api/freshness/recipes/${encodeURIComponent(id)}`,
      {
        credentials: 'include',
        headers: authHeaders(),
      }
    )

    if (!response.ok) {
      throw new Error(
        `Unable to load recipe (HTTP ${response.status})`
      )
    }

    const data = await response.json()

    if (!data || !data.id) {
      throw new Error('Recipe details were not found.')
    }

    if (String(route.params.id) !== String(id)) return

    recipe.value = data

    await loadUserStatus(id)

  } catch (err) {
    if (String(route.params.id) === String(id)) {
      error.value =
        err.message || 'Unable to load recipe.'
    }
  } finally {
    if (String(route.params.id) === String(id)) {
      loading.value = false
    }
  }
}

watch(
  () => route.params.id,
  id => loadRecipe(id),
  { immediate: true }
)

async function toggleSave() {
  if (!recipe.value || actionLoading.value) return

  actionLoading.value = true
  actionError.value = ''
  actionSuccess.value = ''

  try {
    if (isSaved.value) {
      await unsaveUserRecipe(recipe.value.id)
      actionSuccess.value =
        'Recipe removed from your saved collection.'
    } else {
      await saveUserRecipe(recipe.value)
      actionSuccess.value = 'Recipe saved successfully!'
    }

    await loadUserStatus(recipe.value.id)

  } catch (err) {
    actionError.value = err.message
  } finally {
    actionLoading.value = false
  }
}

async function markCooked() {
  if (!recipe.value || actionLoading.value) return

  actionLoading.value = true
  actionError.value = ''
  actionSuccess.value = ''

  try {
    await markUserRecipeCooked(recipe.value)

    await loadUserStatus(recipe.value.id)

    actionSuccess.value =
      'Added to your cooking history!'

  } catch (err) {
    actionError.value = err.message
  } finally {
    actionLoading.value = false
  }
}

function goBack() {
  router.push({
    name: 'freshness-recipes',
    hash: '#recipes',
  })
}
</script>

<template>
  <main class="recipe-detail container py-4">
    <button
      type="button"
      class="btn btn-outline-success mb-4"
      @click="goBack"
    >
      ← Back to Recipes
    </button>

    <div v-if="loading" class="alert alert-info">
      Loading recipe details...
    </div>

    <div v-else-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <article v-else-if="recipe" class="recipe-paper">
      <div class="recipe-hero fc-page-heading">
        <img
          v-if="recipe.image"
          :src="recipe.image"
          :alt="recipe.name"
          class="recipe-photo"
        />

        <div class="recipe-intro">
          <p class="eyebrow">LET'S GET COOKING!</p>

          <h1>{{ recipe.name }}</h1>

          <div class="recipe-tags">
            <span
              v-if="recipe.category"
              class="recipe-tag"
            >
              {{ recipe.category }}
            </span>

            <span
              v-if="recipe.area"
              class="recipe-tag"
            >
              {{ recipe.area }} cuisine
            </span>

            <span
              v-for="tag in recipe.dietaryTags || []"
              :key="tag"
              class="recipe-tag"
            >
              {{ tag }}
            </span>
          </div>

          <p v-if="recipe.prepTime" class="recipe-meta">
            ⏱ {{ recipe.prepTime }} minutes
          </p>

          <p v-if="recipe.servings" class="recipe-meta">
            🍽 {{ recipe.servings }} servings
          </p>

          <div v-if="cookCount > 0" class="history-badge">
            <strong>
              ✓ Cooked {{ cookCount }}
              {{ cookCount === 1 ? 'time' : 'times' }}
            </strong>

            <span v-if="lastCooked">
              Last cooked {{ lastCooked }}
            </span>
          </div>
        </div>
      </div>

      <!-- SAVE + COOKED ACTIONS -->
      <div class="recipe-user-actions">
        <div class="action-heading">
          <h2>Your Recipe Collection</h2>
          <p>
            Save your favourites and track what you've cooked.
          </p>
        </div>

        <div class="action-buttons">
          <button
            type="button"
            class="save-recipe-button"
            :class="{ saved: isSaved }"
            :disabled="actionLoading"
            @click="toggleSave"
          >
            {{
              isSaved
                ? '♥ Saved — Remove'
                : '♡ Save Recipe'
            }}
          </button>

          <button
            type="button"
            class="cook-recipe-button"
            :disabled="actionLoading"
            @click="markCooked"
          >
            {{
              actionLoading
                ? 'Saving...'
                : cookCount > 0
                  ? '🍳 Cook Again'
                  : '✓ Mark as Cooked'
            }}
          </button>
        </div>
      </div>

      <div
        v-if="actionSuccess"
        class="action-message success"
      >
        {{ actionSuccess }}
      </div>

      <div
        v-if="actionError"
        class="action-message error"
      >
        {{ actionError }}
      </div>

      <div class="recipe-content">
        <section class="ingredients-panel">
          <h2>🧺 Ingredients</h2>

          <p class="section-description">
            Everything you'll need for this recipe.
          </p>

          <ul v-if="recipe.ingredientDetails?.length">
            <li
              v-for="(ingredient, index) in recipe.ingredientDetails"
              :key="index"
            >
              <span class="ingredient-name">
                {{ ingredient.name }}
              </span>

              <span class="ingredient-amount">
                {{ ingredient.amount || 'As needed' }}
              </span>
            </li>
          </ul>

          <p v-else>
            No ingredient information available.
          </p>
        </section>

        <section class="instructions-panel">
          <h2>👩‍🍳 Cooking Instructions</h2>

          <p class="section-description">
            Follow these steps to prepare your meal.
          </p>

          <ol v-if="recipe.instructions?.length">
            <li
              v-for="(instruction, index) in recipe.instructions"
              :key="index"
            >
              <span class="step-number">
                {{ index + 1 }}
              </span>

              <p>{{ instruction }}</p>
            </li>
          </ol>

          <p v-else>
            No cooking instructions available.
          </p>
        </section>
      </div>

      <div
        v-if="recipe.sourceUrl"
        class="recipe-footer"
      >
        <a
          :href="recipe.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-success"
        >
          View Original Recipe ↗
        </a>
      </div>
    </article>
  </main>
</template>

<style scoped>
.recipe-detail {
  max-width: 1150px;
  color: var(--ink, #123f3b);
}

.recipe-paper {
  background: var(--paper, #fdfaf3);
  border: 2px solid var(--ink, #123f3b);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 6px 8px 0 var(--ink, #123f3b);
}

.recipe-hero {
  display: grid;
  grid-template-columns: 45% 55%;
  border-bottom: 2px solid var(--ink, #123f3b);
}

.recipe-photo {
  width: 100%;
  height: 340px;
  object-fit: cover;
}

.recipe-intro {
  padding: 35px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.eyebrow {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 2px;
  color: var(--aqua, #0fa89c);
  margin-bottom: 12px;
}

.recipe-intro h1 {
  font-family: var(--font-display, 'Kalam', cursive);
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.2;
  margin-bottom: 20px;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 15px;
}

.recipe-tag {
  background: var(--aqua-soft, #d9f4ef);
  border: 1px solid var(--ink, #123f3b);
  border-radius: 20px;
  padding: 6px 13px;
  font-size: 14px;
}

.recipe-meta {
  color: var(--muted, #557b77);
  margin-bottom: 8px;
}

.history-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 14px;
  background: #dff1c8;
  border: 1px solid #123f3b;
  border-radius: 10px;
  padding: 11px 15px;
  width: fit-content;
}

.history-badge span {
  font-size: 13px;
  color: #557b77;
}

.recipe-user-actions {
  padding: 24px 30px;
  background: #fff9e8;
  border-bottom: 2px solid #123f3b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.action-heading h2 {
  font-family: var(--font-display, 'Kalam', cursive);
  font-size: 1.6rem;
  margin: 0 0 5px;
}

.action-heading p {
  color: #557b77;
  margin: 0;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.action-buttons button {
  padding: 12px 17px;
  border: 2px solid #123f3b;
  border-radius: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: transform .2s;
}

.action-buttons button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.action-buttons button:disabled {
  opacity: .5;
  cursor: wait;
}

.save-recipe-button {
  background: white;
  color: #123f3b;
}

.save-recipe-button.saved {
  background: #ffe0df;
  color: #9a2c42;
}

.cook-recipe-button {
  background: #ffdd69;
  color: #123f3b;
}

.action-message {
  padding: 13px 30px;
  font-weight: 700;
}

.action-message.success {
  background: #dff1c8;
  color: #236346;
}

.action-message.error {
  background: #ffe3d9;
  color: #9b3127;
}

.recipe-content {
  display: grid;
  grid-template-columns: 36% 64%;
}

.ingredients-panel,
.instructions-panel {
  padding: 30px;
}

.ingredients-panel {
  background: var(--aqua-soft, #d9f4ef);
  border-right: 2px solid var(--ink, #123f3b);
}

.recipe-content h2 {
  font-family: var(--font-display, 'Kalam', cursive);
  font-size: 1.8rem;
  margin-bottom: 10px;
}

.section-description {
  color: var(--muted, #557b77);
  font-size: 14px;
  margin-bottom: 22px;
}

.ingredients-panel ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ingredients-panel li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px dashed #9bcac5;
}

.ingredient-name {
  font-weight: 600;
}

.ingredient-amount {
  color: var(--muted, #557b77);
  text-align: right;
  font-size: 14px;
}

.instructions-panel ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

.instructions-panel li {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 22px;
}

.step-number {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--yellow, #ffdd69);
  border: 2px solid var(--ink, #123f3b);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.instructions-panel li p {
  margin: 4px 0 0;
  line-height: 1.7;
  white-space: pre-line;
}

.recipe-footer {
  padding: 24px 30px;
  border-top: 2px solid var(--ink, #123f3b);
  text-align: right;
}

@media (max-width: 768px) {
  .recipe-hero,
  .recipe-content {
    grid-template-columns: 1fr;
  }

  .recipe-photo {
    height: 250px;
  }

  .recipe-intro,
  .ingredients-panel,
  .instructions-panel {
    padding: 22px;
  }

  .ingredients-panel {
    border-right: 0;
    border-bottom: 2px solid var(--ink, #123f3b);
  }

  .recipe-user-actions {
    padding: 22px;
  }
}
</style>
