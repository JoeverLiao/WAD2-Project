<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { apiRequest } from '../../services/api.js'

import { sampleRecipes } from '../../data/freshnessDemo.js'
import { getDaysRemaining, getExpiryStatus, getExpiryLabel } from '../../utils/expiryUtils.js'
import { matchRecipes } from '../../utils/recipeUtils.js'

const auth = useAuthStore()
const dashboard = ref(null)
const loading = ref(true)
const error = ref('')
const recipes = ref([])

const storageKeys = ['fridge', 'freezer', 'pantry']
const storageLabels = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' }
const storageIcons = { fridge: '🧊', freezer: '❄️', pantry: '🥫' }

onMounted(async () => {
  if (!auth.isAuthenticated) {
    loading.value = false
    return
  }
  try {
    dashboard.value = await apiRequest('/dashboard')

    const now = new Date()
    const inventory = []
    for (const type of storageKeys) {
      const unit = dashboard.value.storageBreakdown[type]
      if (unit && unit.items) {
        unit.items.forEach((item) => {
          const days = getDaysRemaining(item.expiresAt, now)
          inventory.push({
            name: item.name,
            quantity: item.quantity || 1,
            daysRemaining: days,
            status: getExpiryStatus(days),
          })
        })
      }
    }

    if (inventory.length > 0) {
      recipes.value = matchRecipes(sampleRecipes, inventory)
    } else {
      recipes.value = sampleRecipes.map((r) => ({ ...r, matchedIngredients: [], missingIngredients: r.ingredients, matchPercentage: 0 }))
    }
  } catch (e) {
    error.value = e.message || 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
})

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getExpiryBadgeClass(item) {
  if (!item.expiresAt) return 'text-bg-secondary'
  const days = getDaysRemaining(item.expiresAt)
  if (days === null) return 'text-bg-secondary'
  if (days < 0) return 'text-bg-danger'
  if (days <= 1) return 'text-bg-warning'
  if (days <= 3) return 'text-bg-info'
  return 'text-bg-success'
}

function getExpiryBadgeText(item) {
  if (!item.expiresAt) return 'No expiry'
  const days = getDaysRemaining(item.expiresAt)
  if (days === null) return 'No expiry'
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days}d left`
}
</script>

<template>
  <section aria-label="Dashboard" v-if="auth.isAuthenticated" class="dashboard-section">
    <h1 class="dashboard-title">Dashboard</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div v-if="dashboard" class="dashboard-content">
      <div class="row g-4">
        <div class="col-lg-8">
          <h2 class="section-title">Storage Units</h2>
          <div class="row g-3">
            <div
              v-for="type in storageKeys"
              :key="type"
              class="col-md-6 col-lg-4"
            >
              <div class="storage-card" :class="`storage-${type}`">
                <div class="storage-card-header">
                  <span class="storage-icon">{{ storageIcons[type] }}</span>
                  <h3 class="storage-name">{{ storageLabels[type] }}</h3>
                  <span class="storage-badge">{{ dashboard.storageBreakdown[type].count }} items</span>
                </div>

                <div v-if="dashboard.storageBreakdown[type].items.length" class="storage-items">
                  <p class="storage-items-title">Items</p>
                  <ul>
                    <li v-for="item in dashboard.storageBreakdown[type].items.slice(0, 5)" :key="item._id">
                      <strong>{{ item.name }}</strong>
                      <span v-if="item.quantity">({{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span>)</span>
                      <span v-if="item.expiresAt" class="badge" :class="getExpiryBadgeClass(item)">{{ getExpiryBadgeText(item) }}</span>
                    </li>
                    <li v-if="dashboard.storageBreakdown[type].items.length > 5" class="text-muted">
                      +{{ dashboard.storageBreakdown[type].items.length - 5 }} more items
                    </li>
                  </ul>
                </div>

                <div class="storage-meta">
                  <div class="meta-item">
                    <span class="meta-label">Expiring soon</span>
                    <span class="meta-value" :class="dashboard.storageBreakdown[type].expiringSoon.length > 0 ? 'text-warning' : 'text-success'">
                      {{ dashboard.storageBreakdown[type].expiringSoon.length }}
                    </span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Healthy stock</span>
                    <span class="meta-value text-success">{{ dashboard.storageBreakdown[type].healthyCount }}</span>
                  </div>
                </div>

                <RouterLink :to="{ name: 'fridge' }" class="view-link">View contents →</RouterLink>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <h2 class="section-title">Expiry Alerts</h2>

          <div v-if="dashboard.expiringToday.length" class="expiry-section">
            <h3 class="expiry-subtitle">Expiring Today</h3>
            <ul class="expiry-list">
              <li v-for="item in dashboard.expiringToday" :key="item._id" class="expiry-item expiry-danger">
                <span class="expiry-name">{{ item.name }}</span>
                <span class="expiry-detail">{{ item.storage }}</span>
                <span v-if="item.quantity" class="expiry-qty">{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></span>
              </li>
            </ul>
          </div>

          <div v-if="dashboard.expired.length" class="expiry-section">
            <h3 class="expiry-subtitle">Expired</h3>
            <ul class="expiry-list">
              <li v-for="item in dashboard.expired" :key="item._id" class="expiry-item expiry-expired">
                <span class="expiry-name">{{ item.name }}</span>
                <span class="expiry-detail">{{ item.storage }}</span>
                <span v-if="item.quantity" class="expiry-qty">{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></span>
                <span class="expiry-date">{{ formatDate(item.expiresAt) }}</span>
              </li>
            </ul>
          </div>

          <div v-if="!dashboard.expiringToday.length && !dashboard.expired.length" class="expiry-empty">
            <p>No items expiring soon.</p>
          </div>

          <div class="donation-section">
            <RouterLink :to="{ name: 'food-rescue' }" class="donation-link">
              <span>🍲</span> Donate surplus food
            </RouterLink>
          </div>
        </div>
      </div>

      <div v-if="recipes.length" class="recipes-section">
        <h2 class="section-title">Popular Recipes</h2>
        <div class="row g-3">
          <div
            v-for="recipe in recipes.slice(0, 3)"
            :key="recipe.id"
            class="col-md-4"
          >
            <div class="recipe-card">
              <div class="recipe-card-body">
                <h4 class="recipe-name">{{ recipe.name }}</h4>
                <p class="recipe-time">{{ recipe.prepTime }} min</p>
                <div v-if="recipe.matchPercentage !== undefined" class="recipe-match">
                  <div class="d-flex justify-content-between">
                    <span>Ingredient match</span>
                    <strong>{{ recipe.matchPercentage }}%</strong>
                  </div>
                  <div class="progress" role="progressbar" :aria-valuenow="recipe.matchPercentage" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar bg-success" :style="{ width: `${recipe.matchPercentage}%` }"></div>
                  </div>
                </div>
                <div v-if="recipe.matchedIngredients && recipe.matchedIngredients.length" class="recipe-meta">
                  <small class="text-success">{{ recipe.matchedIngredients.join(', ') }}</small>
                </div>
                <RouterLink :to="{ name: 'freshness-recipes' }" class="view-link">View recipe →</RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading dashboard...</div>
  </section>
  <section v-else aria-label="Dashboard" class="dashboard-section">
    <h1 class="dashboard-title">Dashboard</h1>
    <p>Please <RouterLink :to="{ name: 'login' }">log in</RouterLink> to view your dashboard.</p>
  </section>
</template>

<style scoped>
.dashboard-section {
  max-width: 1200px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.dashboard-title {
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #164b35;
}

.storage-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f5f5f5;
  padding: 1rem;
  height: 100%;
}

.storage-fridge {
  background: #f0f7f0;
  border-color: #c8dfc8;
}

.storage-freezer {
  background: #f0f5ff;
  border-color: #c8d8ef;
}

.storage-pantry {
  background: #faf5ea;
  border-color: #e8dcc0;
}

.storage-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.storage-icon {
  font-size: 1.3rem;
}

.storage-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  flex: 1;
}

.storage-badge {
  background: #164b35;
  color: #fff;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.storage-items {
  margin-bottom: 0.5rem;
}

.storage-items-title {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.25rem;
  font-weight: 600;
}

.storage-items ul {
  padding-left: 0;
  list-style: none;
  margin: 0;
}

.storage-items li {
  font-size: 0.85rem;
  margin-bottom: 0.2rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.storage-items li :deep(.badge) {
  font-size: 0.7rem;
}

.storage-meta {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #ddd;
}

.meta-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.meta-label {
  font-size: 0.7rem;
  color: #666;
}

.meta-value {
  font-size: 1.1rem;
  font-weight: 700;
}

.text-warning {
  color: #c33;
}

.text-success {
  color: #164b35;
}

.view-link {
  display: block;
  text-align: right;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #164b35;
  font-weight: 500;
  text-decoration: none;
}

.view-link:hover {
  text-decoration: underline;
}

.expiry-section {
  margin-bottom: 1rem;
}

.expiry-subtitle {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
  color: #555;
  font-weight: 600;
}

.expiry-list {
  padding-left: 0;
  list-style: none;
  margin: 0;
}

.expiry-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  margin-bottom: 0.25rem;
  border-radius: 4px;
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.expiry-danger {
  background: #fff0f0;
  border: 1px solid #ecc;
}

.expiry-expired {
  background: #fff5f5;
  border: 1px solid #fdd;
  color: #c33;
}

.expiry-name {
  font-weight: 600;
}

.expiry-detail {
  color: #666;
  font-size: 0.75rem;
}

.expiry-qty {
  color: #888;
  font-size: 0.75rem;
}

.expiry-date {
  color: #c33;
  font-size: 0.75rem;
}

.expiry-empty {
  padding: 1rem;
  text-align: center;
  color: #666;
  font-style: italic;
  border: 1px dashed #ddd;
  border-radius: 4px;
}

.donation-section {
  margin-top: 1rem;
  padding: 0.75rem;
  text-align: center;
}

.donation-link {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #164b35;
  color: #fff;
  border-radius: 4px;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
}

.donation-link:hover {
  background: #103a29;
}

.recipes-section {
  margin-top: 2rem;
}

.recipe-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  height: 100%;
}

.recipe-card-body {
  padding: 1rem;
}

.recipe-name {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.recipe-time {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.recipe-match {
  margin-bottom: 0.5rem;
}

.recipe-match .progress {
  height: 8px;
}

.recipe-meta {
  margin-bottom: 0.5rem;
}

.recipe-card .view-link {
  margin-top: 0;
}

.loading {
  color: #666;
  font-style: italic;
}

.error {
  color: #c00;
  font-weight: 500;
}
</style>