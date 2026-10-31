// ============================================================
// INVENTORY STORE
//
// Shared by the Smart Fridge and the Dashboard so both pages
// show the same food items and storage area names.
//
// Items are loaded from the backend (GET /api/inventory) for
// the signed-in user. No sample data is held here.
// ============================================================

import { ref } from 'vue'
import { defineStore } from 'pinia'

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
        storageZone: 'freezer-main'
    },
    {
        id: 'fridge',
        title: 'Main Fridge',
        subtitle: 'Refrigerated food',
        icon: '🧊',
        description: 'Dairy, leftovers and other refrigerated foods.',
        temperature: 'Keep at 4°C or below',
        storage: 'fridge',
        storageZone: null
    },
    {
        id: 'crisper',
        title: 'Crisper Drawer',
        subtitle: 'Fruits and vegetables',
        icon: '🥬',
        description: 'Produce suitable for refrigerator storage.',
        temperature: 'Follow food-specific storage guidance',
        storage: 'fridge',
        storageZone: 'crisper'
    },
    {
        id: 'pantry',
        title: 'Pantry',
        subtitle: 'Dry and shelf-stable food',
        icon: '🥫',
        description: 'Rice, pasta, cereal and other suitable dry goods.',
        temperature: 'Cool and dry',
        storage: 'pantry',
        storageZone: 'dry-storage'
    }
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

export const useInventoryStore = defineStore('inventory', () => {
    // --------------------------------------------------------
    // 2. INVENTORY FROM THE BACKEND
    //
    // Loaded from GET /api/inventory, the same endpoint the
    // Smart Fridge page uses, so the Dashboard only ever shows
    // the signed-in user's real items. Starts empty.
    // --------------------------------------------------------

    const items = ref([])
    const loading = ref(false)
    const error = ref('')

    async function loadInventory() {
        loading.value = true
        error.value = ''

        try {
            const response = await fetch('/api/inventory', {
                method: 'GET',
                credentials: 'include'
            })

            if (!response.ok) {
                throw new Error(`Could not load inventory (HTTP ${response.status}).`)
            }

            const data = await response.json()
            const apiItems = Array.isArray(data) ? data : (data.items || [])
            items.value = apiItems.map(normaliseItem)
        } catch (err) {
            console.error('Failed to load inventory:', err)
            items.value = []
            error.value = 'Unable to load your inventory. Check that you are logged in and the backend is running, then retry.'
        } finally {
            loading.value = false
        }
    }

    return { items, loading, error, loadInventory }
})

// Same shape conversion as the Smart Fridge page: MongoDB _id -> id,
// ISO dates -> YYYY-MM-DD, and a default zone for older records.
function normaliseItem(apiItem) {
    return {
        ...apiItem,
        id: String(apiItem._id || apiItem.id),
        expiresAt: apiItem.expiresAt ? String(apiItem.expiresAt).slice(0, 10) : '',
        storageZone: apiItem.storage === 'pantry' || apiItem.storage === 'freezer'
            ? defaultZoneFor(apiItem.storage) : apiItem.storageZone || 'middle-shelf'
    }
}

function defaultZoneFor(storage) {
    if (storage === 'freezer') return 'freezer-main'
    if (storage === 'pantry') return 'dry-storage'
    return 'middle-shelf'
}
