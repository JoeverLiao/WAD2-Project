// ============================================================
// INVENTORY STORE
//
// Shared by the Smart Fridge and the Dashboard so both pages
// show the same food items and storage area names.
//
// IMPORTANT:
// This still uses temporary sample data held in memory.
// It does not save items to MongoDB or the backend yet.
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
    // 2. SAMPLE INVENTORY
    //
    // Each item has:
    // id          - a temporary unique identifier
    // name        - food name
    // quantity    - amount of food
    // unit        - how the amount is measured
    // storage     - main location: fridge, freezer or pantry
    // storageZone - specific compartment within that location
    // expiresAt   - expiry date in YYYY-MM-DD format
    // --------------------------------------------------------

    const items = ref([
    {
        id: 1,
        name: 'Fresh Milk',
        quantity: 1,
        unit: 'carton',
        storage: 'fridge',
        storageZone: 'middle-shelf',
        expiresAt: '2026-10-15'
    },
    {
        id: 2,
        name: 'Eggs',
        quantity: 10,
        unit: 'pieces',
        storage: 'fridge',
        storageZone: 'middle-shelf',
        expiresAt: '2026-10-20'
    },
    {
        id: 3,
        name: 'Leftover Pasta',
        quantity: 1,
        unit: 'container',
        storage: 'fridge',
        storageZone: 'upper-shelf',
        expiresAt: '2026-10-14'
    },
    {
        id: 4,
        name: 'Chicken Breast',
        quantity: 2,
        unit: 'pieces',
        storage: 'fridge',
        storageZone: 'lower-shelf',
        expiresAt: '2026-10-13'
    },
    {
        id: 5,
        name: 'Tomato Sauce',
        quantity: 1,
        unit: 'bottle',
        storage: 'fridge',
        storageZone: 'door',
        expiresAt: '2026-11-10'
    },
    {
        id: 6,
        name: 'Carrots',
        quantity: 5,
        unit: 'pieces',
        storage: 'fridge',
        storageZone: 'crisper',
        expiresAt: '2026-10-18'
    },
    {
        id: 7,
        name: 'Broccoli',
        quantity: 2,
        unit: 'pieces',
        storage: 'fridge',
        storageZone: 'crisper',
        expiresAt: '2026-10-17'
    },
    {
        id: 8,
        name: 'Frozen Peas',
        quantity: 1,
        unit: 'bag',
        storage: 'freezer',
        storageZone: 'freezer-main',
        expiresAt: '2027-02-01'
    },
    {
        id: 9,
        name: 'Ice Cream',
        quantity: 1,
        unit: 'tub',
        storage: 'freezer',
        storageZone: 'freezer-main',
        expiresAt: '2027-01-15'
    },
    {
        id: 10,
        name: 'Rice',
        quantity: 2,
        unit: 'bags',
        storage: 'pantry',
        storageZone: 'dry-storage',
        expiresAt: '2027-06-01'
    },
    {
        id: 11,
        name: 'Pasta',
        quantity: 3,
        unit: 'packets',
        storage: 'pantry',
        storageZone: 'dry-storage',
        expiresAt: '2027-03-01'
    },
    {
        id: 12,
        name: 'Cereal',
        quantity: 1,
        unit: 'box',
        storage: 'pantry',
        storageZone: 'dry-storage',
        expiresAt: '2027-04-01'
    }
])

    return { items }
})
