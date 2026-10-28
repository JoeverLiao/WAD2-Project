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

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

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
// 3. SEARCH AND STORAGE FILTERING
// ============================================================

// v-model connects this value to the search input in the template.
const searchQuery = ref('')

// `computed` updates this list automatically when the inventory or
// search text changes. An empty query matches every item.
const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    return items.value.filter(item => {
        return !query || [item.name, item.unit, locationLabel(item), item.storageZone]
            .some(value => String(value || '').toLowerCase().includes(query))
    })
})

// Group the filtered inventory once per change, instead of filtering and
// sorting the same zone again for every shelf label and preview in the template.
const itemsByZone = computed(() => {
    const zones = new Map()
    for (const item of filteredItems.value) {
        const key = `${item.storage}:${item.storageZone}`
        if (!zones.has(key)) zones.set(key, [])
        zones.get(key).push(item)
    }
    for (const zoneItems of zones.values()) {
        zoneItems.sort((a, b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999'))
    }
    return zones
})

function itemsInZone(storage, storageZone) {
    return itemsByZone.value.get(`${storage}:${storageZone}`) || []
}

// Count inventory records by broad location; quantity is shown separately.
function countItems(storage) {
    return items.value.filter(item => item.storage === storage).length
}

// Vue updates these counts whenever the inventory changes.
const totalItems = computed(() => items.value.length)
const expiredCount = computed(() => items.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days < 0
}).length)
const expiringSoonCount = computed(() => items.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days >= 0 && days <= 3
}).length)

// These values make the most useful inventory health information visible above the stage.
const searchResultCount = computed(() => filteredItems.value.length)

// ============================================================
// 4. ADD / EDIT FORM STATE
// ============================================================

// `formVisible` controls whether the modal form is displayed.
// `editingItem` is null when adding, and contains an item when editing.
const formVisible = ref(false)
const editingItem = ref(null)
const defaultStorage = ref('fridge')
// Remember the exact area where the user clicked Add Food. For example,
// this is 'crisper' when they open the form from the Crisper Drawer.
const defaultStorageZone = ref('middle-shelf')

// The same dialog ref and return-focus target are shared by the compartment
// and expiry dialogs so keyboard users can enter, navigate, and leave either one.
const dialogRef = ref(null)
let modalReturnFocus = null

function focusDialog() {
    nextTick(() => dialogRef.value?.focus())
}

function closeOpenModal() {
    if (selectedCompartment.value) {
        closeCompartment()
    } else if (expiryPanelOpen.value) {
        closeExpiryPanel()
    }
}

// Keep Tab navigation inside the active modal and support Escape from anywhere
// in its content. Focus returns to the control that opened it when it closes.
function handleDialogKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault()
        closeOpenModal()
        return
    }

    if (event.key !== 'Tab') return
    const focusable = [...dialogRef.value.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
    )]
    if (!focusable.length) {
        event.preventDefault()
        dialogRef.value.focus()
        return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}

function openExpiryPanel(event) {
    modalReturnFocus = event?.currentTarget || document.activeElement
    expiryPanelOpen.value = true
    focusDialog()
}

function closeExpiryPanel() {
    expiryPanelOpen.value = false
    nextTick(() => modalReturnFocus?.focus?.())
}

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
// 5. ADD OR EDIT AN ITEM (POST / PATCH)
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
            // Show the validation message from Express when available, while
            // retaining the status as a useful fallback for unexpected errors.
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Could not save item (HTTP ${response.status}).`)
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
        errorMessage.value = error.message || 'Unable to save this food item. Please check the backend and try again.'
    } finally {
        saving.value = false
    }
}

// ============================================================
// 6. CONSUME OR DISCARD FOOD
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
            await nextTick()
            if (selectedCompartment.value) dialogRef.value?.focus()
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
        await nextTick()
        if (selectedCompartment.value) dialogRef.value?.focus()
        successMessage.value = `${item.name} removed from your inventory.`
    } catch (error) {
        console.error('Failed to remove inventory item:', error)
        errorMessage.value = `Unable to remove ${item.name}. Please try again.`
    }
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
// Names the action zone that should react after a successful drop.
const actionReaction = ref('')
let actionReactionTimer = null
let actionReactionRequestId = 0

function setEmojiDragImage(event, emoji) {
    if (!event.dataTransfer) return

    // Use a transparent canvas so the native drag preview contains only the emoji,
    // not the surrounding food card or compartment styling.
    const size = 72
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return

    context.font = '52px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(emoji, size / 2, size / 2)

    // setDragImage needs a rendered element in the document in some browsers.
    // Place the transparent canvas under the pointer, then remove it next frame.
    canvas.style.position = 'fixed'
    canvas.style.left = `${Math.max(0, event.clientX - size / 2)}px`
    canvas.style.top = `${Math.max(0, event.clientY - size / 2)}px`
    canvas.style.zIndex = '2147483647'
    canvas.style.pointerEvents = 'none'
    canvas.style.background = 'transparent'
    document.body.appendChild(canvas)
    event.dataTransfer.setDragImage(canvas, size / 2, size / 2)
    requestAnimationFrame(() => canvas.remove())
}

// Small food icons in the stage are plain spans, so replace their default
// drag snapshot with a transparent emoji-only preview as well.
function setStageEmojiDragImage(event) {
    const emojiElement = event.target.closest?.('.mini-food')
    if (emojiElement) setEmojiDragImage(event, foodEmojiFor(emojiElement.title))
}

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
    actionDropTarget.value = ''
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

    if (!itemId) {
        finishDrag()
        return
    }

    const item = items.value.find(food => food.id === String(itemId))
    if (!item) {
        finishDrag()
        return
    }

    // If the drag began in the inventory modal, let the drop pass through to the stage.
    if (draggingFromModal.value) selectedCompartment.value = null
    // The modal may unmount its card before the browser sends dragend, so a
    // valid drop must complete the drag lifecycle here as well.
    finishDrag()

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
        finishDrag()
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

// Compute guidance once per inventory/search change so rendering the cards
// and empty state does not repeat the same keyword checks.
const storageRecommendations = computed(() =>
    filteredItems.value.filter(item => getRecommendation(item))
)

// ============================================================
// 10. CAROUSEL, COMPARTMENT DETAILS, EXPIRY PANEL AND ACTION ZONES
// ============================================================

// 0 = refrigerator, 1 = pantry. The carousel changes which unit is in front.
const activeStorageUnit = ref('fridge')
const fridgeDoorOpen = ref(false)
const selectedCompartment = ref(null)
const expiryPanelOpen = ref(false)
const actionDropTarget = ref('')

function rotateStorage(direction) {
    const nextStorageUnit = direction === 'right'
        ? (activeStorageUnit.value === 'fridge' ? 'pantry' : 'fridge')
        : (activeStorageUnit.value === 'pantry' ? 'fridge' : 'pantry')

    activateStorageUnit(nextStorageUnit)
}

function activateStorageUnit(storage) {
    if (storage === activeStorageUnit.value) return

    cancelActionReaction()
    activeStorageUnit.value = storage
    selectedCompartment.value = null
    fridgeDoorOpen.value = false
}

function activateInactiveStorageAtPointer(event) {
    const clickedUnit = event.target.closest?.('.storage-unit')
    if (clickedUnit?.classList.contains('fridge-unit')) {
        activateStorageUnit('fridge')
        return
    }
    if (clickedUnit?.classList.contains('pantry-unit')) {
        activateStorageUnit('pantry')
        return
    }

    // The preview can extend beyond the carousel window. Route clicks in that
    // overflow area to the inactive unit on that side of the current view.
    const windowBounds = event.currentTarget.getBoundingClientRect()
    if (activeStorageUnit.value === 'pantry' && event.clientX < windowBounds.left) {
        activateStorageUnit('fridge')
    } else if (activeStorageUnit.value === 'fridge' && event.clientX > windowBounds.right) {
        activateStorageUnit('pantry')
    }
}

function openCompartment(compartment) {
    // Clear any drag that ended while its source card was being unmounted.
    finishDrag()
    cancelActionReaction()
    modalReturnFocus = document.activeElement
    selectedCompartment.value = compartment
    focusDialog()
}

function closeCompartment() {
    selectedCompartment.value = null
    finishDrag()
    cancelActionReaction()
    nextTick(() => modalReturnFocus?.focus?.())
}

function itemsForCompartment(compartment) {
    const list = filteredItems.value.filter(item => {
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

// Reuse the selected compartment's sorted list in its title, cards, and empty state.
const compartmentItems = computed(() =>
    selectedCompartment.value ? itemsForCompartment(selectedCompartment.value) : []
)

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
            return days !== null && days < 0
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
    // Leave the expiry button as the return focus target after routing from
    // this panel, since the clicked row disappears when the panel closes.
    expiryPanelOpen.value = false
    cancelActionReaction()
    if (item.storage === 'pantry') {
        activeStorageUnit.value = 'pantry'
        fridgeDoorOpen.value = false
        selectedCompartment.value = null
        nextTick(() => document.querySelector('.carousel-nav button.selected')?.focus())
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
        focusDialog()
    }
}

function dropOnAction(action, event) {
    event.preventDefault()
    const transferredId = event.dataTransfer?.getData('text/plain')
    const itemId = transferredId || draggedItemId.value
    if (!itemId) {
        finishDrag()
        return
    }
    const item = items.value.find(food => food.id === String(itemId))
    if (!item) {
        finishDrag()
        return
    }
    const droppedInsideDialog = Boolean(event.currentTarget.closest('.inventory-modal'))
    if (draggingFromModal.value && !droppedInsideDialog) selectedCompartment.value = null
    actionDropTarget.value = ''
    // Consume/Discard may close the dialog or remove its card before dragend.
    finishDrag()
    const reactionTarget = droppedInsideDialog ? `modal-${action}` : action
    const reactionRequestId = ++actionReactionRequestId
    const reactAfterSuccess = () => triggerActionReaction(reactionTarget, reactionRequestId)
    if (action === 'consume') consumeItem(item, reactAfterSuccess)
    else discardItem(item, reactAfterSuccess)
}

function triggerActionReaction(action, requestId) {
    // Ignore a late API response if the user has already opened or changed storage.
    if (requestId !== actionReactionRequestId) return

    // Removing and restoring the class lets consecutive drops replay the shake.
    clearTimeout(actionReactionTimer)
    actionReaction.value = ''
    nextTick(() => {
        if (requestId !== actionReactionRequestId) return
        actionReaction.value = action
        // Fallback cleanup prevents a later dialog from inheriting a stale shake
        // if the browser skips animationend while its original target is removed.
        actionReactionTimer = setTimeout(clearActionReaction, 900)
    })
}

function clearActionReaction() {
    clearTimeout(actionReactionTimer)
    actionReactionTimer = null
    actionReaction.value = ''
}

function cancelActionReaction() {
    // Invalidate callbacks that are still waiting for the consume/discard API call.
    actionReactionRequestId += 1
    clearActionReaction()
}

function finishActionReaction(event) {
    if (event.target === event.currentTarget && event.animationName === 'action-zone-shake') {
        clearActionReaction()
    }
}

onBeforeUnmount(cancelActionReaction)

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
    <div class="smart-fridge-page">
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

        <!-- The paper hero makes the page title and main action read like the other feature pages. -->
        <header class="page-header paper hero">
            <div>
                <p class="eyebrow">FULL CIRCLE · INVENTORY MANAGEMENT</p>
                <h1>My Smart Kitchen</h1>
                <p class="page-description">Rotate between your fridge and pantry. Keep food visible, fresh and organised.</p>
            </div>
            <div class="header-actions">
                <span class="hero-doodle" aria-hidden="true">🧊</span>
                <button type="button" class="expiry-button" @click="openExpiryPanel($event)">
                    ⚠️ Expired <span class="expiry-count">{{ expiryItemCount }}</span>
                </button>
                <button type="button" class="primary-button" @click="openAddForm(activeStorageUnit === 'pantry' ? 'pantry' : 'fridge')">
                    ＋ Add Food
                </button>
            </div>
        </header>

        <!-- Keep the three main storage counts visible above the fridge and pantry. -->
        <section class="inventory-summary" aria-label="Inventory summary">
            <article class="summary-card summary-total">
                <span class="summary-icon" aria-hidden="true">📦</span>
                <span class="summary-label">Tracked foods</span>
                <strong>{{ totalItems }}</strong>
            </article>
            <article class="summary-card summary-fridge">
                <span class="summary-icon" aria-hidden="true">🧊</span>
                <span class="summary-label">Fridge &amp; freezer</span>
                <strong>{{ countItems('fridge') + countItems('freezer') }}</strong>
            </article>
            <article class="summary-card summary-pantry">
                <span class="summary-icon" aria-hidden="true">🥫</span>
                <span class="summary-label">Pantry</span>
                <strong>{{ countItems('pantry') }}</strong>
            </article>
        </section>

        <!-- Search filters shelf previews and the full compartment list below. -->
        <section class="toolbar">
            <label for="inventory-search">🔎</label>
            <input id="inventory-search" v-model="searchQuery" type="search" placeholder="Search milk, rice, carrots...">
            <div class="inventory-total" aria-live="polite">
                {{ searchQuery.trim() ? `${searchResultCount} matching foods` : `${totalItems} tracked foods` }}
            </div>
        </section>

        <section class="kitchen-stage" :class="`storage-${activeStorageUnit}`" aria-label="Rotating food storage" @dragstart.capture="setStageEmojiDragImage($event)" @dragover.prevent="handleStageDragOver($event)">
            <button class="carousel-arrow arrow-left" type="button" aria-label="Rotate to previous storage unit" @click="rotateStorage('left')">
                <span>‹</span><small>FRIDGE</small>
            </button>

            <div class="carousel-window" @click.capture="activateInactiveStorageAtPointer($event)">
                <div class="carousel-track" :class="`show-${activeStorageUnit}`">
                    <!-- Refrigerator unit -->
                    <section class="storage-unit fridge-unit" :class="{ 'unit-current': activeStorageUnit === 'fridge' }" aria-label="Refrigerator">
                        <div class="storage-unit-content" :inert="activeStorageUnit !== 'fridge'" :aria-hidden="activeStorageUnit !== 'fridge'">
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
                                                <span v-for="item in itemsInZone('freezer', 'freezer-main').slice(0,3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                <span v-if="itemsInZone('freezer', 'freezer-main').length > 3" class="more-food">+{{ itemsInZone('freezer', 'freezer-main').length - 3 }}</span>
                                                <span v-if="itemsInZone('freezer', 'freezer-main').length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
                                            </span>
                                        </button>

                                        <button v-for="compartment in [
                                            { id: 'upper-shelf', title: 'Upper shelf', storage: 'fridge', zone: 'upper-shelf', icon: '🥣' },
                                            { id: 'middle-shelf', title: 'Middle shelf', storage: 'fridge', zone: 'middle-shelf', icon: '🥛' },
                                            { id: 'lower-shelf', title: 'Lower shelf', storage: 'fridge', zone: 'lower-shelf', icon: '🍱' }
                                        ]" :key="compartment.id" type="button" class="compartment shelf-compartment" :data-drop-storage="compartment.storage" :data-drop-zone="compartment.zone" @click="openCompartment(compartment)" @dragover.prevent @drop.stop="dropOnArea({ storage: compartment.storage, storageZone: compartment.zone }, $event)">
                                            <span class="compartment-heading"><span>{{ compartment.icon }} {{ compartment.title }}</span><small>{{ itemCount(compartment) }} items</small></span>
                                            <span class="food-preview">
                                                <span v-for="item in itemsInZone(compartment.storage, compartment.zone).slice(0,3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                <span v-if="itemCount(compartment) > 3" class="more-food">+{{ itemCount(compartment) - 3 }}</span>
                                                <span v-if="itemsInZone(compartment.storage, compartment.zone).length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
                                            </span>
                                        </button>

                                        <div class="fridge-bottom">
                                            <button type="button" class="compartment crisper-compartment" data-drop-storage="fridge" data-drop-zone="crisper" @click="openCompartment({ id: 'crisper', title: 'Crisper drawer', storage: 'fridge', zone: 'crisper', icon: '🥬' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'crisper' }, $event)">
                                                <span class="compartment-heading">🥬 Crisper drawer <small>{{ itemsInZone('fridge', 'crisper').length }} items</small></span>
                                                <span class="food-preview">
                                                <span v-for="item in itemsInZone('fridge', 'crisper').slice(0,3)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                                    <span v-if="itemsInZone('fridge', 'crisper').length > 3" class="more-food">+{{ itemsInZone('fridge', 'crisper').length - 3 }}</span>
                                                    <span v-if="itemsInZone('fridge', 'crisper').length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
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
                                        <span class="door-inner-title">DOOR SHELVES</span>
                                        <span class="door-bin" data-drop-storage="fridge" data-drop-zone="door" role="button" tabindex="0" title="View all food stored in the fridge door" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)" @click.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.enter.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.space.prevent.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })">
                                            <span v-for="item in itemsInZone('fridge', 'door').slice(0,3)" :key="item.id" class="door-food" :title="item.name">{{ foodEmojiFor(item.name) }}</span>
                                            <span v-if="itemsInZone('fridge', 'door').length === 0" class="door-empty">{{ searchQuery ? 'No matches' : 'Empty shelf' }}</span>
                                        </span>
                                        <span class="door-bin door-bin-small" data-drop-storage="fridge" data-drop-zone="door" role="button" tabindex="0" title="View all food stored in the fridge door" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)" @click.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.enter.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })" @keydown.space.prevent.stop="openCompartment({ id: 'door', title: 'Door shelves', storage: 'fridge', zone: 'door' })">
                                            <span v-for="item in itemsInZone('fridge', 'door').slice(3,6)" :key="item.id" class="door-food" :title="item.name">{{ foodEmojiFor(item.name) }}</span>
                                            <span v-if="itemsInZone('fridge', 'door').length <= 3" class="door-empty">{{ itemsInZone('fridge', 'door').length === 0 ? (searchQuery ? 'No matches' : 'Empty shelf') : 'Tap to view door items' }}</span>
                                        </span>
                                        <span v-if="fridgeDoorOpen" class="fridge-close-button" role="button" tabindex="0" aria-label="Close refrigerator door" @click.stop="fridgeDoorOpen = false" @keydown.enter.stop="fridgeDoorOpen = false" @keydown.space.prevent.stop="fridgeDoorOpen = false">✕ Close door</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p class="unit-caption">Click the door to {{ fridgeDoorOpen ? 'close' : 'open' }} · Select a compartment to view everything</p>
                        </div>
                        <button v-if="activeStorageUnit !== 'fridge'" type="button" class="storage-unit-activate" aria-label="Show refrigerator" @click.stop="activateStorageUnit('fridge')"></button>
                    </section>

                    <!-- Pantry unit -->
                    <section class="storage-unit pantry-unit" :class="{ 'unit-current': activeStorageUnit === 'pantry' }" aria-label="Pantry">
                        <div class="storage-unit-content" :inert="activeStorageUnit !== 'pantry'" :aria-hidden="activeStorageUnit !== 'pantry'">
                        <div class="unit-top-label pantry-label"><span>🥫</span> DRY &amp; SHELF-STABLE</div>
                        <div class="pantry-cabinet pantry-single-storage">
                            <div class="pantry-top"><span>THE PANTRY</span><span>🌾</span></div>
                            <button type="button" class="pantry-shelf pantry-whole-storage" data-drop-storage="pantry" data-drop-zone="dry-storage" @click="openCompartment({ id: 'pantry', title: 'Pantry', storage: 'pantry', zone: 'dry-storage' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'pantry', storageZone: 'dry-storage' }, $event)">
                                <span class="pantry-shelf-label">ALL PANTRY ITEMS · {{ countItems('pantry') }}</span>
                                <span class="pantry-foods pantry-all-foods">
                                <span v-for="item in itemsInZone('pantry', 'dry-storage').slice(0,12)" :key="item.id" class="mini-food" :title="item.name" draggable="true" @dragstart="startDrag(item); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag">{{ foodEmojiFor(item.name) }}</span>
                                    <span v-if="itemsInZone('pantry', 'dry-storage').length > 12" class="more-food">+{{ itemsInZone('pantry', 'dry-storage').length - 12 }}</span>
                                    <span v-if="itemsInZone('pantry', 'dry-storage').length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Drop pantry food here' }}</span>
                                </span>
                                <span class="pantry-storage-hint">Click to view all pantry items</span>
                            </button>
                            <div class="pantry-feet"><span></span><span></span></div>
                        </div>
                        <p class="unit-caption">Click the pantry to view all items</p>
                        </div>
                        <button v-if="activeStorageUnit !== 'pantry'" type="button" class="storage-unit-activate" aria-label="Show pantry" @click.stop="activateStorageUnit('pantry')"></button>
                    </section>
                </div>
            </div>

            <div class="action-zones" aria-label="Food actions">
            <div class="action-zone action-consume"
                :class="{ 'zone-active': actionDropTarget === 'consume', 'zone-shake-consume': actionReaction === 'consume' }"
                @dragover.prevent="onActionDragEnter('consume')"
                @dragenter.prevent="onActionDragEnter('consume')"
                @dragleave="onActionDragLeave"
                @animationend="finishActionReaction"
                @drop="dropOnAction('consume', $event)">
                <span class="action-icon">🍽️</span>
                <strong>CONSUME</strong>
                <small>Drop food here</small>
            </div>

            <div class="action-zone action-discard"
                :class="{ 'zone-active': actionDropTarget === 'discard', 'zone-shake-discard': actionReaction === 'discard' }"
                @dragover.prevent="onActionDragEnter('discard')"
                @dragenter.prevent="onActionDragEnter('discard')"
                @dragleave="onActionDragLeave"
                @animationend="finishActionReaction"
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
            <button type="button" :class="{ selected: activeStorageUnit === 'fridge' }" @click="activateStorageUnit('fridge')">🧊 Fridge</button>
            <span class="carousel-track-dots"><i :class="{ active: activeStorageUnit === 'fridge' }"></i><i :class="{ active: activeStorageUnit === 'pantry' }"></i></span>
            <button type="button" :class="{ selected: activeStorageUnit === 'pantry' }" @click="activateStorageUnit('pantry')">🥫 Pantry</button>
        </nav>

        <section class="storage-hint">
            <span>💡</span>
            <p><strong>Tip:</strong> Food closest to its expiry date appears first. Click any shelf or drawer to see its complete inventory, then drag an item to Consume or Discard.</p>
        </section>

        <section class="recommendation-section">
            <h2>Storage Guidance</h2>
            <p>Some foods may need a different storage location. Check product packaging and food-specific guidance.</p>
            <div class="recommendation-list">
                <article v-for="item in storageRecommendations" :key="item.id" class="recommendation-card">
                    <span>💡</span><div><strong>{{ item.name }}</strong><p>{{ getRecommendation(item) }}</p></div>
                </article>
                <p v-if="storageRecommendations.length === 0" class="no-recommendations">No basic storage suggestions for the current search.</p>
            </div>
        </section>

        <!-- Full compartment inventory -->
        <div v-if="selectedCompartment" class="modal-backdrop" :class="{ 'dragging-out': draggingOutsideModal }" @click.self="closeCompartment" @dragover.prevent="updateModalDragVisibility($event)" @drop.prevent="dropFromModalBackdrop($event)">
            <section ref="dialogRef" class="inventory-modal" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="compartment-title" @keydown="handleDialogKeydown">
                <header class="modal-heading">
                    <div><p class="eyebrow">FULL COMPARTMENT</p><h2 id="compartment-title">{{ selectedCompartment.title }}</h2><p>{{ compartmentItems.length }} matching food(s), sorted by expiry date</p></div>
                    <button type="button" class="modal-close" aria-label="Close compartment" @click="closeCompartment">✕</button>
                </header>
                <div class="modal-toolbar">
                    <button type="button" class="primary-button small-button" @click="openAddForm(selectedCompartment.storage, selectedCompartment.zone)">＋ Add to this compartment</button>
                </div>
                <div v-if="compartmentItems.length" class="modal-food-list">
                    <!-- Cards provide edit, remove, and drag controls; actions stay in the drop zones below. -->
                    <FoodItemCard
                        v-for="item in compartmentItems"
                        :key="item.id"
                        :item="item"
                        @edit="openEditForm"
                        @remove="removeItem"
                        @drag-start="startModalDrag"
                        @drag-end="finishDrag"
                    />
                </div>
                <div v-else class="modal-empty"><span>{{ searchQuery ? '🔎' : '🧺' }}</span><strong>{{ searchQuery ? 'No foods match this search' : 'This compartment is empty' }}</strong><p>{{ searchQuery ? 'Try a different food name, unit, or location.' : 'Add food to see it here.' }}</p></div>
                <div class="modal-action-zones" aria-label="Actions for this compartment">
                    <div class="action-zone action-consume" :class="{ 'zone-active': actionDropTarget === 'consume', 'zone-shake-consume': actionReaction === 'modal-consume' }"
                        @dragover.prevent="onActionDragEnter('consume')" @dragenter.prevent="onActionDragEnter('consume')"
                        @dragleave="onActionDragLeave" @animationend="finishActionReaction" @drop="dropOnAction('consume', $event)">
                        <span class="action-icon">🍽️</span><strong>CONSUME</strong><small>Drop here</small>
                    </div>
                    <div class="action-zone action-discard" :class="{ 'zone-active': actionDropTarget === 'discard', 'zone-shake-discard': actionReaction === 'modal-discard' }"
                        @dragover.prevent="onActionDragEnter('discard')" @dragenter.prevent="onActionDragEnter('discard')"
                        @dragleave="onActionDragLeave" @animationend="finishActionReaction" @drop="dropOnAction('discard', $event)">
                        <span class="action-icon">🗑️</span><strong>DISCARD</strong><small>Drop here</small>
                    </div>
                </div>
                <p class="modal-footnote">Use the buttons on a food card, or drag it to an action below or another storage area.</p>
            </section>
        </div>

        <!-- Expired items across the fridge, freezer and pantry. -->
        <div v-if="expiryPanelOpen" class="modal-backdrop" @click.self="closeExpiryPanel">
            <section ref="dialogRef" class="inventory-modal expiry-modal" role="dialog" aria-modal="true" aria-labelledby="expiry-title" tabindex="-1" @keydown="handleDialogKeydown">
                <header class="modal-heading">
                    <div><p class="eyebrow">REDUCE FOOD WASTE</p><h2 id="expiry-title">⚠️ Expired Food</h2><p>Food past its expiry date across your fridge, freezer and pantry.</p></div>
                    <button type="button" class="modal-close" aria-label="Close expiry panel" @click="closeExpiryPanel">✕</button>
                </header>
                <div v-if="expiryItems.length" class="modal-food-list">
                    <button v-for="item in expiryItems" :key="item.id" type="button" class="expiry-food-row" @click="jumpToItem(item)">
                        <span class="modal-food-emoji">{{ foodEmojiFor(item.name) }}</span>
                        <span class="modal-food-info"><strong>{{ item.name }}</strong><span>{{ locationLabel(item) }} · {{ item.quantity }} {{ item.unit }}</span></span>
                        <span class="expiry-label" :class="{ 'is-expired': expiryDays(item) < 0 }">{{ expiryLabel(item) }}</span>
                        <span aria-hidden="true">›</span>
                    </button>
                </div>
                <div v-else class="modal-empty"><span>✨</span><strong>No expired food right now</strong><p>Nothing in your fridge, freezer or pantry is past its expiry date.</p></div>
            </section>
        </div>

        <FoodItemForm
            :visible="formVisible"
            :item="editingItem"
            :default-storage="defaultStorage"
            :default-storage-zone="defaultStorageZone"
            :saving="saving"
            @save="saveItem"
            @close="closeForm"
        />

        <footer class="page-footer"><p>Full Circle · Interactive Smart Fridge</p><p>Your inventory is loaded from and saved to the backend.</p></footer>
        </div>
</template>

<style scoped>
.smart-fridge-page {
    --ink: #173d39;
    --muted: #63817a;
    --teal: #0fa89c;
    --teal-dark: #087d73;
    --paper: #fdfaf3;
    --line: #a5c9c0;
    max-width: 1320px;
    margin: 0 auto;
    padding: 28px clamp(14px, 3vw, 36px) 22px;
    color: var(--ink);
    background: var(--paper);
    background-image: radial-gradient(rgba(15,168,156,.08) 1px, transparent 1px);
    background-size: 14px 14px;
    font-family: var(--font-sans, "Patrick Hand", cursive, sans-serif);
}
.smart-fridge-page * { box-sizing: border-box; }
.page-header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:20px; }
/* Match the other feature pages' paper hero while keeping the fridge's own palette. */
.page-header.paper { position:relative; overflow:hidden; padding:24px 28px; border:2px solid var(--ink); border-radius:17px; background:#fbfffd; box-shadow:6px 8px 0 var(--ink); }
.eyebrow { margin:0 0 7px; color:var(--teal-dark); font-size:13px; font-weight:800; letter-spacing:1.4px; }
.page-header h1 { margin:0; font-family:var(--font-display, "Kalam", cursive, sans-serif); font-size:clamp(34px,4vw,50px); line-height:1.1; }
.page-description { max-width:620px; margin:10px 0 0; color:var(--muted); font-size:16px; }
.header-actions .hero-doodle { flex:0 0 auto; font-size:48px; line-height:1; filter:drop-shadow(2px 3px 0 rgba(18,63,59,.16)); }
.header-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:12px; }
.primary-button,.expiry-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:12px 17px; border:2px solid var(--ink); border-radius:10px; box-shadow:3px 4px 0 var(--ink); font:700 14px var(--font-sans, "Patrick Hand", cursive, sans-serif); cursor:pointer; transition:transform .18s ease,box-shadow .18s ease; }
.primary-button { background:var(--teal); color:white; font-weight:800; }
.primary-button:hover,.expiry-button:hover { transform:translate(-2px,-2px); box-shadow:5px 6px 0 var(--ink); }
.expiry-button { background:#fff1c9; color:#6b4a10; font-weight:800; }
.expiry-count { display:inline-grid; place-items:center; min-width:24px; height:24px; border-radius:99px; background:#e06e54; color:white; font-size:12px; }
.inventory-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:0 0 22px; }
.summary-card { display:grid; grid-template-columns:auto 1fr; align-items:center; column-gap:10px; min-height:94px; padding:14px 17px; border:2px solid var(--ink); border-radius:13px; background:var(--paper-bright); box-shadow:3px 4px 0 var(--ink); }
.summary-icon { grid-row:span 2; display:grid; place-items:center; width:42px; height:42px; border:2px solid var(--ink); border-radius:12px; background:var(--aqua-soft); font-size:22px; }
.summary-label { align-self:end; color:var(--muted); font-size:13px; font-weight:700; line-height:1.25; }
.summary-card strong { align-self:start; font-family:var(--font-display); font-size:28px; line-height:1.1; }
.summary-pantry .summary-icon { background:#fff1d7; }
.toolbar { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
.toolbar label { font-size:21px; }
.toolbar input { width:min(440px,100%); padding:11px 14px; border:2px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); font:inherit; }
.toolbar input:focus-visible { border-color:var(--teal-dark); }
.inventory-total { margin-left:auto; padding:9px 13px; border:1px dashed var(--line); border-radius:9px; color:var(--muted); font-size:13px; white-space:nowrap; }
.kitchen-stage { display:grid; grid-template-columns:58px minmax(0,620px) 58px; grid-template-rows:minmax(490px,1fr) auto; justify-content:center; align-items:center; gap:10px; min-height:650px; padding:24px 16px 18px; border:2px solid var(--ink); border-radius:20px; background:linear-gradient(180deg,#dceefa 0%,#eef7fb 48%,#d9e9f3 100%); box-shadow:5px 6px 0 var(--ink); overflow:hidden; transition:background .7s ease,border-color .7s ease; }
.kitchen-stage.storage-pantry { background:linear-gradient(145deg,#f1e4d1 0%,#f8f0e3 48%,#ead8bb 100%); border-color:#9b7b58; box-shadow:5px 6px 0 #b69b79; }
.carousel-arrow { grid-row:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:52px; min-height:82px; border:2px solid var(--ink); border-radius:14px; background:#fffdf5; color:var(--ink); cursor:pointer; box-shadow:2px 3px 0 var(--ink); z-index:3; }
.carousel-arrow span { font-size:38px; line-height:1; }
.carousel-arrow small { font-size:9px; font-weight:800; letter-spacing:.6px; }
.carousel-arrow:hover { background:#dff7ed; transform:translateY(-2px); }
.arrow-left { grid-column:1; grid-row:1; }
.arrow-right { grid-column:3; grid-row:1; }
.carousel-window { grid-column:2; grid-row:1; align-self:center; min-width:0; width:100%; overflow:visible; perspective:1200px; }
.carousel-track { display:flex; width:200%; transform:translateX(0); transition:transform .7s cubic-bezier(.2,.75,.2,1); transform-style:preserve-3d; }
.carousel-track.show-pantry { transform:translateX(-50%); }
.storage-unit { position:relative; flex:0 0 50%; width:50%; min-width:0; padding:0 12px; opacity:.58; transform:scale(.9) rotateY(7deg); filter:saturate(.72); transition:opacity .55s ease,transform .65s cubic-bezier(.2,.75,.2,1),filter .55s ease; }
.storage-unit.unit-current { opacity:1; transform:scale(1) rotateY(0); filter:none; }
.storage-unit-content { width:100%; }
.pantry-unit .storage-unit-content { display:flex; flex-direction:column; }
.storage-unit-activate { position:absolute; inset:0; z-index:20; display:block; width:100%; height:100%; padding:0; border:0; background:transparent; cursor:pointer; }
.storage-unit-activate:focus-visible { outline:3px solid #f0b93d; outline-offset:-4px; border-radius:12px; }
.storage-pantry .unit-top-label,.storage-pantry .unit-caption { color:#725a3d; }
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
.door-brand { writing-mode:horizontal-tb; font-size:11px; font-weight:900; letter-spacing:2px; }
.door-handle { display:block; width:5px; height:62px; border-radius:9px; background:linear-gradient(90deg,#6c8b82,#eff6f0,#78978c); box-shadow:1px 1px 2px #56746a; }
.door-hint { font-size:8px; font-weight:900; }
.unit-caption { margin:13px 0 0; color:#587970; font-size:11px; line-height:1.5; text-align:center; }
.pantry-label { color:#84602c; }
.pantry-unit { display:flex; flex-direction:column; justify-content:center; }
.pantry-unit .pantry-cabinet { width:min(100%,520px); align-self:center; }
.pantry-cabinet { position:relative; display:flex; flex-direction:column; gap:9px; min-height:350px; padding:13px; border:3px solid #9a744b; border-radius:12px; background:linear-gradient(90deg,#d9b786 0%,#f7e8cf 14%,#efdbbb 86%,#cfaa78 100%); box-shadow:inset 0 0 0 5px rgba(255,250,239,.48),4px 6px 0 rgba(90,66,39,.18); }
.pantry-top { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border:1px solid #c4a174; border-bottom:5px solid #b58b59; border-radius:7px 7px 3px 3px; background:linear-gradient(180deg,#fff4e2,#ead1a9); color:#624725; font-size:12px; font-weight:900; letter-spacing:1px; }
.pantry-top span:last-child { font-size:21px; }
.pantry-shelf { flex:1; display:flex; flex-direction:column; justify-content:center; gap:7px; min-width:0; padding:8px; border:2px solid #a57b4b; border-radius:7px; background:linear-gradient(180deg,#f4dfbb,#e8c99c); color:#654522; text-align:left; cursor:pointer; box-shadow:0 5px 0 #92683b; }
.pantry-shelf-label { font-size:9px; font-weight:900; letter-spacing:1px; }
.pantry-single-storage { gap:9px; }
.pantry-whole-storage { flex:1; min-height:245px; align-items:stretch; justify-content:flex-start; gap:14px; padding:15px; background:linear-gradient(to bottom,transparent 31%,rgba(178,137,83,.78) 31%,rgba(178,137,83,.78) 34%,transparent 34%,transparent 65%,rgba(178,137,83,.78) 65%,rgba(178,137,83,.78) 68%,transparent 68%),linear-gradient(145deg,#fff6e7,#efd9b3); border:2px solid #bd9462; box-shadow:inset 0 0 0 3px rgba(255,255,255,.42),0 5px 0 #a47b4d; }
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
.action-zone.zone-shake-consume,.action-zone.zone-shake-discard { animation:action-zone-shake .62s ease-in-out; }
@keyframes action-zone-shake {
    0%,100% { transform:translateX(0) rotate(0); }
    15% { transform:translateX(-6px) rotate(-2deg); }
    30% { transform:translateX(6px) rotate(2deg); }
    45% { transform:translateX(-5px) rotate(-1.5deg); }
    60% { transform:translateX(5px) rotate(1.5deg); }
    75% { transform:translateX(-3px) rotate(-1deg); }
    90% { transform:translateX(3px) rotate(1deg); }
}
.carousel-nav { display:flex; align-items:center; justify-content:center; gap:18px; margin:22px auto 12px; }
.carousel-nav button { padding:9px 15px; border:2px solid transparent; border-radius:9px; background:transparent; color:var(--muted); font:700 13px var(--font-sans, "Patrick Hand", cursive, sans-serif); cursor:pointer; }
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
.modal-food-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr)); align-items:stretch; gap:12px; }
.modal-food-list :deep(.food-card) { min-height:100%; }
.expiry-food-row { display:flex; align-items:center; gap:11px; min-width:0; padding:11px; border:1px solid #c7ddd5; border-radius:10px; background:#fff; }
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
/* Let the hero and summary use the same compact layout before tablet widths get tight. */
@media (max-width:900px) {
    .page-header { align-items:flex-start; flex-direction:column; }
    .header-actions { width:100%; justify-content:flex-start; }
    .header-actions .hero-doodle { margin-right:auto; }
    .inventory-summary { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width:760px) {
    .fridge-body { width:min(100%, 390px); }
    .smart-fridge-page { padding:18px 12px; }
    .page-header { align-items:flex-start; flex-direction:column; }
    .page-header.paper { padding:22px 20px; }
    .header-actions { width:100%; justify-content:flex-start; }
    .header-actions .hero-doodle { margin-right:auto; }
    .inventory-summary { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .summary-pantry { grid-column:1 / -1; }
    .summary-card { min-height:82px; padding:11px; }
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
    .header-actions .hero-doodle { display:none; }
    .inventory-summary { gap:8px; }
    .summary-card { grid-template-columns:34px 1fr; column-gap:7px; min-height:76px; padding:8px; }
    .summary-icon { width:32px; height:32px; border-radius:9px; font-size:18px; }
    .summary-label { font-size:11px; }
    .summary-card strong { font-size:23px; }
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
    justify-content:flex-start;
    align-items:stretch;
    gap:8px;
    padding:12px;
}
.fridge-door .door-inner-title {
    flex:0 0 auto;
    min-height:24px;
    margin:0;
    padding:3px 5px;
    justify-content:center;
    border-radius:5px;
    background:rgba(255,255,255,.88);
    color:#304e5a;
    text-align:center;
    font-size:9px;
}
.fridge-door .door-bin,
.fridge-door .door-bin-small {
    box-sizing:border-box;
    flex:1 1 0;
    width:100%;
    min-height:0;
    max-height:none;
    overflow:auto;
    align-content:flex-start;
    border-radius:7px;
}
.fridge-door .door-bin {
    transform:none;
    background:linear-gradient(180deg,#eaf8ff 0%,#d6effa 100%);
    border:2px solid #83b8d0;
    box-shadow:inset 0 2px 0 rgba(255,255,255,.96),0 3px 0 rgba(47,105,129,.18);
}
.fridge-door .door-bin-small {
    transform:none;
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
    .fridge-door .door-bin, .fridge-door .door-bin-small { flex:1 1 0; max-height:none; padding:5px; }
    .fridge-door .fridge-close-button { padding:5px 7px; font-size:9px; }
}

/* Keep hover and keyboard focus equally clear across every storage compartment. */
.compartment:hover,
.pantry-shelf:hover,
.door-bin[role="button"]:hover,
.compartment:focus-visible,
.pantry-shelf:focus-visible,
.door-bin[role="button"]:focus-visible {
    outline:3px solid #3985a5;
    outline-offset:2px;
}

</style>
