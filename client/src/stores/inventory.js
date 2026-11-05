// ============================================================
// INVENTORY STORE
//
// Shared by the Smart Fridge and the Dashboard so both pages
// show the same food items and storage area names.
//
// Items are loaded from the backend (GET /api/inventory) for
// the signed-in user. No sample data is held here.
// ============================================================

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchInventory } from '../services/inventory.js'
import { useAuthStore } from './auth.js'

// ------------------------------------------------------------
// 1. STORAGE AREA DEFINITIONS
//
// Notice that Crisper uses storage='fridge'.
// This preserves the existing shared model's three storage
// values while allowing a more specific zone.
// ------------------------------------------------------------

export const storageAreas = [
  {
    id: 'freezer',
    title: 'Freezer',
    subtitle: 'Frozen food and long-term storage',
    icon: '❄️',
    description: 'Frozen vegetables, meat and frozen meals.',
    temperature: 'Typically -18°C or below',
    storage: 'freezer',
    storageZone: 'freezer-main',
  },
  {
    id: 'fridge',
    title: 'Main Fridge',
    subtitle: 'Refrigerated food',
    icon: '🧊',
    description: 'Dairy, leftovers and other refrigerated foods.',
    temperature: 'Keep at 4°C or below',
    storage: 'fridge',
    storageZone: null,
  },
  {
    id: 'crisper',
    title: 'Crisper Drawer',
    subtitle: 'Fruits and vegetables',
    icon: '🥬',
    description: 'Produce suitable for refrigerator storage.',
    temperature: 'Follow food-specific storage guidance',
    storage: 'fridge',
    storageZone: 'crisper',
  },
  {
    id: 'pantry',
    title: 'Pantry',
    subtitle: 'Dry and shelf-stable food',
    icon: '🥫',
    description: 'Rice, pasta, cereal and other suitable dry goods.',
    temperature: 'Cool and dry',
    storage: 'pantry',
    storageZone: 'dry-storage',
  },
]

// Does an item belong in a particular visual area?
//
// Main Fridge:
//   storage = fridge, excluding the crisper.
//
// Crisper:
//   storage = fridge AND storageZone = crisper.
//
// Freezer and Pantry:
//   Match their corresponding storage values.
export function isInArea(item, area) {
  if (item.storage !== area.storage) return false
  if (area.id === 'fridge') return item.storageZone !== 'crisper'
  return item.storageZone === area.storageZone
}

// One inventory owner for the dashboard and full fridge page.
export const useInventoryStore = defineStore('inventory', () => {
  const items = ref([])
  const loading = ref(false)
  const error = ref('')
  let pendingLoad
  let generation = 0

  function resetInventory() {
    generation++
    pendingLoad = null
    items.value = []
    error.value = ''
    loading.value = false
  }

  const auth = useAuthStore()
  watch(() => auth.user?._id || auth.user?.id || auth.user?.email || null, resetInventory, {
    flush: 'sync',
  })

  function loadInventory() {
    if (pendingLoad) return pendingLoad
    loading.value = true
    error.value = ''
    const current = generation
    const request = fetchInventory()
      .then((loaded) => {
        if (current === generation) items.value = loaded
      })
      .catch((cause) => {
        if (current === generation)
          error.value = cause.message || 'Unable to load your inventory. Please try again.'
      })
      .finally(() => {
        if (pendingLoad === request) {
          loading.value = false
          pendingLoad = null
        }
      })
    pendingLoad = request
    return pendingLoad
  }

  return { items, loading, error, loadInventory, resetInventory }
})
