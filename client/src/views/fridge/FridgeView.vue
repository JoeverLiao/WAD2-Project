<script setup>
// ============================================================
// SMART FRIDGE - MAIN VIEW (CONNECTED TO MONGODB)
// ============================================================
// This file is the parent component for the Smart Fridge page.
//
// The page still handles the visual layout, search, storage areas,
// recommendations, and drag-and-drop. The important difference is
// that food items now come from the backend instead of hardcoded
// sample data.
//
// The browser talks to the Express API at /api/inventory.
// Express uses MongoDB to load/save the signed-in user's items.
//
// API actions used here:
// GET    /api/inventory      Load the user's inventory
// POST   /api/inventory      Add a new food item
// PATCH  /api/inventory/:id  Edit/move an existing item
// DELETE /api/inventory/:id  Remove an item
//
// `credentials: 'include'` tells fetch to send the login cookie.
// The backend uses that cookie to identify which user's items to use.
// ============================================================

import { ref, computed, onMounted } from 'vue'

// Reusable card for displaying one food item.
import FoodItemCard from '../../components/fridge/FoodItemCard.vue'
import FoodItemForm from '../../components/fridge/FoodItemForm.vue'

// ============================================================
// 1. INVENTORY DATA AND PAGE STATUS
// ============================================================

// Start with an empty list. We will fill it using GET /api/inventory.
// Each MongoDB document has an `_id`; we also create an `id` property
// because the existing FoodItemCard/template uses `item.id`.
const items = ref([])

// These values let the page show progress and useful error messages.
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Convert a date from the API into YYYY-MM-DD for <input type="date">.
// Returning an empty string for a missing date keeps the form happy.
function toDateInputValue(value) {
    if (!value) return ''

    // MongoDB dates often arrive as ISO strings. Taking the first ten
    // characters avoids changing the calendar day due to time zones.
    return String(value).slice(0, 10)
}

// Convert the API's item shape into the shape used by this Vue page.
function normaliseItem(apiItem) {
    return {
        ...apiItem,
        // MongoDB uses _id; our existing Vue template uses id.
        id: String(apiItem._id || apiItem.id),
        // Date inputs need YYYY-MM-DD rather than a full ISO timestamp.
        expiresAt: toDateInputValue(apiItem.expiresAt),
        purchasedAt: toDateInputValue(apiItem.purchasedAt),
        // Keep storageZone available even for older records that lack it.
        storageZone: apiItem.storageZone || defaultZoneFor(apiItem.storage)
    }
}

// Choose a reasonable compartment if an older record has no zone saved.
function defaultZoneFor(storage) {
    if (storage === 'freezer') return 'freezer-main'
    if (storage === 'pantry') return 'dry-storage'
    return 'middle-shelf'
}

// Turn the form's date fields into values that can safely be sent to the API.
// Sending null for an empty date avoids trying to save an empty string as a date.
function prepareItemForApi(formData) {
    return {
        name: formData.name,
        quantity: Number(formData.quantity),
        unit: formData.unit,
        storage: formData.storage,
        storageZone: formData.storageZone || defaultZoneFor(formData.storage),
        expiresAt: formData.expiresAt || null,
        // This form does not currently ask for a purchase date or price.
        // Do not invent values for those optional fields.
    }
}

// ============================================================
// 2. LOAD INVENTORY FROM THE BACKEND
// ============================================================

async function loadInventory() {
    loading.value = true
    errorMessage.value = ''
    successMessage.value = ''

    try {
        // GET asks the backend for the signed-in user's inventory.
        const response = await fetch('/api/inventory', {
            method: 'GET',
            credentials: 'include'
        })

        // A non-2xx response means the request failed.
        if (!response.ok) {
            throw new Error(`Could not load inventory (HTTP ${response.status}).`)
        }

        const data = await response.json()

        // Support either a plain array or an object containing `items`.
        // This makes the page tolerant of either common API response shape.
        const apiItems = Array.isArray(data) ? data : (data.items || [])

        // Convert MongoDB records to the shape expected by the template.
        items.value = apiItems.map(normaliseItem)
    } catch (error) {
        console.error('Failed to load inventory:', error)
        errorMessage.value = 'Unable to load your inventory. Check that you are logged in and the backend is running, then retry.'
    } finally {
        // `finally` runs whether the request succeeds or fails.
        loading.value = false
    }
}

// Automatically load inventory when this page first appears.
onMounted(loadInventory)

// ============================================================
// 3. STORAGE AREA DEFINITIONS
// ============================================================

// These objects describe the four visual areas on the page.
// The database still uses only three main storage values:
// fridge, freezer and pantry. `storageZone` identifies a compartment.
const storageAreas = [
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

// ============================================================
// 4. SEARCH AND STORAGE FILTERING
// ============================================================

// v-model connects this value to the search input in the template.
const searchQuery = ref('')

// `computed` updates this list automatically when the inventory or
// search text changes. An empty query matches every item.
const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    return items.value.filter(item => {
        return item.name.toLowerCase().includes(query)
    })
})

// ============================================================
// 4. GET ITEMS FOR EACH STORAGE AREA
// ============================================================

// Return only the filtered items belonging to a particular area.
function getItemsForArea(area) {
    return filteredItems.value.filter(item => {
        if (item.storage !== area.storage) return false

        // Main Fridge contains all fridge items except the crisper.
        if (area.id === 'fridge') {
            return item.storageZone !== 'crisper'
        }

        // Other areas match their exact compartment.
        return item.storageZone === area.storageZone
    })
}

// Count items by main storage location for the summary cards.
function countItems(storage) {
    return items.value.filter(item => item.storage === storage).length
}

// Smoothly jump from a summary card to its matching storage compartment.
function scrollToCompartment(areaId) {
    const target = document.getElementById(`storage-area-${areaId}`)

    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
}

// Let keyboard users activate summary cards with Enter or Space too.
function handleSummaryCardKeydown(event, areaId) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        scrollToCompartment(areaId)
    }
}

// Vue updates this number whenever the inventory changes.
const totalItems = computed(() => items.value.length)

// ============================================================
// 5. ADD / EDIT FORM STATE
// ============================================================

// `formVisible` controls whether the modal form is displayed.
// `editingItem` is null when adding, and contains an item when editing.
const formVisible = ref(false)
const editingItem = ref(null)
const defaultStorage = ref('fridge')
// Remember the exact area where the user clicked Add Food. For example,
// this is 'crisper' when they open the form from the Crisper Drawer.
const defaultStorageZone = ref('middle-shelf')

function openAddForm(storage = 'fridge', storageZone = null) {
    // Null tells FoodItemForm to start a new item rather than edit one.
    editingItem.value = null
    defaultStorage.value = storage

    // Use the selected area when it supplies a zone. If not, choose a
    // sensible default based on the main storage location.
    defaultStorageZone.value = storageZone || defaultZoneFor(storage)
    formVisible.value = true
}

function openEditForm(item) {
    // Pass the selected item to the form so it can pre-fill the fields.
    editingItem.value = item
    defaultStorage.value = item.storage
    // Editing should preserve the item's current compartment.
    defaultStorageZone.value = item.storageZone || defaultZoneFor(item.storage)
    formVisible.value = true
}

function closeForm() {
    formVisible.value = false
    editingItem.value = null
}

// ============================================================
// 6. ADD OR EDIT AN ITEM (POST / PATCH)
// ============================================================

async function saveItem(formData) {
    // Avoid duplicate submissions if the user clicks Save repeatedly.
    if (saving.value) return

    saving.value = true
    errorMessage.value = ''
    successMessage.value = ''

    const isEditing = Boolean(editingItem.value)
    const itemId = editingItem.value?.id
    const payload = prepareItemForApi(formData)

    try {
        // Editing uses PATCH; adding uses POST.
        const url = isEditing
            ? `/api/inventory/${encodeURIComponent(itemId)}`
            : '/api/inventory'

        const response = await fetch(url, {
            method: isEditing ? 'PATCH' : 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            // Include the HTTP status to make debugging easier.
            throw new Error(`Could not save item (HTTP ${response.status}).`)
        }

        const responseData = await response.json()
        // Support either a direct item response or { item: ... }.
        const savedApiItem = responseData.item || responseData
        const savedItem = normaliseItem(savedApiItem)

        if (isEditing) {
            // Replace the old version with the version returned by MongoDB.
            const index = items.value.findIndex(item => item.id === String(itemId))
            if (index !== -1) items.value.splice(index, 1, savedItem)
        } else {
            // Show a newly created item at the top of the inventory.
            items.value.unshift(savedItem)
        }

        closeForm()
        successMessage.value = isEditing ? 'Food item updated successfully.' : 'Food item added successfully.'
    } catch (error) {
        console.error('Failed to save inventory item:', error)
        errorMessage.value = 'Unable to save this food item. Please check the backend and try again.'
    } finally {
        saving.value = false
    }
}

// ============================================================
// 7. REMOVE AN ITEM (DELETE)
// ============================================================

async function removeItem(item) {
    // Ask before deleting, so a click does not immediately remove food.
    const confirmed = window.confirm(`Are you sure you want to remove ${item.name}?`)
    if (!confirmed) return

    errorMessage.value = ''
    successMessage.value = ''

    try {
        const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
            method: 'DELETE',
            credentials: 'include'
        })

        if (!response.ok) {
            throw new Error(`Could not remove item (HTTP ${response.status}).`)
        }

        // Only update the screen after the backend confirms deletion.
        items.value = items.value.filter(existingItem => existingItem.id !== item.id)
        successMessage.value = `${item.name} removed from your inventory.`
    } catch (error) {
        console.error('Failed to remove inventory item:', error)
        errorMessage.value = `Unable to remove ${item.name}. Please try again.`
    }
}

// ============================================================
// CONSUME OR DISCARD FOOD
// ============================================================

// Consume or discard some or all of an item's quantity.
// Partial changes use PATCH; removing the entire item uses DELETE.
async function changeFoodQuantity(item, action) {
    const actionLabel = action === 'consume' ? 'consume' : 'discard'

    const input = window.prompt(
        `How many ${item.unit} of ${item.name} would you like to ${actionLabel}?\n` +
        `Current quantity: ${item.quantity}`,
        String(item.quantity)
    )

    // Cancel was clicked.
    if (input === null) return

    const amount = Number(input)

    // Validate the quantity.
    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > item.quantity
    ) {
        window.alert(
            `Please enter a quantity greater than 0 and no more than ${item.quantity}.`
        )
        return
    }

    const remainingQuantity = Number(item.quantity) - amount

    // Confirm before discarding food.
    if (action === 'discard') {
        const confirmed = window.confirm(
            remainingQuantity === 0
                ? `Discard all ${item.name}? This will remove it from your inventory.`
                : `Discard ${amount} ${item.unit} of ${item.name}? ${remainingQuantity} will remain.`
        )

        if (!confirmed) return
    }

    errorMessage.value = ''
    successMessage.value = ''

    try {
        let response

        if (remainingQuantity === 0) {
            // No quantity remains, so remove the item from active inventory.
            response = await fetch(
                `/api/inventory/${encodeURIComponent(item.id)}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            )
        } else {
            // Keep the item but update its remaining quantity in MongoDB.
            response = await fetch(
                `/api/inventory/${encodeURIComponent(item.id)}`,
                {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quantity: remainingQuantity
                    })
                }
            )
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))

            throw new Error(
                errorData.error ||
                `Could not ${actionLabel} food (HTTP ${response.status}).`
            )
        }

        if (remainingQuantity === 0) {
            items.value = items.value.filter(
                existingItem => existingItem.id !== item.id
            )
        } else {
            const index = items.value.findIndex(
                existingItem => existingItem.id === item.id
            )

            if (index !== -1) {
                items.value[index] = {
                    ...items.value[index],
                    quantity: remainingQuantity
                }
            }
        }

        successMessage.value =
            remainingQuantity === 0
                ? `${item.name} ${action === 'consume' ? 'consumed' : 'discarded'} completely.`
                : `${amount} ${item.unit} of ${item.name} ${action === 'consume' ? 'consumed' : 'discarded'}. ${remainingQuantity} remain.`

    } catch (error) {
        console.error(`Failed to ${actionLabel} food:`, error)
        errorMessage.value = error.message ||
            `Unable to ${actionLabel} ${item.name}. Please try again.`
    }
}

function consumeItem(item) {
    return changeFoodQuantity(item, 'consume')
}

function discardItem(item) {
    return changeFoodQuantity(item, 'discard')
}


    

// ============================================================
// 8. DRAG AND DROP (PATCH)
// ============================================================

// This remembers the ID while an item is being dragged.
// MongoDB IDs are strings, not numbers, so do not convert them to Number.
const draggedItemId = ref(null)

function startDrag(item) {
    draggedItemId.value = item.id
}

function finishDrag() {
    draggedItemId.value = null
}

async function dropOnArea(area, event) {
    // The card may put its ID into the browser's drag data.
    // Fall back to draggedItemId if the browser data is empty.
    const transferredId = event.dataTransfer?.getData('text/plain')
    const itemId = transferredId || draggedItemId.value

    if (!itemId) return

    const item = items.value.find(food => food.id === String(itemId))
    if (!item) return

    // Decide the exact main storage and compartment for the destination.
    const newStorage = area.storage
    let newStorageZone

    if (newStorage === 'fridge') {
        // Dropping onto the main fridge area (not a shelf) uses middle shelf.
        newStorageZone = area.storageZone || 'middle-shelf'
    } else if (newStorage === 'freezer') {
        newStorageZone = 'freezer-main'
    } else {
        newStorageZone = 'dry-storage'
    }

    // Do not make a network request if the item is already in that location.
    if (item.storage === newStorage && item.storageZone === newStorageZone) {
        draggedItemId.value = null
        return
    }

    errorMessage.value = ''
    successMessage.value = ''

    try {
        // Persist the move first. The backend controller must allow
        // `storageZone` in its PATCH allowed-fields list.
        const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                storage: newStorage,
                storageZone: newStorageZone
            })
        })

        if (!response.ok) {
            throw new Error(`Could not move item (HTTP ${response.status}).`)
        }

        const responseData = await response.json()
        const movedApiItem = responseData.item || responseData
        const movedItem = normaliseItem(movedApiItem)

        // Replace the local item with the backend's saved version.
        const index = items.value.findIndex(food => food.id === item.id)
        if (index !== -1) items.value.splice(index, 1, movedItem)
    } catch (error) {
        console.error('Failed to move inventory item:', error)
        errorMessage.value = `Unable to move ${item.name}. Please try again.`
        // Reload to ensure the screen matches what is saved in the database.
        await loadInventory()
    } finally {
        draggedItemId.value = null
    }
}

// ============================================================
// 9. SIMPLE STORAGE RECOMMENDATIONS
// ============================================================

// These are basic keyword suggestions for the prototype, not a
// complete food-safety system. Packaging instructions should take priority.
function getRecommendation(item) {
    const name = item.name.toLowerCase()

    if (name.includes('frozen') || name.includes('ice cream')) {
        if (item.storage !== 'freezer') {
            return 'Consider whether this product needs freezer storage.'
        }
    }

    if (
        name.includes('rice') ||
        name.includes('pasta') ||
        name.includes('cereal') ||
        name.includes('flour')
    ) {
        if (item.storage !== 'pantry') {
            return 'Check the packaging to see whether pantry storage is suitable.'
        }
    }

    return ''
}
</script>

<template>
    <main class="smart-fridge-page">

        <!-- API status messages: loading, errors, and successful changes. -->
        <p v-if="loading" class="status-message" role="status">
            Loading your saved inventory from MongoDB...
        </p>

        <div v-if="errorMessage" class="status-message error-message" role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadInventory">Retry loading inventory</button>
        </div>

        <p v-if="successMessage" class="status-message success-message" role="status">
            {{ successMessage }}
        </p>

        <!-- ==================================================
             PAGE HEADER
             ================================================== -->

        <header class="page-header">
            <div>
                <p class="eyebrow">FULL CIRCLE · INVENTORY MANAGEMENT</p>

                <h1>Interactive Smart Fridge</h1>

                <p class="page-description">
                    Organise your food, manage storage and reduce waste.
                </p>
            </div>

            <!-- Open the form to add a new food item. -->
            <button
                type="button"
                class="primary-button"
                @click="openAddForm()"
            >
                <span>＋</span>
                Add Food
            </button>
        </header>

        <!-- ==================================================
             INVENTORY SUMMARY
             ================================================== -->

        <section class="summary-grid">

            <article
                class="summary-card summary-card-clickable"
                role="button"
                tabindex="0"
                aria-label="Jump to Main Fridge compartment"
                @click="scrollToCompartment('fridge')"
                @keydown="handleSummaryCardKeydown($event, 'fridge')"
            >
                <span class="summary-icon">🧊</span>

                <div>
                    <p>Main Fridge</p>
                    <strong>{{ countItems('fridge') }}</strong>
                    <small>Items, including crisper</small>
                </div>
            </article>

            <article
                class="summary-card summary-card-clickable"
                role="button"
                tabindex="0"
                aria-label="Jump to Freezer compartment"
                @click="scrollToCompartment('freezer')"
                @keydown="handleSummaryCardKeydown($event, 'freezer')"
            >
                <span class="summary-icon">❄️</span>

                <div>
                    <p>Freezer</p>
                    <strong>{{ countItems('freezer') }}</strong>
                    <small>Items</small>
                </div>
            </article>

            <article
                class="summary-card summary-card-clickable"
                role="button"
                tabindex="0"
                aria-label="Jump to Pantry compartment"
                @click="scrollToCompartment('pantry')"
                @keydown="handleSummaryCardKeydown($event, 'pantry')"
            >
                <span class="summary-icon">🥫</span>

                <div>
                    <p>Pantry</p>
                    <strong>{{ countItems('pantry') }}</strong>
                    <small>Items</small>
                </div>
            </article>

            <article class="summary-card">
                <span class="summary-icon">📦</span>

                <div>
                    <p>Total Inventory</p>
                    <strong>{{ totalItems }}</strong>
                    <small>Tracked items</small>
                </div>
            </article>

        </section>

        <!-- ==================================================
             SEARCH
             ================================================== -->

        <section class="search-section">
            <label for="inventory-search">
                Search your inventory
            </label>

            <input
                id="inventory-search"
                v-model="searchQuery"
                type="search"
                placeholder="Search for milk, rice, carrots..."
            >
        </section>

        <!-- ==================================================
             FOUR VISUAL STORAGE AREAS
             ================================================== -->

        <section class="storage-section">

            <div class="section-heading">
                <div>
                    <h2>Your Food Storage</h2>

                    <p>
                        Drag an item into another area to change its
                        storage location.
                    </p>
                </div>
            </div>

            <!--
                The grid displays the four storage areas.

                Each area receives its matching food items.
                A drop event updates the item's storage.
            -->
            <div class="storage-grid">

                <section
                    v-for="area in storageAreas"
                    :key="area.id"
                    :id="`storage-area-${area.id}`"
                    class="storage-area"
                    :class="`area-${area.id}`"
                    @dragover.prevent
                    @drop="dropOnArea(area, $event)"
                >

                    <!-- Storage area heading -->
                    <header class="area-header">
                        <div class="area-icon">
                            {{ area.icon }}
                        </div>

                        <div>
                            <h3>{{ area.title }}</h3>
                            <p>{{ area.subtitle }}</p>
                        </div>
                    </header>

                    <!--
                        Display a brief storage description and
                        temperature guidance.
                    -->
                    <div class="area-information">
                        <p>{{ area.description }}</p>

                        <span>{{ area.temperature }}</span>
                    </div>

                    <!--
                        Main Fridge has visual shelves.
                        Other storage areas use simpler item grids.
                    -->
                    <div
                        v-if="area.id === 'fridge'"
                        class="fridge-shelves"
                    >

                        <!-- Upper shelf -->
                        <section
                            class="fridge-shelf"
                            @dragover.prevent
                            @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'upper-shelf' }, $event)"
                        >
                            <h4>Upper Shelf</h4>

                            <div class="item-grid">
                                <FoodItemCard
                                    v-for="item in getItemsForArea(area).filter(
                                        item => item.storageZone === 'upper-shelf'
                                    )"
                                    :key="item.id"
                                    :item="item"
                                    @edit="openEditForm"
                                    @remove="removeItem"
                                    @consume="consumeItem"
                                    @discard="discardItem"
                                    @drag-start="startDrag"
                                    @drag-end="finishDrag"
                                />
                            </div>

                            <p
                                v-if="getItemsForArea(area).filter(
                                    item => item.storageZone === 'upper-shelf'
                                ).length === 0"
                                class="empty-message"
                            >
                                No food on this shelf.
                            </p>
                        </section>

                        <!-- Middle shelf -->
                        <section
                            class="fridge-shelf"
                            @dragover.prevent
                            @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'middle-shelf' }, $event)"
                        >
                            <h4>Middle Shelf</h4>

                            <div class="item-grid">
                                <FoodItemCard
                                    v-for="item in getItemsForArea(area).filter(
                                        item => item.storageZone === 'middle-shelf'
                                    )"
                                    :key="item.id"
                                    :item="item"
                                    @edit="openEditForm"
                                    @remove="removeItem"
                                    @consume="consumeItem"
                                    @discard="discardItem"
                                    @drag-start="startDrag"
                                    @drag-end="finishDrag"
                                />
                            </div>

                            <p
                                v-if="getItemsForArea(area).filter(
                                    item => item.storageZone === 'middle-shelf'
                                ).length === 0"
                                class="empty-message"
                            >
                                No food on this shelf.
                            </p>
                        </section>

                       <!-- Lower shelf -->
                        <section
                            class="fridge-shelf"
                            @dragover.prevent
                            @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'lower-shelf' }, $event)"
                        >
                            <h4>Lower Shelf</h4>

                            <div class="item-grid">
                                <FoodItemCard
                                    v-for="item in getItemsForArea(area).filter(
                                        item => item.storageZone === 'lower-shelf'
                                    )"
                                    :key="item.id"
                                    :item="item"
                                    @edit="openEditForm"
                                    @remove="removeItem"
                                    @consume="consumeItem"
                                    @discard="discardItem"
                                    @drag-start="startDrag"
                                    @drag-end="finishDrag"
                                />
                            </div>

                            <p
                                v-if="getItemsForArea(area).filter(
                                    item => item.storageZone === 'lower-shelf'
                                ).length === 0"
                                class="empty-message"
                            >
                                No food on this shelf.
                            </p>
                        </section>

                        <!-- Door shelves -->
                        <section
                            class="fridge-shelf"
                            @dragover.prevent
                            @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)"
                        >
                            <h4>Door Shelves</h4>

                            <div class="item-grid">
                                <FoodItemCard
                                    v-for="item in getItemsForArea(area).filter(
                                        item => item.storageZone === 'door'
                                    )"
                                    :key="item.id"
                                    :item="item"
                                    @edit="openEditForm"
                                    @remove="removeItem"
                                    @consume="consumeItem"
                                    @discard="discardItem"
                                    @drag-start="startDrag"
                                    @drag-end="finishDrag"
                                />
                            </div>

                            <p
                                v-if="getItemsForArea(area).filter(
                                    item => item.storageZone === 'door'
                                ).length === 0"
                                class="empty-message"
                            >
                                No food on the door shelves.
                            </p>
                        </section>

                    </div>

                    <!--
                        Freezer, Crisper and Pantry use a simpler
                        grid of cards.

                        The Crisper is visually separate but uses
                        storage='fridge' in the data model.
                    -->
                    <div v-else class="item-grid">
                        <FoodItemCard
                            v-for="item in getItemsForArea(area)"
                            :key="item.id"
                            :item="item"
                            @edit="openEditForm"
                            @remove="removeItem"
                            @consume="consumeItem"
                            @discard="discardItem"
                            @drag-start="startDrag"
                            @drag-end="finishDrag"
                        />
                    </div>

                    <!--
                        If a search produces no results, tell the
                        user rather than leaving a blank panel.
                    -->
                    <p
                        v-if="getItemsForArea(area).length === 0"
                        class="area-empty-message"
                    >
                        No matching food items.
                    </p>

                    <!-- Add food directly to the selected area. -->
                    <button
                        type="button"
                        class="area-add-button"
                        @click="openAddForm(area.storage, area.storageZone)"
                    >
                        ＋ Add Food
                    </button>

                </section>

            </div>
        </section>

        <!-- ==================================================
             STORAGE RECOMMENDATIONS
             ================================================== -->

        <section class="recommendation-section">
            <h2>Storage Guidance</h2>

            <p>
                Some foods may need a different storage location.
                Check product packaging and food-specific guidance.
            </p>

            <div class="recommendation-list">
                <article
                    v-for="item in filteredItems.filter(
                        item => getRecommendation(item)
                    )"
                    :key="item.id"
                    class="recommendation-card"
                >
                    <span>💡</span>

                    <div>
                        <strong>{{ item.name }}</strong>
                        <p>{{ getRecommendation(item) }}</p>
                    </div>
                </article>

                <p
                    v-if="filteredItems.filter(
                        item => getRecommendation(item)
                    ).length === 0"
                    class="no-recommendations"
                >
                    No basic storage suggestions for the current search.
                </p>
            </div>
        </section>

        <!-- ==================================================
             ADD / EDIT FORM
             ================================================== -->

        <!--
            This component receives the selected item and
            emits the form data when the user saves.
        -->
        <FoodItemForm
            :visible="formVisible"
            :item="editingItem"
            :default-storage="defaultStorage"
            :default-storage-zone="defaultStorageZone"
            @save="saveItem"
            @close="closeForm"
        />

        <!-- Footer -->
        <footer class="page-footer">
            <p>Full Circle · Interactive Smart Fridge</p>

            <p>
                Your inventory is loaded from and saved to the backend.
            </p>
        </footer>

    </main>
</template>


<style scoped>
/* ============================================================
   FULL CIRCLE — PLAYFUL SMART FRIDGE THEME
   Keeps the existing HTML and functionality intact.
   ============================================================ */

.smart-fridge-page {
    --primary: #0fa89c;
    --primary-dark: #087d73;
    --text: #123f3b;
    --muted: #557b77;
    --border: #9bcac5;
    --paper: #fdfaf3;
    --paper-bright: #fbfffd;
    --yellow: #ffdd69;
    --yellow-sticky: #fff9df;
    --coral: #ff9587;
    --lime: #dff09c;
    --ink: #123f3b;
    --shadow-paper: 5px 6px 0 var(--ink);
    --shadow-small: 3px 4px 0 var(--ink);

    max-width: 1500px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px;

    background-color: var(--paper);
    background-image:
        radial-gradient(rgba(15, 168, 156, 0.09) 1px, transparent 1px);
    background-size: 14px 14px;

    color: var(--text);
    font-family: var(--font-sans, "Patrick Hand", cursive, sans-serif);
}

.smart-fridge-page * {
    box-sizing: border-box;
}

/* HEADER */

.page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 28px;
}

.eyebrow {
    margin: 0 0 8px;
    color: var(--primary-dark);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.4px;
}

.page-header h1 {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display, "Kalam", cursive, sans-serif);
    font-size: clamp(28px, 3vw, 40px);
    font-weight: 800;
    letter-spacing: -0.5px;
}

.page-description {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
}

/* BUTTONS */

.primary-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;

    border: 2px solid var(--ink);
    border-radius: 10px;
    background: var(--primary);
    color: white;
    box-shadow: var(--shadow-small);

    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;

    transition: transform 0.18s ease, box-shadow 0.18s ease,
        background 0.18s ease;
}

.primary-button:hover {
    background: var(--primary-dark);
    transform: translate(-2px, -2px);
    box-shadow: 5px 6px 0 var(--ink);
}

.primary-button:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 2px 0 var(--ink);
}

.primary-button span {
    font-size: 20px;
}

/* SUMMARY CARDS */

.summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 30px;
}

.summary-card {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    padding: 19px;

    border: 2px solid var(--ink);
    border-radius: 12px;
    background: var(--paper-bright);
    box-shadow: var(--shadow-small);

    transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.summary-card:nth-child(1) {
    background: #e0f7f1;
}

.summary-card:nth-child(2) {
    background: #e8f5ff;
}

.summary-card:nth-child(3) {
    background: #eff7d9;
}

.summary-card:nth-child(4) {
    background: #fff1d7;
}

.summary-card:hover {
    transform: translateY(-3px);
    box-shadow: 3px 7px 0 var(--ink);
}

/* Summary cards for real compartments act as jump links. */
.summary-card-clickable {
    cursor: pointer;
}

.summary-card-clickable:focus-visible {
    outline: 3px solid var(--primary-dark);
    outline-offset: 4px;
}

/* Leave breathing room when scrolling a compartment into view. */
.storage-area {
    scroll-margin-top: 24px;
}

.summary-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    width: 45px;
    height: 45px;
    border: 2px solid var(--ink);
    border-radius: 10px;

    background: var(--paper-bright);
    font-size: 23px;
}

.summary-card p {
    margin: 0 0 5px;
    color: var(--muted);
    font-size: 12px;
}

.summary-card strong {
    display: block;
    color: var(--ink);
    font-size: 27px;
}

.summary-card small {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 10px;
}

/* SEARCH */

.search-section {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 30px;
}

.search-section label {
    flex-shrink: 0;
    color: var(--ink);
    font-size: 14px;
    font-weight: 700;
}

.search-section input {
    width: 100%;
    max-width: 430px;
    padding: 11px 13px;

    border: 2px solid var(--border);
    border-radius: 9px;
    outline: none;

    background: var(--paper-bright);
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;

    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-section input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(15, 168, 156, 0.15);
}

/* SECTION HEADINGS */

.section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.section-heading h2,
.recommendation-section h2 {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display, "Kalam", cursive, sans-serif);
    font-size: 25px;
    font-weight: 800;
}

.section-heading p,
.recommendation-section > p {
    margin: 7px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
}

/* STORAGE AREAS */

.storage-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 20px;
}

.storage-area {
    min-width: 0;
    padding: 20px;

    border: 2px solid var(--ink);
    border-radius: 14px;

    background: var(--paper-bright);
    box-shadow: var(--shadow-paper);

    transition: border-color 0.2s ease, background 0.2s ease,
        box-shadow 0.2s ease, transform 0.2s ease;
}

.storage-area.area-freezer {
    background: #eaf7ff;
    border-color: #285e78;
}

.storage-area.area-fridge {
    background: #f0fbf5;
}

.storage-area.area-crisper {
    background: #eff8dc;
    border-color: #48633b;
}

.storage-area.area-pantry {
    background: #fff3dc;
    border-color: #76552e;
}

/* Clear drag-and-drop feedback without relying on :has(). */
.storage-area:has(.food-card:hover) {
    border-color: var(--primary);
}

/* STORAGE AREA HEADERS */

.area-header {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-bottom: 16px;
}

.area-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    width: 48px;
    height: 48px;
    border: 2px solid var(--ink);
    border-radius: 11px;

    background: var(--paper-bright);
    box-shadow: 2px 3px 0 rgba(18, 63, 59, 0.15);
    font-size: 25px;
}

.area-header h3 {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display, "Kalam", cursive, sans-serif);
    font-size: 21px;
    font-weight: 800;
}

.area-header p {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
}

/* STORAGE INFORMATION */

.area-information {
    margin-bottom: 15px;
    padding: 11px 12px;

    border: 1px dashed var(--border);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.65);
}

.area-information p {
    margin: 0 0 7px;
    color: #526b61;
    font-size: 12px;
    line-height: 1.5;
}

.area-information span {
    color: var(--primary-dark);
    font-size: 11px;
    font-weight: 700;
}

/* MAIN FRIDGE SHELVES */

.fridge-shelves {
    display: flex;
    flex-direction: column;
    gap: 13px;
}

.fridge-shelf {
    min-width: 0;
    padding: 13px;

    border: 2px solid #9bcac5;
    border-radius: 10px;

    background: rgba(255, 255, 255, 0.75);
    box-shadow: 0 3px 0 rgba(18, 63, 59, 0.08);

    transition: border-color 0.2s ease, background 0.2s ease;
}

.fridge-shelf:hover {
    border-color: var(--primary);
    background: var(--paper-bright);
}

.fridge-shelf h4 {
    margin: 0 0 11px;
    padding-bottom: 8px;
    border-bottom: 2px solid #c4e2dc;

    color: var(--ink);
    font-family: var(--font-display, "Kalam", cursive, sans-serif);
    font-size: 15px;
    font-weight: 800;
}

/* FOOD CARD GRID */

.item-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 12px;
    min-width: 0;
}

/* EMPTY STATES */

.empty-message,
.area-empty-message {
    margin: 10px 0;
    padding: 16px 8px;

    color: var(--muted);
    font-size: 12px;
    text-align: center;
    line-height: 1.6;
}

.area-empty-message {
    margin-top: 15px;
}

/* ADD FOOD BUTTONS */

.area-add-button {
    width: 100%;
    margin-top: 16px;
    padding: 11px;

    border: 2px dashed #78b8aa;
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.7);
    color: var(--primary-dark);

    font-family: inherit;
    font-size: 13px;
    font-weight: 700;

    cursor: pointer;
    transition: transform 0.18s ease, background 0.18s ease,
        border-color 0.18s ease;
}

.area-add-button:hover {
    border-color: var(--ink);
    background: #dff7ed;
    transform: translateY(-2px);
}

.area-add-button:active {
    transform: translateY(1px);
}

/* STORAGE RECOMMENDATIONS */

.recommendation-section {
    margin-top: 32px;
    padding: 24px;

    border: 2px solid var(--ink);
    border-radius: 13px;

    background: var(--paper-bright);
    box-shadow: var(--shadow-paper);
}

.recommendation-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 18px;
}

.recommendation-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;

    padding: 14px;
    border: 2px solid #d7b96c;
    border-radius: 10px;

    background: var(--yellow-sticky);
}

.recommendation-card > span {
    font-size: 22px;
}

.recommendation-card strong {
    color: #614d27;
    font-size: 13px;
}

.recommendation-card p {
    margin: 5px 0 0;
    color: #816d48;
    font-size: 12px;
    line-height: 1.5;
}

.no-recommendations {
    color: var(--muted);
    font-size: 12px;
}

/* API STATUS MESSAGES */

.status-message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0 0 16px;
    padding: 12px 14px;

    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--paper-bright);

    font-size: 13px;
}

.error-message {
    border-color: #bd554b;
    background: #fff0ed;
    color: #8d2525;
}

.error-message button {
    padding: 7px 10px;
    border: 2px solid #8d2525;
    border-radius: 7px;
    background: white;
    color: #8d2525;
    cursor: pointer;
}

.success-message {
    border-color: #7cae66;
    background: #eff9df;
    color: #285b30;
}

/* FOOTER */

.page-footer {
    display: flex;
    justify-content: space-between;
    gap: 15px;

    margin-top: 25px;
    padding: 10px 0;

    color: var(--muted);
    font-size: 11px;
}

.page-footer p {
    margin: 0;
}

/* KEYBOARD ACCESSIBILITY */

.primary-button:focus-visible,
.area-add-button:focus-visible,
.search-section input:focus-visible,
.error-message button:focus-visible {
    outline: 3px solid #f0b93d;
    outline-offset: 3px;
}

/* REDUCED MOTION */

@media (prefers-reduced-motion: reduce) {
    .smart-fridge-page *,
    .smart-fridge-page *::before,
    .smart-fridge-page *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
    }
}

/* MEDIUM SCREENS */

@media (max-width: 1000px) {
    .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .storage-grid {
        grid-template-columns: 1fr;
    }
}

/* MOBILE */

@media (max-width: 600px) {
    .smart-fridge-page {
        padding: 18px 12px;
    }

    .page-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .primary-button {
        width: 100%;
    }

    .search-section {
        align-items: flex-start;
        flex-direction: column;
        gap: 8px;
    }

    .search-section input {
        max-width: none;
    }

    .storage-area {
        padding: 13px;
    }

    .item-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .page-footer {
        flex-direction: column;
    }
}

/* VERY NARROW SCREENS */

@media (max-width: 380px) {
    .summary-card {
        align-items: flex-start;
        flex-direction: column;
    }

    .item-grid {
        grid-template-columns: 1fr;
    }
}
</style>

