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
const expiredCount = computed(() => items.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days < 0
}).length)
const expiringSoonCount = computed(() => items.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days >= 0 && days <= 3
}).length)

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
async function changeFoodQuantity(item, action, onAnimationSuccess) {
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
        // Start the animation only after the backend update succeeds.
        if (typeof onAnimationSuccess === 'function') {
            onAnimationSuccess({
                amount,
                originalQuantity: Number(item.quantity),
                remainingQuantity,
                proportion: amount / Number(item.quantity)
            })
        }

    } catch (error) {
        console.error(`Failed to ${actionLabel} food:`, error)
        errorMessage.value = error.message ||
            `Unable to ${actionLabel} ${item.name}. Please try again.`
    }
}

function consumeItem(item, onAnimationSuccess) {
    return changeFoodQuantity(item, 'consume', onAnimationSuccess)
}

function discardItem(item, onAnimationSuccess) {
    return changeFoodQuantity(item, 'discard', onAnimationSuccess)
}


    

// ============================================================
// 8. DRAG AND DROP (PATCH)
// ============================================================

// This remembers the ID while an item is being dragged.
// MongoDB IDs are strings, not numbers, so do not convert them to Number.
const draggedItemId = ref(null)
const draggingFromModal = ref(false)
// True only after the pointer has actually moved outside the inventory popup.
const draggingOutsideModal = ref(false)

function startDrag(item) {
    draggedItemId.value = item.id
    draggingFromModal.value = false
    draggingOutsideModal.value = false
}

function startModalDrag(item) {
    // Starting a drag must NOT hide the popup. It stays visible until the pointer
    // actually leaves the popup's bounds.
    draggedItemId.value = item.id
    draggingFromModal.value = true
    draggingOutsideModal.value = false
}

function updateModalDragVisibility(event) {
    if (!draggingFromModal.value || !draggedItemId.value) return
    // This is a one-way transition for the duration of a drag: once the cursor
    // leaves the popup, keep it hidden even if the cursor later passes back over
    // the popup's original position. finishDrag() restores it after drop/cancel.
    if (draggingOutsideModal.value) return

    const modal = event.currentTarget.querySelector('.inventory-modal')
    if (!modal) return
    const rect = modal.getBoundingClientRect()
    const pointerInsideModal = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom

    if (!pointerInsideModal) draggingOutsideModal.value = true
}

function finishDrag() {
    draggedItemId.value = null
    draggingFromModal.value = false
    draggingOutsideModal.value = false
}

// While dragging, move the carousel when the pointer reaches either edge
// of the storage stage. This lets users drag from a compartment modal toward
// the pantry (right edge) or back to the fridge (left edge).
function handleStageDragOver(event) {
    if (!draggedItemId.value) return

    // Use the browser-window edges, not the stage's inner edges. This makes
    // the carousel switch predictably when a held item is dragged toward the
    // left side of the screen (fridge) or right side (pantry).
    const edgeWidth = Math.min(140, window.innerWidth * 0.14)
    const nearLeftEdge = event.clientX <= edgeWidth
    const nearRightEdge = event.clientX >= window.innerWidth - edgeWidth

    if (nearRightEdge && activeStorageUnit.value !== 'pantry') {
        activeStorageUnit.value = 'pantry'
        fridgeDoorOpen.value = false
        selectedCompartment.value = null
    } else if (nearLeftEdge && activeStorageUnit.value !== 'fridge') {
        // When the user drags from the pantry toward the fridge, open the door
        // automatically so the individual compartments are available as drop targets.
        activeStorageUnit.value = 'fridge'
        fridgeDoorOpen.value = true
        selectedCompartment.value = null
    }
}

// When dragging from the full-inventory popup, the backdrop visually covers the
// fridge and pantry. Native drag events therefore land on the backdrop instead
// of the shelf underneath. Inspect the elements below the pointer and forward
// the drop to the storage target that is physically underneath it.
function dropFromModalBackdrop(event) {
    event.preventDefault()

    // Ignore drops that land inside the popup itself (including Consume/Discard).
    const backdrop = event.currentTarget
    const modal = backdrop.querySelector('.inventory-modal')
    if (modal) {
        const rect = modal.getBoundingClientRect()
        const pointerIsInsideModal = event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom
        if (pointerIsInsideModal) return
    }

    // Temporarily take the overlay out of hit-testing so we can discover the
    // actual compartment underneath the cursor. It is restored immediately.
    const previousVisibility = backdrop.style.visibility
    backdrop.style.visibility = 'hidden'
    const elementBelowPointer = document.elementFromPoint(event.clientX, event.clientY)
    backdrop.style.visibility = previousVisibility

    const target = elementBelowPointer?.closest('[data-drop-storage]')
    if (!target) {
        // No valid destination: leave the inventory unchanged. dragend restores
        // the popup, and the item remains in its original compartment.
        return
    }

    const storage = target.dataset.dropStorage
    const storageZone = target.dataset.dropZone || null
    if (!storage) return

    // Close the popup only after a valid storage destination has been found.
    selectedCompartment.value = null
    dropOnArea({ storage, storageZone }, event)
}

async function dropOnArea(area, event) {
    event.preventDefault()
    // The card may put its ID into the browser's drag data.
    // Fall back to draggedItemId if the browser data is empty.
    const transferredId = event.dataTransfer?.getData('text/plain')
    const itemId = transferredId || draggedItemId.value

    if (!itemId) return

    const item = items.value.find(food => food.id === String(itemId))
    if (!item) return

    // If the drag began in the inventory modal, let the drop pass through to the stage.
    if (draggingFromModal.value) selectedCompartment.value = null

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

// ============================================================
// 10. CAROUSEL, COMPARTMENT DETAILS, EXPIRY PANEL AND ACTION ZONES
// ============================================================

// 0 = refrigerator, 1 = pantry. The carousel changes which unit is in front.
const activeStorageUnit = ref('fridge')
const fridgeDoorOpen = ref(false)
const selectedCompartment = ref(null)
const expiryPanelOpen = ref(false)
const expiryFilter = ref('all')
const actionDropTarget = ref('')

function rotateStorage(direction) {
    activeStorageUnit.value = direction === 'right'
        ? (activeStorageUnit.value === 'fridge' ? 'pantry' : 'fridge')
        : (activeStorageUnit.value === 'pantry' ? 'fridge' : 'pantry')
    selectedCompartment.value = null
    fridgeDoorOpen.value = false
}

function openCompartment(compartment) {
    selectedCompartment.value = compartment
}

function closeCompartment() {
    selectedCompartment.value = null
}

function itemsForCompartment(compartment) {
    const list = items.value.filter(item => {
        if (compartment.storage === 'fridge') {
            return item.storage === 'fridge' && item.storageZone === compartment.zone
        }
        if (compartment.storage === 'freezer') {
            return item.storage === 'freezer'
        }
        return item.storage === 'pantry'
    })

    return list.sort((a, b) => {
        const aDate = a.expiresAt ? new Date(`${a.expiresAt}T00:00:00`).getTime() : Infinity
        const bDate = b.expiresAt ? new Date(`${b.expiresAt}T00:00:00`).getTime() : Infinity
        return aDate - bDate
    })
}

function previewItems(compartment, limit = 3) {
    return itemsForCompartment(compartment).slice(0, limit)
}

function itemCount(compartment) {
    return itemsForCompartment(compartment).length
}


function foodEmojiFor(name = '') {
    const value = String(name).toLowerCase()
    if (value.includes('milk')) return '🥛'
    if (value.includes('egg')) return '🥚'
    if (value.includes('carrot')) return '🥕'
    if (value.includes('broccoli')) return '🥦'
    if (value.includes('chicken')) return '🍗'
    if (value.includes('fish') || value.includes('salmon')) return '🐟'
    if (value.includes('rice')) return '🍚'
    if (value.includes('pasta') || value.includes('noodle')) return '🍝'
    if (value.includes('bread')) return '🍞'
    if (value.includes('cheese')) return '🧀'
    if (value.includes('ice cream')) return '🍦'
    if (value.includes('apple')) return '🍎'
    if (value.includes('banana')) return '🍌'
    if (value.includes('orange')) return '🍊'
    if (value.includes('tomato')) return '🍅'
    if (value.includes('potato')) return '🥔'
    if (value.includes('meat') || value.includes('beef')) return '🥩'
    if (value.includes('juice')) return '🧃'
    if (value.includes('sauce')) return '🫙'
    if (value.includes('cereal')) return '🥣'
    return '🍱'
}

function expiryDays(item) {
    if (!item.expiresAt) return null
    const expiry = new Date(`${item.expiresAt}T00:00:00`)
    if (Number.isNaN(expiry.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((expiry.getTime() - today.getTime()) / 86400000)
}

const expiryItems = computed(() => {
    return items.value
        .filter(item => {
            const days = expiryDays(item)
            if (days === null) return false
            if (expiryFilter.value === 'expired') return days < 0
            if (expiryFilter.value === 'soon') return days >= 0 && days <= 3
            return days <= 3
        })
        .sort((a, b) => expiryDays(a) - expiryDays(b))
})

const expiryItemCount = computed(() => expiryItems.value.length)

function expiryLabel(item) {
    const days = expiryDays(item)
    if (days === null) return 'No expiry date'
    if (days < 0) return `Expired ${Math.abs(days)} day(s) ago`
    if (days === 0) return 'Expires today'
    if (days === 1) return 'Expires tomorrow'
    return `Expires in ${days} days`
}

function locationLabel(item) {
    if (item.storage === 'pantry') return 'Pantry'
    if (item.storage === 'freezer') return 'Freezer'
    const names = {
        'upper-shelf': 'Upper shelf',
        'middle-shelf': 'Middle shelf',
        'lower-shelf': 'Lower shelf',
        door: 'Door shelves',
        crisper: 'Crisper drawer'
    }
    return names[item.storageZone] || 'Main fridge'
}

function jumpToItem(item) {
    expiryPanelOpen.value = false
    if (item.storage === 'pantry') {
        activeStorageUnit.value = 'pantry'
        fridgeDoorOpen.value = false
    } else {
        activeStorageUnit.value = 'fridge'
        fridgeDoorOpen.value = true
        selectedCompartment.value = item.storage === 'freezer'
            ? { id: 'freezer', title: 'Freezer', storage: 'freezer', zone: 'freezer-main' }
            : {
                id: item.storageZone,
                title: locationLabel(item),
                storage: 'fridge',
                zone: item.storageZone
            }
    }
}

function dropOnAction(action, event) {
    event.preventDefault()
    const transferredId = event.dataTransfer?.getData('text/plain')
    const itemId = transferredId || draggedItemId.value
    if (!itemId) return
    const item = items.value.find(food => food.id === String(itemId))
    if (!item) return
    if (draggingFromModal.value) selectedCompartment.value = null
    actionDropTarget.value = ''
    if (action === 'consume') consumeItem(item)
    else discardItem(item)
}

function onActionDragEnter(action) {
    actionDropTarget.value = action
}

function onActionDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        actionDropTarget.value = ''
    }
}

</script>

<template>
    <main class="smart-fridge-page">
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

        <header class="page-header">
            <div>
                <p class="eyebrow">FULL CIRCLE · INVENTORY MANAGEMENT</p>
                <h1>My Smart Kitchen</h1>
                <p class="page-description">Rotate between your fridge and pantry. Keep food visible, fresh and organised.</p>
            </div>
            <div class="header-actions">
                <button type="button" class="expiry-button" @click="expiryPanelOpen = true">
                    ⚠️ Expiring &amp; Expired <span class="expiry-count">{{ expiryItemCount }}</span>
                </button>
                <button type="button" class="primary-button" @click="openAddForm(activeStorageUnit === 'pantry' ? 'pantry' : 'fridge')">
                    ＋ Add Food
                </button>
            </div>
        </header>

        <section class="toolbar">
            <label for="inventory-search">🔎</label>
            <input id="inventory-search" v-model="searchQuery" type="search" placeholder="Search milk, rice, carrots...">
            <div class="inventory-total"><span>📦</span> {{ totalItems }} tracked items</div>
        </section>

        <section class="kitchen-stage" :class="`storage-${activeStorageUnit}`" aria-label="Rotating food storage" @dragover.prevent="handleStageDragOver($event)">
            <button class="carousel-arrow arrow-left" type="button" aria-label="Rotate to previous storage unit" @click="rotateStorage('left')">
                <span>‹</span><small>FRIDGE</small>
            </button>

            <div class="carousel-window">
                <div class="carousel-track" :class="`show-${activeStorageUnit}`">
                    <!-- Refrigerator unit -->
                    <section class="storage-unit fridge-unit" :class="{ 'unit-current': activeStorageUnit === 'fridge' }" aria-label="Refrigerator">
                        <div class="unit-top-label"><span>❄️</span> FRESH &amp; CHILLED</div>
                        <div class="fridge-body">
                            <div class="fridge-cabinet">
                                <div class="fridge-interior">
                                    <div class="interior-header">
                                        <span>YOUR FRIDGE</span>
                                        <span class="temperature">❄ 4°C</span>
                                    </div>
                                    <div class="fridge-compartments">
                                        <button type="button" class="compartment freezer-compartment" data-drop-storage="freezer" data-drop-zone="freezer-main" @click="openCompartment({ id: 'freezer', title: 'Freezer', storage: 'freezer', zone: 'freezer-main' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'freezer', storageZone: 'freezer-main' }, $event)">
                                            <span class="compartment-heading">❄️ Freezer <small>{{ countItems('freezer') }} items</small></span>
                                            <span class="food-preview">
                                                <span v-for="item in items.filter(i => i.storage === 'freezer').sort((a,b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999')).slice(0,3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                <span v-if="countItems('freezer') > 3" class="more-food">+{{ countItems('freezer') - 3 }}</span>
                                                <span v-if="countItems('freezer') === 0" class="empty-mini">Empty</span>
                                            </span>
                                        </button>

                                        <button v-for="compartment in [
                                            { id: 'upper-shelf', title: 'Upper shelf', storage: 'fridge', zone: 'upper-shelf', icon: '🥣' },
                                            { id: 'middle-shelf', title: 'Middle shelf', storage: 'fridge', zone: 'middle-shelf', icon: '🥛' },
                                            { id: 'lower-shelf', title: 'Lower shelf', storage: 'fridge', zone: 'lower-shelf', icon: '🍱' }
                                        ]" :key="compartment.id" type="button" class="compartment shelf-compartment" :data-drop-storage="compartment.storage" :data-drop-zone="compartment.zone" @click="openCompartment(compartment)" @dragover.prevent @drop.stop="dropOnArea({ storage: compartment.storage, storageZone: compartment.zone }, $event)">
                                            <span class="compartment-heading"><span>{{ compartment.icon }} {{ compartment.title }}</span><small>{{ itemCount(compartment) }} items</small></span>
                                            <span class="food-preview">
                                                <span v-for="item in previewItems(compartment, 3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                <span v-if="itemCount(compartment) > 3" class="more-food">+{{ itemCount(compartment) - 3 }}</span>
                                                <span v-if="itemCount(compartment) === 0" class="empty-mini">Empty</span>
                                            </span>
                                        </button>

                                        <div class="fridge-bottom">
                                            <button type="button" class="compartment crisper-compartment" data-drop-storage="fridge" data-drop-zone="crisper" @click="openCompartment({ id: 'crisper', title: 'Crisper drawer', storage: 'fridge', zone: 'crisper', icon: '🥬' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'crisper' }, $event)">
                                                <span class="compartment-heading">🥬 Crisper drawer <small>{{ items.filter(i => i.storage === 'fridge' && i.storageZone === 'crisper').length }} items</small></span>
                                                <span class="food-preview">
                                                    <span v-for="item in items.filter(i => i.storage === 'fridge' && i.storageZone === 'crisper').sort((a,b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999')).slice(0,3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                    <span v-if="items.filter(i => i.storage === 'fridge' && i.storageZone === 'crisper').length > 3" class="more-food">+{{ items.filter(i => i.storage === 'fridge' && i.storageZone === 'crisper').length - 3 }}</span>
                                                    <span v-if="items.filter(i => i.storage === 'fridge' && i.storageZone === 'crisper').length === 0" class="empty-mini">Empty</span>
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="fridge-door" :class="{ 'door-open': fridgeDoorOpen }" role="button" tabindex="0" :aria-label="fridgeDoorOpen ? 'Close refrigerator door' : 'Open refrigerator door'" @click="fridgeDoorOpen = !fridgeDoorOpen" @keydown.enter.prevent="fridgeDoorOpen = !fridgeDoorOpen" @keydown.space.prevent="fridgeDoorOpen = !fridgeDoorOpen">
                                    <span class="door-brand">FULL CIRCLE</span>
                                    <span v-if="!fridgeDoorOpen" class="closed-fridge-dashboard" aria-label="Fridge inventory summary">
                                        <span class="dashboard-title">FRIDGE STATUS</span>
                                        <span class="dashboard-stat"><strong>{{ totalItems }}</strong><small>Total tracked</small></span>
                                        <span class="dashboard-stat"><strong>{{ countItems('fridge') + countItems('freezer') }}</strong><small>Fridge &amp; freezer</small></span>
                                        <span class="dashboard-stat dashboard-expired"><strong>{{ expiredCount }}</strong><small>Expired</small></span>
                                        <span class="dashboard-stat dashboard-soon"><strong>{{ expiringSoonCount }}</strong><small>Expiring soon</small></span>
                                    </span>
                                    <span class="door-handle"></span>
                                    <span class="door-hint">{{ fridgeDoorOpen ? 'DOOR OPEN' : 'OPEN FRIDGE' }}</span>
                                    <span class="door-inner">
                                        <span class="door-inner-title">DOOR SHELVES · CLICK TO VIEW</span>
                                        <span class="door-bin" data-drop-storage="fridge" data-drop-zone="door" role="button" tabindex="0" title="View all food stored in the fridge door" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)" @click.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.enter.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.space.prevent.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })">
                                            <span v-for="item in items.filter(i => i.storage === 'fridge' && i.storageZone === 'door').sort((a,b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999')).slice(0,3)" :key="item.id" class="door-food" :title="item.name">{{ foodEmojiFor(item.name) }}</span>
                                            <span v-if="items.filter(i => i.storage === 'fridge' && i.storageZone === 'door').length === 0" class="door-empty">Empty shelf</span>
                                        </span>
                                        <span class="door-bin door-bin-small" data-drop-storage="fridge" data-drop-zone="door" role="button" tabindex="0" title="View all food stored in the fridge door" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)" @click.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.enter.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.space.prevent.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })">
                                            <span v-for="item in items.filter(i => i.storage === 'fridge' && i.storageZone === 'door').sort((a,b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999')).slice(3,6)" :key="item.id" class="door-food" :title="item.name">{{ foodEmojiFor(item.name) }}</span>
                                            <span v-if="items.filter(i => i.storage === 'fridge' && i.storageZone === 'door').length <= 3" class="door-empty">{{ items.filter(i => i.storage === 'fridge' && i.storageZone === 'door').length === 0 ? 'Empty shelf' : 'Tap to view door items' }}</span>
                                        </span>
                                        <span v-if="fridgeDoorOpen" class="fridge-close-button" role="button" tabindex="0" aria-label="Close refrigerator door" @click.stop="fridgeDoorOpen = false" @keydown.enter.stop="fridgeDoorOpen = false" @keydown.space.prevent.stop="fridgeDoorOpen = false">✕ Close door</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p class="unit-caption">Click the door to {{ fridgeDoorOpen ? 'close' : 'open' }} · Select a compartment to view everything</p>
                    </section>

                    <!-- Pantry unit -->
                    <section class="storage-unit pantry-unit" :class="{ 'unit-current': activeStorageUnit === 'pantry' }" aria-label="Pantry">
                        <div class="unit-top-label pantry-label"><span>🥫</span> DRY &amp; SHELF-STABLE</div>
                        <div class="pantry-cabinet pantry-single-storage">
                            <div class="pantry-top"><span>THE PANTRY</span><span>🌾</span></div>
                            <button type="button" class="pantry-shelf pantry-whole-storage" data-drop-storage="pantry" data-drop-zone="dry-storage" @click="openCompartment({ id: 'pantry', title: 'Pantry', storage: 'pantry', zone: 'dry-storage' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'pantry', storageZone: 'dry-storage' }, $event)">
                                <span class="pantry-shelf-label">ALL PANTRY ITEMS · {{ countItems('pantry') }}</span>
                                <span class="pantry-foods pantry-all-foods">
                                    <span v-for="item in items.filter(i => i.storage === 'pantry').sort((a,b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999')).slice(0,12)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                    <span v-if="countItems('pantry') > 12" class="more-food">+{{ countItems('pantry') - 12 }}</span>
                                    <span v-if="countItems('pantry') === 0" class="empty-mini">Drop pantry food here</span>
                                </span>
                                <span class="pantry-storage-hint">Click to view all pantry items</span>
                            </button>
                            <div class="pantry-feet"><span></span><span></span></div>
                        </div>
                        <p class="unit-caption">Click the pantry to view all items</p>
                    </section>
                </div>
            </div>

            <div class="action-zones" aria-label="Food actions">
            <div class="action-zone action-consume"
                :class="{ 'zone-active': actionDropTarget === 'consume' }"
                @dragover.prevent="onActionDragEnter('consume')"
                @dragenter.prevent="onActionDragEnter('consume')"
                @dragleave="onActionDragLeave"
                @drop="dropOnAction('consume', $event)">
                <span class="action-icon">🍽️</span>
                <strong>CONSUME</strong>
                <small>Drop food here</small>
            </div>

            <div class="action-zone action-discard"
                :class="{ 'zone-active': actionDropTarget === 'discard' }"
                @dragover.prevent="onActionDragEnter('discard')"
                @dragenter.prevent="onActionDragEnter('discard')"
                @dragleave="onActionDragLeave"
                @drop="dropOnAction('discard', $event)">
                <span class="action-icon">🗑️</span>
                <strong>DISCARD</strong>
                <small>Drop food here</small>
            </div>

            </div>

            <button class="carousel-arrow arrow-right" type="button" aria-label="Rotate to next storage unit" @click="rotateStorage('right')">
                <span>›</span><small>PANTRY</small>
            </button>
        </section>

        <nav class="carousel-nav" aria-label="Choose storage unit">
            <button type="button" :class="{ selected: activeStorageUnit === 'fridge' }" @click="activeStorageUnit = 'fridge'; fridgeDoorOpen = false; selectedCompartment = null">🧊 Fridge</button>
            <span class="carousel-track-dots"><i :class="{ active: activeStorageUnit === 'fridge' }"></i><i :class="{ active: activeStorageUnit === 'pantry' }"></i></span>
            <button type="button" :class="{ selected: activeStorageUnit === 'pantry' }" @click="activeStorageUnit = 'pantry'; fridgeDoorOpen = false; selectedCompartment = null">🥫 Pantry</button>
        </nav>

        <section class="storage-hint">
            <span>💡</span>
            <p><strong>Tip:</strong> Food closest to its expiry date appears first. Click any shelf or drawer to see its complete inventory, then drag an item to Consume or Discard.</p>
        </section>

        <section class="recommendation-section">
            <h2>Storage Guidance</h2>
            <p>Some foods may need a different storage location. Check product packaging and food-specific guidance.</p>
            <div class="recommendation-list">
                <article v-for="item in filteredItems.filter(item => getRecommendation(item))" :key="item.id" class="recommendation-card">
                    <span>💡</span><div><strong>{{ item.name }}</strong><p>{{ getRecommendation(item) }}</p></div>
                </article>
                <p v-if="filteredItems.filter(item => getRecommendation(item)).length === 0" class="no-recommendations">No basic storage suggestions for the current search.</p>
            </div>
        </section>

        <!-- Full compartment inventory -->
        <div v-if="selectedCompartment" class="modal-backdrop" :class="{ 'dragging-out': draggingOutsideModal }" @click.self="closeCompartment" @keydown.esc="closeCompartment" @dragover.prevent="updateModalDragVisibility($event)" @drop.prevent="dropFromModalBackdrop($event)">
            <section class="inventory-modal" role="dialog" aria-modal="true" :aria-label="selectedCompartment.title">
                <header class="modal-heading">
                    <div><p class="eyebrow">FULL COMPARTMENT</p><h2>{{ selectedCompartment.title }}</h2><p>{{ itemsForCompartment(selectedCompartment).length }} item(s), sorted by expiry date</p></div>
                    <button type="button" class="modal-close" aria-label="Close compartment" @click="closeCompartment">✕</button>
                </header>
                <div class="modal-toolbar">
                    <button type="button" class="primary-button small-button" @click="openAddForm(selectedCompartment.storage, selectedCompartment.zone)">＋ Add to this compartment</button>
                </div>
                <div v-if="itemsForCompartment(selectedCompartment).length" class="modal-food-list">
                    <article v-for="item in itemsForCompartment(selectedCompartment)" :key="item.id" class="modal-food-row" draggable="true" @dragstart="startModalDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">
                        <span class="modal-food-emoji">{{ foodEmojiFor(item.name) }}</span>
                        <div class="modal-food-info"><strong>{{ item.name }}</strong><span>{{ item.quantity }} {{ item.unit }} · {{ expiryLabel(item) }}</span></div>
                        <button type="button" class="icon-button modal-edit-button" title="Edit food" aria-label="Edit food" @click="openEditForm(item)">✏️</button>
                    </article>
                </div>
                <div v-else class="modal-empty"><span>🧺</span><strong>This compartment is empty</strong><p>Add food to see it here.</p></div>
                <div class="modal-action-zones" aria-label="Actions for this compartment">
                    <div class="action-zone action-consume" :class="{ 'zone-active': actionDropTarget === 'consume' }"
                        @dragover.prevent="onActionDragEnter('consume')" @dragenter.prevent="onActionDragEnter('consume')"
                        @dragleave="onActionDragLeave" @drop="dropOnAction('consume', $event)">
                        <span class="action-icon">🍽️</span><strong>CONSUME</strong><small>Drop here</small>
                    </div>
                    <div class="action-zone action-discard" :class="{ 'zone-active': actionDropTarget === 'discard' }"
                        @dragover.prevent="onActionDragEnter('discard')" @dragenter.prevent="onActionDragEnter('discard')"
                        @dragleave="onActionDragLeave" @drop="dropOnAction('discard', $event)">
                        <span class="action-icon">🗑️</span><strong>DISCARD</strong><small>Drop here</small>
                    </div>
                </div>
                <p class="modal-footnote">Drag food to Consume or Discard below, or drag it outside this window onto another fridge compartment or pantry shelf.</p>
            </section>
        </div>

        <!-- Expiry overview across both storage units -->
        <div v-if="expiryPanelOpen" class="modal-backdrop" @click.self="expiryPanelOpen = false">
            <section class="inventory-modal expiry-modal" role="dialog" aria-modal="true" aria-label="Expiring and expired food">
                <header class="modal-heading">
                    <div><p class="eyebrow">REDUCE FOOD WASTE</p><h2>⚠️ Expiring &amp; Expired</h2><p>Across your fridge, freezer and pantry.</p></div>
                    <button type="button" class="modal-close" aria-label="Close expiry panel" @click="expiryPanelOpen = false">✕</button>
                </header>
                <div class="expiry-filters">
                    <button type="button" :class="{ active: expiryFilter === 'all' }" @click="expiryFilter = 'all'">All urgent</button>
                    <button type="button" :class="{ active: expiryFilter === 'expired' }" @click="expiryFilter = 'expired'">Expired</button>
                    <button type="button" :class="{ active: expiryFilter === 'soon' }" @click="expiryFilter = 'soon'">Next 3 days</button>
                </div>
                <div v-if="expiryItems.length" class="modal-food-list">
                    <button v-for="item in expiryItems" :key="item.id" type="button" class="expiry-food-row" @click="jumpToItem(item)">
                        <span class="modal-food-emoji">{{ foodEmojiFor(item.name) }}</span>
                        <span class="modal-food-info"><strong>{{ item.name }}</strong><span>{{ locationLabel(item) }} · {{ item.quantity }} {{ item.unit }}</span></span>
                        <span class="expiry-label" :class="{ 'is-expired': expiryDays(item) < 0 }">{{ expiryLabel(item) }}</span>
                        <span>›</span>
                    </button>
                </div>
                <div v-else class="modal-empty"><span>✨</span><strong>Nothing urgent right now</strong><p>No expired food or items expiring within the next three days.</p></div>
            </section>
        </div>

        <FoodItemForm
            :visible="formVisible"
            :item="editingItem"
            :default-storage="defaultStorage"
            :default-storage-zone="defaultStorageZone"
            @save="saveItem"
            @close="closeForm"
        />

        <footer class="page-footer"><p>Full Circle · Interactive Smart Fridge</p><p>Your inventory is loaded from and saved to the backend.</p></footer>
    </main>
</template>

<style scoped>
.smart-fridge-page {
    --ink: #173d39;
    --muted: #63817a;
    --teal: #0fa89c;
    --teal-dark: #087d73;
    --paper: #fdfaf3;
    --line: #a5c9c0;
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px clamp(14px, 3vw, 36px) 22px;
    color: var(--ink);
    background: var(--paper);
    background-image: radial-gradient(rgba(15,168,156,.08) 1px, transparent 1px);
    background-size: 14px 14px;
    font-family: var(--font-sans, "Patrick Hand", cursive, sans-serif);
}
.smart-fridge-page * { box-sizing: border-box; }
.page-header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:22px; }
.eyebrow { margin:0 0 7px; color:var(--teal-dark); font-size:11px; font-weight:800; letter-spacing:1.4px; }
.page-header h1 { margin:0; font-family:var(--font-display, "Kalam", cursive, sans-serif); font-size:clamp(29px,3vw,42px); line-height:1.15; }
.page-description { margin:9px 0 0; color:var(--muted); font-size:14px; }
.header-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:12px; }
.primary-button,.expiry-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:12px 17px; border:2px solid var(--ink); border-radius:10px; box-shadow:3px 4px 0 var(--ink); font:700 14px inherit; cursor:pointer; transition:transform .18s ease,box-shadow .18s ease; }
.primary-button { background:var(--teal); color:white; font-weight:800; }
.primary-button:hover,.expiry-button:hover { transform:translate(-2px,-2px); box-shadow:5px 6px 0 var(--ink); }
.expiry-button { background:#fff1c9; color:#6b4a10; font-weight:800; }
.expiry-count { display:inline-grid; place-items:center; min-width:24px; height:24px; border-radius:99px; background:#e06e54; color:white; font-size:12px; }
.toolbar { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
.toolbar label { font-size:21px; }
.toolbar input { width:min(440px,100%); padding:11px 14px; border:2px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); font:inherit; }
.inventory-total { margin-left:auto; padding:9px 13px; border:1px dashed var(--line); border-radius:9px; color:var(--muted); font-size:13px; white-space:nowrap; }
.kitchen-stage { display:grid; grid-template-columns:58px minmax(0,620px) 58px; grid-template-rows:minmax(490px,1fr) auto; justify-content:center; align-items:center; gap:10px; min-height:650px; padding:24px 16px 18px; border:2px solid var(--ink); border-radius:20px; background:linear-gradient(180deg,#dceefa 0%,#eef7fb 48%,#d9e9f3 100%); box-shadow:5px 6px 0 var(--ink); overflow:hidden; transition:background .7s ease,border-color .7s ease; }
.kitchen-stage.storage-pantry { background:linear-gradient(145deg,#6f4b32 0%,#8a6242 48%,#4e3528 100%); border-color:#4b3022; box-shadow:5px 6px 0 #3b281e; }
.carousel-arrow { grid-row:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:52px; min-height:82px; border:2px solid var(--ink); border-radius:14px; background:#fffdf5; color:var(--ink); cursor:pointer; box-shadow:2px 3px 0 var(--ink); z-index:3; }
.carousel-arrow span { font-size:38px; line-height:1; }
.carousel-arrow small { font-size:9px; font-weight:800; letter-spacing:.6px; }
.carousel-arrow:hover { background:#dff7ed; transform:translateY(-2px); }
.arrow-left { grid-column:1; grid-row:1; }
.arrow-right { grid-column:3; grid-row:1; }
.carousel-window { grid-column:2; grid-row:1; align-self:center; min-width:0; width:100%; overflow:visible; perspective:1200px; }
.carousel-track { display:flex; width:200%; transform:translateX(0); transition:transform .7s cubic-bezier(.2,.75,.2,1); transform-style:preserve-3d; }
.carousel-track.show-pantry { transform:translateX(-50%); }
.storage-unit { flex:0 0 50%; width:50%; min-width:0; padding:0 12px; opacity:.58; transform:scale(.9) rotateY(7deg); filter:saturate(.72); transition:opacity .55s ease,transform .65s cubic-bezier(.2,.75,.2,1),filter .55s ease; }
.storage-unit.unit-current { opacity:1; transform:scale(1) rotateY(0); filter:none; }
.storage-pantry .unit-top-label,.storage-pantry .unit-caption { color:#f1dfcb; }
.storage-pantry .carousel-arrow { background:#e6d7c5; border-color:#242631; color:#302a2c; }
.unit-top-label { display:flex; align-items:center; justify-content:center; gap:8px; margin:0 auto 12px; color:#4d7770; font-size:10px; font-weight:900; letter-spacing:1.5px; }
.unit-top-label span { font-size:17px; }
.fridge-body { width:min(100%, 430px); margin:0 auto; padding:11px; border:3px solid #53636b; border-radius:18px; background:linear-gradient(135deg,#dce3e7,#aebbc3 45%,#d5dde1 72%,#9eabb3); box-shadow:inset 0 0 0 4px rgba(255,255,255,.55),4px 6px 0 rgba(23,39,48,.22); }
.fridge-cabinet { position:relative; display:block; height:570px; min-height:570px; perspective:1100px; perspective-origin:50% 50%; transform-style:preserve-3d; isolation:isolate; }
.fridge-interior { position:relative; min-width:0; height:100%; min-height:0; padding:12px; border:2px solid #536b76; border-radius:8px; background:linear-gradient(135deg,#d6e9f0,#f0f8fa 45%,#d4e5ec); overflow:hidden; }
.interior-header { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:8px; font-size:10px; font-weight:900; letter-spacing:.6px; }
.temperature { padding:4px 6px; border-radius:6px; background:#fff; color:#337c78; font-size:9px; white-space:nowrap; }
.fridge-compartments { display:flex; flex-direction:column; gap:8px; height:calc(100% - 30px); min-height:0; }
.fridge-compartments > .compartment, .fridge-compartments > .fridge-bottom { flex:1 1 0; min-height:0; }
.shelf-compartment { min-height:0; }

.compartment { display:block; width:100%; min-width:0; padding:7px 8px; border:1px solid #789d94; border-radius:7px; background:rgba(255,255,255,.76); color:var(--ink); text-align:left; cursor:pointer; box-shadow:0 3px 0 rgba(35,81,73,.13); transition:background .18s ease,transform .18s ease,border-color .18s ease; }
/* Keep the freezer visibly icy blue; this rule follows the base compartment style intentionally. */
.fridge-compartments > button.compartment.freezer-compartment, .fridge-compartments > button.compartment.freezer-compartment:hover { flex:.82 1 0!important; background:linear-gradient(145deg,#eaf8ff 0%,#c9eaff 52%,#a9dafa 100%) !important; border:1px solid #68b5e5; box-shadow:inset 0 3px 0 rgba(255,255,255,.95),0 3px 0 rgba(44,116,161,.22); }
.fridge-compartments > button.compartment.freezer-compartment .compartment-heading { color:#155b87; }
.fridge-compartments > button.compartment.freezer-compartment .empty-mini { color:#4f8eaf; }
.compartment:hover,.pantry-shelf:hover { border-color:var(--teal-dark); background:#fff; transform:translateY(-1px); }
.compartment-heading { display:flex; align-items:center; justify-content:space-between; gap:5px; font-size:10px; font-weight:900; }
.compartment-heading small { color:var(--muted); font-size:9px; font-weight:700; white-space:nowrap; }
.food-preview { display:flex; align-items:center; gap:5px; min-height:27px; margin-top:4px; overflow:hidden; }
.mini-food { display:inline-grid; place-items:center; min-width:26px; height:26px; padding:2px; border-radius:7px; background:#f7f4e9; font-size:18px; }
.more-food { display:inline-grid; place-items:center; min-width:29px; height:25px; border:1px dashed #86aaa0; border-radius:7px; color:#426e65; font-size:10px; font-weight:900; }
.empty-mini { color:#78948d; font-size:10px; font-style:italic; }
.fridge-bottom { display:flex; min-height:0; padding-top:2px; }
.fridge-bottom .crisper-compartment { height:100%; flex:1; }
.crisper-compartment, .crisper-compartment:hover, .fridge-compartments > .fridge-bottom > .crisper-compartment:hover { min-height:0; background:linear-gradient(145deg,#e8f4d4 0%,#d8ebba 52%,#c9e0aa 100%) !important; border-color:#9eb783 !important; color:#24452c; box-shadow:inset 0 3px 0 rgba(255,255,255,.65),0 3px 0 rgba(70,105,48,.16) !important; }
.crisper-compartment:hover { transform:translateY(-1px); }
.fridge-door { position:absolute; inset:0; z-index:5; display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:18px; width:100%; min-width:0; height:100%; padding:22px 22px 22px 12px; border:3px solid #78868e; border-radius:12px 17px 17px 12px; background:linear-gradient(100deg,#8e9ba3 0%,#d5dce0 12%,#f1f4f5 34%,#c3cdd2 66%,#e5eaed 86%,#89969e 100%); color:#40515a; cursor:pointer; transform-origin:left center; transform:rotateY(0deg); transform-style:preserve-3d; backface-visibility:visible; transition:transform .8s cubic-bezier(.2,.75,.2,1),box-shadow .8s; box-shadow:inset 7px 0 0 rgba(255,255,255,.65),inset -7px 0 0 rgba(67,83,91,.15),4px 0 0 #75848c; }
.fridge-door.door-open { transform:rotateY(-106deg); box-shadow:8px 8px 16px rgba(17,35,45,.28); }
.closed-fridge-dashboard { position:absolute; left:12%; right:12%; top:8%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; padding:14px; border:1px solid rgba(73,95,104,.3); border-radius:12px; background:rgba(245,250,252,.76); box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 4px 12px rgba(40,59,67,.1); color:#354e58; cursor:default; }
.dashboard-title { grid-column:1/-1; text-align:center; font-size:10px; font-weight:900; letter-spacing:1.5px; color:#536a73; }
.dashboard-stat { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; min-height:50px; padding:7px 4px; border:1px solid rgba(101,132,145,.28); border-radius:8px; background:rgba(255,255,255,.82); }
.dashboard-stat strong { font-size:23px; line-height:1; }
.dashboard-stat small { font-size:9px; font-weight:800; color:#647c85; text-align:center; }
.dashboard-expired strong { color:#c64d42; }
.dashboard-soon strong { color:#c18427; }
.fridge-door.door-open .closed-fridge-dashboard { opacity:0; pointer-events:none; }
.fridge-door .door-brand { align-self:center; margin-right:0; color:#53646d; }
.fridge-door .door-handle { position:absolute; top:28%; right:14px; width:7px; height:42%; background:linear-gradient(90deg,#63737c,#f5f7f8 45%,#788890); }
.fridge-door .door-hint { position:absolute; right:12px; bottom:12px; padding:4px 6px; border-radius:4px; background:rgba(255,255,255,.65); }
 .door-inner { position:absolute; inset:0; display:flex; flex-direction:column; gap:10px; padding:16px 12px 18px; border:3px solid #8499a4; border-radius:12px 17px 17px 12px; background:linear-gradient(100deg,#9eafb8 0%,#e6edf0 16%,#d4e0e5 78%,#8da2ad 100%); color:#304e5a; transform:rotateY(180deg) translateZ(2px); transform-origin:center; backface-visibility:visible; opacity:0; transition:opacity .25s ease .15s; pointer-events:none; }
.fridge-door.door-open .door-inner { opacity:1; pointer-events:auto; }
.fridge-door.door-open .door-brand,.fridge-door.door-open > .door-handle,.fridge-door.door-open > .door-hint { opacity:0; }
.door-inner-title { flex:0 0 auto; min-height:24px; display:flex; align-items:center; font-size:10px; font-weight:900; letter-spacing:1px; }
.door-bin { position:relative; z-index:2; display:flex; flex:1 1 0; align-items:center; align-content:flex-start; flex-wrap:wrap; gap:6px; width:100%; min-height:0; cursor:pointer; pointer-events:auto; padding:10px; border:2px solid #83aebe; border-radius:6px; background:linear-gradient(180deg,#e9f8ff 0%,#c6e7f5 100%); box-shadow:inset 0 2px 0 rgba(255,255,255,.95),0 3px 0 rgba(47,105,129,.2); }
.door-bin-small { flex:1 1 0; min-height:0; justify-content:flex-start; align-content:flex-start; font-size:18px; background:linear-gradient(180deg,#dff3fb 0%,#b8deee 100%); }
.door-bin[role="button"]:focus-visible { outline:3px solid #f0b93d; outline-offset:2px; }
.door-bin[role="button"]:hover { filter:brightness(1.04); border-color:#3985a5; box-shadow:inset 0 2px 0 rgba(255,255,255,.95),0 4px 0 rgba(47,105,129,.24); }
.door-food { display:grid; place-items:center; width:27px; height:27px; border:1px solid rgba(94,157,181,.25); border-radius:5px; background:#f5fcff; font-size:18px; }
.door-empty { font-size:10px; font-style:italic; }
.fridge-close-button { position:absolute; z-index:8; top:auto; bottom:10px; left:12px; right:auto; padding:8px 11px; border:2px solid #4d626b; border-radius:8px; background:#f8fbfc; color:#304750; font-size:11px; font-weight:900; cursor:pointer; box-shadow:2px 3px 0 rgba(30,49,57,.22); }
.fridge-close-button:hover { background:#fff; transform:translateY(-1px); }
/* The close control sits at the bottom edge of the open door. */
.fridge-door.door-open + .fridge-close-button { bottom:10px; left:12px; top:auto; right:auto; }
.door-inner .door-bin, .door-inner .door-bin-small { box-sizing:border-box; }
.door-brand { align-self:center; margin-right:0; color:#53646d; }
.fridge-door .door-handle { position:absolute; top:28%; right:14px; width:7px; height:42%; background:linear-gradient(90deg,#63737c,#f5f7f8 45%,#788890); }
.fridge-door .door-hint { position:absolute; right:12px; bottom:12px; padding:4px 6px; border-radius:4px; background:rgba(255,255,255,.65); }
.door-brand { writing-mode:horizontal-tb; font-size:11px; font-weight:900; letter-spacing:2px; }
.door-handle { display:block; width:5px; height:62px; border-radius:9px; background:linear-gradient(90deg,#6c8b82,#eff6f0,#78978c); box-shadow:1px 1px 2px #56746a; }
.door-hint { font-size:8px; font-weight:900; }
.unit-caption { margin:13px 0 0; color:#587970; font-size:11px; line-height:1.5; text-align:center; }
.pantry-label { color:#84602c; }
.pantry-cabinet { position:relative; display:flex; flex-direction:column; gap:9px; min-height:350px; padding:13px; border:3px solid #674b2d; border-radius:12px; background:linear-gradient(90deg,#b9844d,#e5c79c 14%,#d7b183 86%,#a87543); box-shadow:inset 0 0 0 5px rgba(255,241,213,.35),4px 6px 0 rgba(65,42,20,.2); }
.pantry-top { display:flex; align-items:center; justify-content:space-between; padding:5px 8px 9px; border-bottom:4px solid #8a6339; color:#5d3f21; font-size:12px; font-weight:900; letter-spacing:1px; }
.pantry-top span:last-child { font-size:21px; }
.pantry-shelf { flex:1; display:flex; flex-direction:column; justify-content:center; gap:7px; min-width:0; padding:8px; border:2px solid #a57b4b; border-radius:7px; background:linear-gradient(180deg,#f4dfbb,#e8c99c); color:#654522; text-align:left; cursor:pointer; box-shadow:0 5px 0 #92683b; }
.pantry-shelf-label { font-size:9px; font-weight:900; letter-spacing:1px; }
.pantry-single-storage { gap:9px; }
.pantry-whole-storage { flex:1; min-height:245px; align-items:stretch; justify-content:flex-start; gap:14px; padding:15px; background:linear-gradient(145deg,#f6e5c7,#e8c99c); border:2px solid #a57b4b; box-shadow:inset 0 0 0 3px rgba(255,255,255,.28),0 5px 0 #92683b; }
.pantry-whole-storage .pantry-shelf-label { font-size:10px; }
.pantry-all-foods { display:flex; flex-wrap:wrap; align-content:flex-start; align-items:center; gap:8px; min-height:100px; overflow:visible; }
.pantry-storage-hint { margin-top:auto; color:#8a6339; font-size:10px; font-weight:700; text-align:center; }
.pantry-foods { display:flex; align-items:center; gap:4px; min-height:28px; overflow:hidden; }
.pantry-bottom-shelf { margin-bottom:4px; }
.pantry-feet { display:flex; justify-content:space-between; padding:0 14px; }
.pantry-feet span { width:20px; height:8px; border-radius:0 0 4px 4px; background:#674b2d; }
.action-zones { grid-column:2; grid-row:2; display:flex; justify-content:center; align-items:center; gap:12px; width:100%; min-width:0; position:relative; z-index:6; }
.action-zone { position:relative; z-index:6; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:8px; width:142px; min-width:0; min-height:64px; padding:8px 10px; border:2px dashed #8da9a0; border-radius:13px; background:rgba(255,255,255,.88); color:#55756c; text-align:center; transition:transform .2s ease,background .2s ease,border-color .2s ease; }
.action-consume, .action-discard { margin:0; }
.action-icon { flex-shrink:0; display:grid; place-items:center; width:42px; height:42px; border:2px solid currentColor; border-radius:50%; background:#fff; font-size:27px; }
.action-zone strong { font-size:10px; letter-spacing:.8px; }
.action-zone small { display:none; font-size:9px; line-height:1.35; }
.action-consume { border-color:#5cae8c; color:#287e61; }
.action-discard { border-color:#c6a1a0; color:#93605d; }
.storage-pantry .action-zone { background:rgba(245,237,226,.94); }
.action-consume.zone-active { transform:scale(1.06); background:#d8f8e8; border-style:solid; box-shadow:0 0 0 4px rgba(92,174,140,.18); }
.action-discard.zone-active { transform:scale(1.06); background:#f7e1df; border-style:solid; box-shadow:0 0 0 4px rgba(198,161,160,.2); }
.carousel-nav { display:flex; align-items:center; justify-content:center; gap:18px; margin:22px auto 12px; }
.carousel-nav button { padding:9px 15px; border:2px solid transparent; border-radius:9px; background:transparent; color:var(--muted); font:700 13px inherit; cursor:pointer; }
.carousel-nav button.selected { border-color:var(--ink); background:#fff; color:var(--ink); box-shadow:2px 3px 0 var(--ink); }
.carousel-track-dots { display:flex; gap:6px; }
.carousel-track-dots i { width:7px; height:7px; border-radius:50%; background:#c6d7d0; }
.carousel-track-dots i.active { background:var(--teal-dark); }
.storage-hint { display:flex; align-items:flex-start; gap:10px; max-width:760px; margin:18px auto 30px; padding:12px 15px; border:1px dashed #b4c9a0; border-radius:10px; background:#f1f8e4; color:#526f4b; font-size:12px; line-height:1.6; }
.storage-hint span { font-size:19px; }
.storage-hint p { margin:0; }
.recommendation-section { margin-top:28px; padding:22px; border:2px solid var(--ink); border-radius:13px; background:#fffefa; box-shadow:4px 5px 0 var(--ink); }
.recommendation-section h2 { margin:0; font-family:var(--font-display, "Kalam", cursive, sans-serif); font-size:24px; }
.recommendation-section>p { margin:7px 0 0; color:var(--muted); font-size:13px; line-height:1.6; }
.recommendation-list { display:flex; flex-direction:column; gap:10px; margin-top:16px; }
.recommendation-card { display:flex; gap:12px; padding:13px; border:2px solid #d7b96c; border-radius:10px; background:#fff9df; }
.recommendation-card>span { font-size:22px; }
.recommendation-card strong { font-size:13px; }
.recommendation-card p { margin:5px 0 0; color:#816d48; font-size:12px; line-height:1.5; }
.no-recommendations { color:var(--muted); font-size:12px; }
.status-message { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:0 0 14px; padding:12px 14px; border:2px solid var(--line); border-radius:10px; background:#fff; font-size:13px; }
.error-message { border-color:#bd554b; background:#fff0ed; color:#8d2525; }
.error-message button { padding:7px 10px; border:2px solid #8d2525; border-radius:7px; background:white; color:#8d2525; cursor:pointer; }
.success-message { border-color:#7cae66; background:#eff9df; color:#285b30; }
.modal-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(15,38,34,.56); backdrop-filter:blur(4px); }
/* Once the pointer leaves the popup, keep it hidden AND remove the overlay
   from hit-testing. This lets the actual fridge/pantry compartments receive
   dragover and drop events, even if the pointer passes over the popup's old spot. */
.modal-backdrop.dragging-out { background:transparent; backdrop-filter:none; pointer-events:none; }
.modal-backdrop.dragging-out .inventory-modal { opacity:0; visibility:hidden; pointer-events:none; }
.inventory-modal { width:min(680px,100%); max-height:min(82vh,850px); overflow:auto; padding:22px; border:2px solid var(--ink); border-radius:17px; background:var(--paper); box-shadow:7px 8px 0 rgba(11,36,31,.35); }
.modal-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:17px; }
.modal-heading h2 { margin:0; font-family:var(--font-display, "Kalam", cursive, sans-serif); font-size:26px; }
.modal-heading p:not(.eyebrow) { margin:6px 0 0; color:var(--muted); font-size:12px; }
.modal-close { flex-shrink:0; width:39px; height:39px; border:2px solid var(--ink); border-radius:9px; background:#fff; color:var(--ink); font-size:17px; cursor:pointer; }
.modal-toolbar { display:flex; justify-content:flex-end; margin-bottom:13px; }
.small-button { padding:9px 12px; font-size:12px; }
.modal-food-list { display:flex; flex-direction:column; gap:8px; }
.modal-food-row,.expiry-food-row { display:flex; align-items:center; gap:11px; min-width:0; padding:11px; border:1px solid #c7ddd5; border-radius:10px; background:#fff; }
.modal-food-row { cursor:grab; }
.modal-edit-button { opacity:0; visibility:hidden; transition:opacity .15s ease; }
.modal-food-row:hover .modal-edit-button, .modal-food-row:focus-within .modal-edit-button, .modal-edit-button:focus-visible { opacity:1; visibility:visible; }
.modal-food-emoji { display:grid; place-items:center; flex-shrink:0; width:43px; height:43px; border-radius:10px; background:#f0f7ed; font-size:24px; }
.modal-food-info { display:flex; flex:1; flex-direction:column; gap:4px; min-width:0; }
.modal-food-info strong { overflow-wrap:anywhere; font-size:14px; }
.modal-food-info span { color:var(--muted); font-size:11px; }
.icon-button { flex-shrink:0; width:35px; height:35px; border:1px solid #b9d0c7; border-radius:8px; background:#fff; cursor:pointer; }
.modal-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:35px 12px; color:var(--muted); text-align:center; }
.modal-empty>span { font-size:36px; }
.modal-empty strong { color:var(--ink); font-size:15px; }
.modal-empty p { margin:0; font-size:12px; }

.modal-action-zones { display:flex; justify-content:center; gap:12px; margin:14px 0 8px; }
.modal-action-zones .action-zone { flex:0 1 190px; min-height:72px; padding:9px 12px; }
.modal-action-zones .action-zone .action-icon { font-size:22px; }

.modal-footnote { margin:15px 0 0; color:var(--muted); font-size:11px; text-align:center; }
.expiry-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; }
.expiry-filters button { padding:8px 12px; border:1px solid #c4d9d0; border-radius:8px; background:#fff; color:var(--ink); font:700 12px inherit; cursor:pointer; }
.expiry-filters button.active { border-color:var(--ink); background:#fff0c8; }
.expiry-food-row { width:100%; text-align:left; cursor:pointer; }
.expiry-food-row:hover { border-color:var(--teal); background:#f7fffb; }
.expiry-label { margin-left:auto; color:#a15c22; font-size:11px; font-weight:800; text-align:right; }
.expiry-label.is-expired { color:#b43d36; }
.page-footer { display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:24px; padding:10px 0; color:var(--muted); font-size:11px; }
.page-footer p { margin:0; }
button:focus-visible,input:focus-visible { outline:3px solid #f0b93d; outline-offset:3px; }
@media (prefers-reduced-motion:reduce) { .smart-fridge-page *, .smart-fridge-page *::before, .smart-fridge-page *::after { transition-duration:.01ms!important; animation-duration:.01ms!important; } }
@media (max-width:1100px) {
    .kitchen-stage { grid-template-columns:42px minmax(0,1fr) 42px; grid-template-rows:minmax(430px,1fr) auto; gap:7px; padding:15px 8px; }
    .action-zone { padding:8px 6px; }
    .action-icon { width:43px; height:43px; font-size:23px; }
    .carousel-arrow { min-width:42px; }
}
@media (max-width:760px) {
    .fridge-body { width:min(100%, 390px); }
    .smart-fridge-page { padding:18px 12px; }
    .page-header { align-items:flex-start; flex-direction:column; }
    .header-actions { width:100%; justify-content:flex-start; }
    .toolbar { flex-wrap:wrap; }
    .toolbar input { flex:1; min-width:0; }
    .inventory-total { margin-left:0; }
    .kitchen-stage { grid-template-columns:34px minmax(0,1fr) 34px; grid-template-rows:minmax(405px,1fr) auto; gap:6px; padding:13px 6px; }
    .arrow-left { grid-column:1; grid-row:1; }
    .carousel-window { grid-column:2; grid-row:1; overflow:hidden; margin:0; }
    .arrow-right { grid-column:3; grid-row:1; }
    .action-zones { grid-column:2; grid-row:2; gap:8px; }
    .action-zone { width:116px; min-height:62px; padding:7px 5px; gap:6px; }
    .action-icon { width:34px; height:34px; font-size:20px; }
    .carousel-track { width:200%; }
    .storage-unit { padding:0 6px; }
    .fridge-cabinet { min-height:510px; height:510px; }
    .fridge-interior { min-height:0; padding:7px; }
    .fridge-door { padding:10px; }
    .fridge-door.door-open { transform:rotateY(-82deg); }
    .fridge-interior { padding:6px; }
    .compartment { padding:5px; }
    .compartment-heading { font-size:9px; }
    .compartment-heading small { font-size:8px; }
    .mini-food { min-width:22px; height:22px; font-size:15px; }
    .pantry-cabinet { min-height:310px; padding:8px; }
    .action-zone { grid-row:2; min-height:62px; }
    .action-zone small { display:none; }
    .action-zone strong { font-size:9px; }
    .carousel-nav { margin-top:17px; }
    .inventory-modal { padding:16px; }
}
@media (max-width:430px) {
    .fridge-body { width:min(100%, 320px); padding:7px; }
    .header-actions { align-items:stretch; flex-direction:column; }
    .header-actions button { width:100%; }
    .kitchen-stage { grid-template-columns:30px minmax(0,1fr) 30px; }
    .action-zone { width:108px; }
    .action-zones { gap:6px; }
    .carousel-window { margin:0; }
    .carousel-arrow { min-width:32px; min-height:66px; }
    .carousel-arrow span { font-size:30px; }
    .carousel-arrow small { font-size:7px; }
    .fridge-cabinet { min-height:470px; height:470px; }
    .fridge-interior { min-height:0; padding:6px; }
    .fridge-door { padding:8px; }
    .fridge-door.door-open { transform:rotateY(-72deg); }
    .door-brand { font-size:8px; }
    .door-handle { height:42%; right:8px; }
    .door-hint { font-size:7px; right:7px; bottom:7px; }
    .interior-header { font-size:8px; }
    .temperature { font-size:7px; }
    .compartment-heading { align-items:flex-start; flex-direction:column; gap:1px; }
    .compartment-heading small { font-size:7px; }
    .food-preview { gap:2px; }
    .mini-food { min-width:19px; height:21px; font-size:13px; }
    .more-food { min-width:23px; font-size:8px; }
    .pantry-shelf { padding:5px; }
    .pantry-shelf-label { font-size:7px; }
    .expiry-food-row { gap:6px; padding:8px 6px; }
    .expiry-label { max-width:80px; font-size:9px; }
}

@media (max-width:600px) {
    .closed-fridge-dashboard { left:10%; right:10%; top:8%; gap:5px; padding:8px; }
    .dashboard-stat { min-height:42px; }
    .dashboard-stat strong { font-size:19px; }
    .dashboard-stat small { font-size:8px; }
    .dashboard-title { font-size:8px; }
}


/* v9: door shelves are shorter with three deliberate gaps, and the close control sits at the bottom of the open door. */
.fridge-door {
    appearance:none;
    text-align:initial;
}
.fridge-door .door-inner {
    box-sizing:border-box;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    align-items:stretch;
    gap:0;
    padding:16px 12px 12px;
}
.fridge-door .door-inner-title {
    flex:0 0 auto;
    min-height:22px;
    margin:0;
}
.fridge-door .door-bin,
.fridge-door .door-bin-small {
    box-sizing:border-box;
    flex:0 0 31%;
    width:100%;
    min-height:0;
    max-height:31%;
    overflow:auto;
    align-content:flex-start;
    border-radius:7px;
}
.fridge-door .door-bin {
    transform:translateY(-7px);
    background:linear-gradient(180deg,#eaf8ff 0%,#d6effa 100%);
    border:2px solid #83b8d0;
    box-shadow:inset 0 2px 0 rgba(255,255,255,.96),0 3px 0 rgba(47,105,129,.18);
}
.fridge-door .door-bin-small {
    transform:translateY(7px);
    background:linear-gradient(180deg,#eaf8ff 0%,#d6effa 100%);
    border-color:#83b8d0;
}
.fridge-door .fridge-close-button {
    position:relative;
    inset:auto;
    z-index:3;
    align-self:flex-start;
    flex:0 0 auto;
    margin-top:0;
    padding:7px 10px;
    border:2px solid #4d626b;
    border-radius:8px;
    background:#f8fbfc;
    color:#304750;
    font-size:11px;
    font-weight:900;
    cursor:pointer;
    box-shadow:2px 3px 0 rgba(30,49,57,.22);
}
.fridge-door .fridge-close-button:hover { background:#fff; }
.fridge-door.door-open + .fridge-close-button { display:none; }
@media (max-width:760px) {
    .fridge-door .door-inner { padding:10px 8px 8px; }
    .fridge-door .door-inner-title { min-height:18px; font-size:8px; }
    .fridge-door .door-bin, .fridge-door .door-bin-small { flex-basis:30%; max-height:30%; padding:5px; }
    .fridge-door .fridge-close-button { padding:5px 7px; font-size:9px; }
}

</style>
