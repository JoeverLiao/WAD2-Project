
<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const recipe = ref(null)
const loading = ref(true)
const error = ref('')

async function loadRecipe() {
  loading.value = true
  error.value = ''
  recipe.value = null

  try {
    const response = await fetch(
      `/api/freshness/recipes/${route.params.id}`,
      { credentials: 'include' }
    )

    if (!response.ok) {
      throw new Error(`Unable to load recipe (${response.status})`)
    }

    const data = await response.json()

    if (!data || !data.id) {
      throw new Error('Recipe details are unavailable')
    }

    recipe.value = data
  } catch (err) {
    console.error('Recipe details error:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'freshness-recipes' })
}

onMounted(loadRecipe)

watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId !== oldId) loadRecipe()
  }
)
</script>

<template>
  <main class="recipe-page">
    <div class="recipe-container">

      <!-- BACK -->
      <button class="back-button" @click="goBack">
        ← Back to Recipes
      </button>

      <!-- LOADING -->
      <div v-if="loading" class="paper-card status-card">
        <div class="spinner-border text-success mb-3"></div>
        <p>Finding your recipe...</p>
      </div>

      <!-- ERROR -->
      <div v-else-if="error" class="paper-card status-card">
        <h2>Oops! Something went wrong.</h2>
        <p>{{ error }}</p>
        <button class="action-button" @click="loadRecipe">
          Try Again
        </button>
      </div>

      <!-- RECIPE -->
      <template v-else-if="recipe">

        <!-- HERO -->
        <section class="recipe-hero paper-card">
          <div class="hero-text">
            <span class="eyebrow">
              ✿ THE FULL CIRCLE COOKBOOK
            </span>

            <h1>{{ recipe.title }}</h1>

            <p class="hero-description">
              A little inspiration for turning your groceries
              into something delicious.
            </p>

            <div class="recipe-tags">
              <span
                v-if="recipe.category"
                class="tag tag-coral"
              >
                {{ recipe.category }}
              </span>

              <span
                v-if="recipe.area"
                class="tag tag-yellow"
              >
                {{ recipe.area }} Cuisine
              </span>
            </div>
          </div>

          <img
            v-if="recipe.image"
            :src="recipe.image"
            :alt="recipe.title"
            class="hero-image"
          />
        </section>

        <!-- MAIN CONTENT -->
        <div class="recipe-grid">

          <!-- INGREDIENTS -->
          <section class="paper-card ingredients-card">
            <div class="section-heading">
              <span class="section-icon">🥕</span>
              <h2>What you'll need</h2>
            </div>

            <p class="section-subtitle">
              Gather these ingredients before you begin.
            </p>

            <ul
              v-if="recipe.ingredients?.length"
              class="ingredient-list"
            >
              <li
                v-for="(item, index) in recipe.ingredients"
                :key="index"
              >
                <span class="ingredient-dot">✓</span>
                <span>
                  <strong v-if="item.amount">
                    {{ item.amount }}
                  </strong>
                  {{ item.name }}
                </span>
              </li>
            </ul>

            <p v-else>
              Ingredient information is unavailable.
            </p>
          </section>

          <!-- INSTRUCTIONS -->
          <section class="paper-card instructions-card">
            <div class="section-heading">
              <span class="section-icon">🍳</span>
              <h2>Let's get cooking!</h2>
            </div>

            <p class="section-subtitle">
              Follow along and make something wonderful.
            </p>

            <div
              v-if="recipe.instructions"
              class="instructions-content"
            >
              {{ recipe.instructions }}
            </div>

            <p v-else>
              Cooking instructions are unavailable.
            </p>
          </section>
        </div>

        <!-- EXTERNAL LINKS -->
        <section class="paper-card links-card">
          <div>
            <h2>Want a little extra help?</h2>
            <p>
              Explore the original recipe or watch a cooking video.
            </p>
          </div>

          <div class="link-buttons">
            <a
              v-if="recipe.sourceUrl?.startsWith('https://')"
              :href="recipe.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="action-button"
            >
              Original Recipe ↗
            </a>

            <a
              v-if="recipe.youtubeUrl?.startsWith('https://')"
              :href="recipe.youtubeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="action-button video-button"
            >
              Watch Video ▶
            </a>

            <span
              v-if="
                !recipe.sourceUrl?.startsWith('https://') &&
                !recipe.youtubeUrl?.startsWith('https://')
              "
              class="muted-text"
            >
              No external links available for this recipe.
            </span>
          </div>
        </section>

      </template>
    </div>
  </main>
</template>

<style scoped>
.recipe-page {
  min-height: 100vh;
  background: transparent;
  padding: 32px 20px 80px;
  color: var(--ink);
  font-family: inherit;
}

.recipe-container {
  max-width: 1120px;
  margin: 0 auto;
}

.back-button {
  border: 2px solid #194b39;
  border-radius: 12px;
  background: #fffdf5;
  color: #194b39;
  padding: 10px 20px;
  font-weight: 700;
  margin-bottom: 24px;
  cursor: pointer;
}

.back-button:hover {
  background: #e6f4e7;
}

.paper-card {
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 24px;
  box-shadow: var(--shadow-paper);
}

.recipe-hero {
  display: grid;
  grid-template-columns: 1fr 0.9fr;
  gap: 32px;
  padding: 36px;
  align-items: center;
  margin-bottom: 32px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #119c91;
}

.hero-text h1 {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 52px);
  line-height: 1.2;
  margin: 20px 0;
  font-weight: 800;
} 

.hero-description {
  color: #64746b;
  line-height: 1.7;
  font-size: 16px;
}

.hero-image {
  width: 100%;
  height: 320px;
  object-fit: cover;
  border: 2px solid #194b39;
  border-radius: 16px;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.tag {
  padding: 9px 16px;
  border: 2px solid #194b39;
  border-radius: 30px;
  font-weight: 700;
  font-size: 13px;
}

.tag-coral {
  background: #ffb8a7;
}

.tag-yellow {
  background: #ffe5a3;
}

.recipe-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 28px;
  margin-bottom: 32px;
  align-items: start;
}

.ingredients-card,
.instructions-card {
  padding: 30px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  font-size: 28px;
}

.section-heading h2,
.links-card h2 {
  font-family: var(--font-display); 
  font-size: 28px;
  margin: 0;
  font-weight: 800;
}

.section-subtitle {
  color: #64746b;
  margin: 12px 0 24px;
}

.ingredient-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.ingredient-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px dashed #b5c9b8;
  line-height: 1.5;
}

.ingredient-list li:last-child {
  border-bottom: none;
}

.ingredient-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #d8f2df;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 800;
}

.instructions-content {
  white-space: pre-line;
  line-height: 2;
  color: #334e42;
}

.links-card {
  padding: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.links-card p {
  margin: 10px 0 0;
  color: #64746b;
}

.link-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
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

.video-button {
  background: #ffb8a7;
  color: #194b39;
}

.video-button:hover {
  background: #ff9f89;
  color: #194b39;
}

.status-card {
  padding: 50px;
  text-align: center;
}

.muted-text {
  color: #64746b;
}

@media (max-width: 768px) {
  .recipe-hero,
  .recipe-grid {
    grid-template-columns: 1fr;
  }

  .recipe-hero {
    padding: 24px;
  }

  .hero-image {
    height: 250px;
  }

  .links-card {
    flex-direction: column;
    align-items: flex-start;
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
