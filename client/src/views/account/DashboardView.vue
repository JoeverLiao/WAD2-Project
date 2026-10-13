<script setup>
import { ref, onMounted } from 'vue'
import { apiRequest } from '../../services/api.js'

import { sampleRecipes } from '../../data/freshnessDemo.js'
import { getDaysRemaining, getExpiryStatus } from '../../utils/expiryUtils.js'
import { matchRecipes } from '../../utils/recipeUtils.js'

const dashboard = ref(null)
const loading = ref(true)
const error = ref('')
const recipes = ref([])

const storageKeys = ['fridge', 'freezer', 'pantry']
const storageLabels = { fridge: 'Dorm Fridge', freezer: 'Home Fridge', pantry: 'Pantry' }

// Flattened list of items sorted for the right-hand scroll list table
const allExpiryItems = ref([])

// ✨ DEFAULT SEED ITEMS FROM SKETCH
const defaultExpiringItems = {
  fridge: [
    { _id: 'mock-1', name: 'Kiwi', expiresAt: new Date(), quantity: 6, unit: '' },
    { _id: 'mock-2', name: 'Apple', expiresAt: new Date(), quantity: 2, unit: '' }
  ],
  freezer: [
    { _id: 'mock-3', name: 'Tofu', expiresAt: new Date(), quantity: 1, unit: '' },
    { _id: 'mock-4', name: 'Fish (salmon)', expiresAt: new Date(), quantity: 1, unit: '' }
  ],
  pantry: []
}

onMounted(async () => {
  try {
    dashboard.value = await apiRequest('/dashboard')
  } catch (e) {
    // Fail silently or log error — we fallback to structural defaults below to maintain view
    error.value = 'Using local offline mock mode'
  } finally {
    // If backend fails completely or has zero breakdown data, initialize a base shell structure
    if (!dashboard.value || !dashboard.value.storageBreakdown) {
      dashboard.value = {
        storageBreakdown: {
          fridge: { count: 8, healthyCount: 6, expiringSoon: defaultExpiringItems.fridge, items: defaultExpiringItems.fridge },
          freezer: { count: 2, healthyCount: 0, expiringSoon: defaultExpiringItems.freezer, items: defaultExpiringItems.freezer },
          pantry: { count: 0, healthyCount: 0, expiringSoon: [], items: [] }
        },
        expiringToday: [],
        expired: []
      }
    }

    const now = new Date()
    const inventory = []
    const expiryAccumulator = []

    for (const type of storageKeys) {
      const unit = dashboard.value.storageBreakdown[type]
      
      // ✨ Inject default items if backend items list for this unit is empty
      if (unit && (!unit.items || unit.items.length === 0) && defaultExpiringItems[type].length > 0) {
        unit.items = [...defaultExpiringItems[type]]
        unit.expiringSoon = [...defaultExpiringItems[type]]
        unit.count = unit.items.reduce((sum, i) => sum + i.quantity, 0)
      }

      if (unit && unit.items) {
        unit.items.forEach((item) => {
          const days = getDaysRemaining(item.expiresAt, now)
          
          inventory.push({
            name: item.name,
            quantity: item.quantity || 1,
            daysRemaining: days,
            status: getExpiryStatus(days),
          })

          expiryAccumulator.push({
            ...item,
            storageLabel: storageLabels[type],
            daysRemaining: days
          })
        })
      }
    }

    // Sort table list items so the urgent items stay on top
    allExpiryItems.value = expiryAccumulator.sort((a, b) => {
      if (a.daysRemaining === null) return 1
      if (b.daysRemaining === null) return -1
      return a.daysRemaining - b.daysRemaining
    })

    if (inventory.length > 0) {
      recipes.value = matchRecipes(sampleRecipes, inventory)
    } else {
      recipes.value = sampleRecipes.map((r) => ({ ...r, matchedIngredients: [], missingIngredients: r.ingredients, matchPercentage: 0 }))
    }
    
    loading.value = false
  }
})
</script>

<template>
  <section aria-label="Dashboard" v-if="!loading" class="dashboard-container container-fluid py-4">
    <p v-if="error" class="alert alert-info py-2 small border-dashed mb-3" role="alert">ℹ️ {{ error }}</p>

    <div v-if="dashboard" class="row main-layout-row">
      
      <!-- ================= LEFT COLUMN ================= -->
      <div class="col-md-7 left-content-pane">
        <h2 class="block-heading mb-3">STORAGE UNITS</h2>
        
        <div class="storage-list d-flex flex-column gap-4 mb-5">
          <div 
            v-for="type in storageKeys.filter(k => dashboard.storageBreakdown[k])" 
            :key="type" 
            class="storage-unit-card border p-3 rounded bg-white shadow-sm"
          >
            <div class="d-flex gap-3">
              <!-- Left: Image Preview Placeholder Block -->
              <div class="preview-box border d-flex align-items-center justify-content-center text-muted fw-bold bg-light">
                PREVIEW
              </div>
              
              <!-- Right: Metadata Summary Block -->
              <div class="flex-grow-1">
                <div class="expiring-soon-section mb-2">
                  <div class="text-secondary small fw-bold">Expiring Soon</div>
                  <div v-if="dashboard.storageBreakdown[type].expiringSoon.length" class="d-flex flex-wrap gap-2 mt-1">
                    <RouterLink 
                      v-for="item in dashboard.storageBreakdown[type].expiringSoon" 
                      :key="item._id"
                      :to="{ name: 'freshness-recipes', query: { search: item.name } }"
                      class="badge bg-danger-subtle text-danger text-decoration-none fw-semibold"
                    >
                      ⚠️ {{ item.name }}
                    </RouterLink>
                  </div>
                  <div v-else class="text-muted small">None 🎉</div>
                </div>

                <div class="healthy-stock-section">
                  <span class="text-secondary small fw-bold">Healthy stock: </span>
                  <span class="fw-bold text-success">
                    {{ type === 'fridge' ? '95%' : type === 'freezer' ? '60%' : '100%' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Card Bottom Anchor Link pointing to Smart Fridge -->
            <div class="mt-3 pt-2 border-top text-end">
              <RouterLink :to="{ name: 'fridge' }" class="text-primary small text-decoration-none fw-semibold">
                storage unit: <span class="text-decoration-underline">{{ storageLabels[type] }}</span> ↳
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Popular Recipes Block -->
        <div class="recipes-block border p-3 rounded bg-white shadow-sm">
          <h2 class="block-heading border-bottom pb-2 mb-3">POPULAR RECIPES</h2>
          <ul class="list-group list-group-flush recipe-custom-list">
            <li 
              v-for="recipe in recipes.slice(0, 3)" 
              :key="recipe.id" 
              class="list-group-item d-flex justify-content-between align-items-center bg-transparent px-0 py-2.5"
            >
              <div class="recipe-meta-text">
                <span class="bullet-dot me-2">•</span>
                <strong class="recipe-item-name">{{ recipe.name }}</strong> 
                <span class="text-muted small ms-1">(made by 5.2K)</span>
              </div>
              <RouterLink :to="{ name: 'freshness-recipes', query: { id: recipe.id } }" class="btn btn-sm btn-outline-secondary p-1 px-2">
                ↗
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>

      <!-- ================= RIGHT COLUMN ================= -->
      <div class="col-md-5 right-content-pane border-start d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="block-heading m-0">EXPIRY LIST</h2>
          <span class="fs-4">★</span>
        </div>

        <!-- Table Display View Wrapper Block -->
        <div class="expiry-table-scroll-wrapper border rounded bg-white flex-grow-1 shadow-sm mb-4">
          <table class="table table-hover table-striped mb-0 custom-expiry-table">
            <thead class="table-dark sticky-top">
              <tr>
                <th scope="col">Item</th>
                <th scope="col">SU</th>
                <th scope="col">Qty</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in allExpiryItems" :key="item._id">
                <td class="fw-semibold">{{ item.name }}</td>
                <td class="text-muted">{{ item.storageLabel }}</td>
                <td><span class="badge bg-secondary-subtle text-secondary-emphasis">{{ item.quantity }}</span></td>
              </tr>
              <tr v-if="!allExpiryItems.length">
                <td colspan="3" class="text-center py-4 text-muted">No tracker history items loaded.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Donation Router Callout Banner Area Container -->
        <div class="donation-callout border border-primary border-dashed rounded p-3 text-center bg-light shadow-sm">
          <h4 class="h6 fw-bold text-primary mb-1">Want to Donate?</h4>
          <RouterLink :to="{ name: 'food-rescue' }" class="btn btn-sm btn-primary mt-1 px-3 fw-semibold">
            Neighbor Food Rescue ↳
          </RouterLink>
        </div>
      </div>

    </div>
  </section>
</template>

<style scoped>
.block-heading {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 800;
  letter-spacing: 0.05em;
  font-size: 1.25rem;
}

.preview-box {
  width: 110px;
  height: 110px;
  flex-shrink: 0;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.expiry-table-scroll-wrapper {
  max-height: 480px;
  overflow-y: auto;
}

.custom-expiry-table th, 
.custom-expiry-table td {
  padding: 12px 16px;
  vertical-align: middle;
}

.recipe-custom-list .list-group-item {
  border-bottom: 1px dashed #dee2e6;
}
.recipe-custom-list .list-group-item:last-child {
  border-bottom: none;
}
.bullet-dot {
  font-weight: bold;
  font-size: 1.2rem;
}
</style>
