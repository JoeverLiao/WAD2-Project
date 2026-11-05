<script setup>
import { usePageLoading } from '../../utils/pageLoading.js'
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

import { ref, computed, onMounted, onBeforeUnmount, nextTick, inject, watch } from 'vue'

// Reusable card for displaying one food item.
import { RouterLink, routerKey, routeLocationKey } from 'vue-router'

import EggLoader from '../../components/EggLoader.vue'
import FoodItemCard from '../../components/fridge/FoodItemCard.vue'
import FoodItemForm from '../../components/fridge/FoodItemForm.vue'
import FoodDragActions from '../../components/fridge/FoodDragActions.vue'
import FoodTransferOverlay from '../../components/fridge/FoodTransferOverlay.vue'
import { useFoodTransfer } from '../../utils/foodTransfer.js'
import FoodIcon from '../../components/FoodIcon.vue'
import NoticeIcon from '../../components/NoticeIcon.vue'
import { showConfirm, showPrompt } from '../../utils/dialog.js'

// ============================================================
// 1. INVENTORY DATA AND PAGE STATUS
// ============================================================

// Start with an empty list. We will fill it using GET /api/inventory.
// Each MongoDB document has an `_id`; we also create an `id` property
// because the existing FoodItemCard/template uses `item.id`.
const props = defineProps({
    embedded: { type: Boolean, default: false },
    inventoryItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['inventory-change', 'reload'])
const router = inject(routerKey, null)
const route = inject(routeLocationKey, null)
const localItems = ref([])
const activeStorage = ref('fridge')
const animateStorageSlide = ref(true)
function showStorage(storage, animate = false) {
    if (props.embedded) return
    animateStorageSlide.value = animate
    activeStorage.value = storage === 'pantry' ? 'pantry' : 'fridge'
}
function changeStorage(storage) {
    finishDrag()
    cancelActionReaction()
    selectedFoodIds.value = new Set()
    foodTooltip.value = null
    showStorage(storage, true)
}
// The embedded dashboard owns its inventory; send successful changes back to it.
const items = computed({
    get: () => props.embedded ? props.inventoryItems.map(normaliseItem) : localItems.value,
    set: (updated) => {
        if (props.embedded) emit('inventory-change', updated)
        else localItems.value = updated
    },
})

// These values let the page show progress and useful error messages.
const loading = ref(false)
usePageLoading(loading, 'Loading your food')
const saving = ref(false)
const shiftingFood = ref(false)
const errorMessage = ref('')
const kitchenStage = ref(null)
const foodTransfer = useFoodTransfer(kitchenStage)

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
    const id = String(apiItem._id || apiItem.id)
    return {
        ...apiItem,
        // MongoDB uses _id; our existing Vue template uses id.
        id,
        // Date inputs need YYYY-MM-DD rather than a full ISO timestamp.
        expiresAt: toDateInputValue(apiItem.expiresAt),
        purchasedAt: toDateInputValue(apiItem.purchasedAt),
        // Keep storageZone available even for older records that lack it.
        storageZone: compatibleZone(apiItem.storage, apiItem.storageZone),
        // Keep the storage guide fields in a predictable shape for warnings.
        suggestedLocation: apiItem.suggestedLocation || '',
        allowedLocations: Array.isArray(apiItem.allowedLocations) ? apiItem.allowedLocations : [],
        locationReason: apiItem.locationReason || '',
        dietType: apiItem.dietType || '',
        // Quantity is optional in the inventory model (for weight-only items).
        quantity: apiItem.quantity ?? '',
        weightKg: apiItem.weightKg ?? ''
    }
}

// Choose a reasonable compartment if an older record has no zone saved.
function defaultZoneFor(storage) {
    if (storage === 'freezer') return 'freezer-main'
    if (storage === 'pantry') return 'dry-storage'
    return 'middle-shelf'
}

// A zone is the precise location, so use it as the source of truth for storage.
function storageForZone(zone) {
    if (zone === 'freezer-main') return 'freezer'
    if (zone === 'dry-storage') return 'pantry'
    if (['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper'].includes(zone)) return 'fridge'
    return ''
}

// Older scanned items may have inherited the model's fridge-only default.
function compatibleZone(storage, zone) {
    if (storage === 'pantry' || storage === 'freezer') return defaultZoneFor(storage)
    return ['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper'].includes(zone) ? zone : 'middle-shelf'
}

// Normalize optional form values before sending them to the API.
// Null clears an amount when switching between count and weight-only tracking.
function prepareItemForApi(formData) {
    const storageZone = formData.storageZone || defaultZoneFor(formData.storage)
    return {
        name: formData.name,
        quantity: formData.quantity === '' || formData.quantity == null ? null : Number(formData.quantity),
        weightKg: formData.weightKg === '' || formData.weightKg == null ? null : Number(formData.weightKg),
        unit: formData.unit,
        storage: storageForZone(storageZone) || formData.storage,
        storageZone,
        expiresAt: formData.expiresAt || null,
        // This form does not currently ask for a purchase date or price.
        // Do not invent values for those optional fields.
    }
}

// ============================================================
// 2. LOAD INVENTORY FROM THE BACKEND
// ============================================================

async function loadInventory() {
    if (props.embedded) { emit('reload'); return }
    loading.value = true
    errorMessage.value = ''

    try {
        // GET asks the backend for the signed-in user's inventory.
        const response = await fetch('/api/inventory', {
            method: 'GET',
            credentials: 'include'
        })

        // A non-2xx response means the request failed.
        if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(response.status === 401 ? 'Your session has expired. Please sign in again to load your food.' : body.error || `Could not load inventory (HTTP ${response.status}).`)
        }

        const data = await response.json()

        // Support either a plain array or an object containing `items`.
        // This makes the page tolerant of either common API response shape.
        const apiItems = Array.isArray(data) ? data : (data.items || [])

        // Convert MongoDB records to the shape expected by the template.
        items.value = apiItems.map(normaliseItem)
    } catch (error) {
        console.error('Failed to load inventory:', error)
        errorMessage.value = error.message || 'Unable to load your inventory. Please try again.'
    } finally {
        // `finally` runs whether the request succeeds or fails.
        loading.value = false
    }
}

// Automatically load inventory when this page first appears.
onMounted(async () => {
    if (!props.embedded) {
        await loadInventory()
        openLinkedCompartment()
    }
})
watch(() => [
  route?.query?.location,
  route?.query?.highlight
], () => {
  if (!props.embedded) openLinkedCompartment()
})
function openLinkedCompartment() {
    const queryIds = route?.query?.highlight
    const ids = new Set(Array.isArray(queryIds) ? queryIds : queryIds ? [queryIds] : [])
    const highlighted = items.value.filter(item => ids.has(item.id))
    if (highlighted.length) {
        showSavedItems(highlighted)
        return
    }
    const locations = {
        'upper-shelf': { title: 'Upper shelf', storage: 'fridge' },
        'middle-shelf': { title: 'Shelves', storage: 'fridge' },
        'lower-shelf': { title: 'Lower shelf', storage: 'fridge' },
        'freezer-main': { title: 'Freezer', storage: 'freezer' },
        crisper: { title: 'Crisper drawer', storage: 'fridge' },
        door: { title: 'Upper door shelf', storage: 'fridge' },
        'door-lower': { title: 'Lower door shelf', storage: 'fridge' },
        'dry-storage': { title: 'Pantry', storage: 'pantry' },
    }
    const zone = route?.query?.location
    const location = locations[zone]
    if (!location) return
    fridgeDoorOpen.value = true
    openCompartment({ id: zone, zone, ...location })
}


// ============================================================
// 3. SEARCH AND STORAGE FILTERING
// ============================================================

// v-model connects this value to the search input in the template.
const searchQuery = ref('')
const fridgeSearch = ref(null)

function typeToSearch(event) {
    const input = fridgeSearch.value
    if (!input || props.embedded || !fridgeDoorOpen.value || activeStorage.value !== 'fridge' ||
        event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        event.key.length !== 1 || !event.key.trim() ||
        event.target.closest?.('input, textarea, select, [contenteditable], [role="dialog"]') ||
        selectedCompartment.value || expiryPanelOpen.value || formVisible.value || shiftingFood.value) return

    event.preventDefault()
    searchQuery.value += event.key
    input.focus()
}

onMounted(() => document.addEventListener('keydown', typeToSearch))
onBeforeUnmount(() => document.removeEventListener('keydown', typeToSearch))

const selectedFoodIds = ref(new Set())
const selectionBox = ref(null)
let selectionGesture = null
let selectionRoot = null
let suppressSelectionClick = false
let selectionClickTimer
function beginFoodSelection(event) {
    if (event.button !== 0 || event.pointerType === 'touch' || shiftingFood.value) return
    if (event.target.closest('[draggable="true"], input, .fridge-close-button, .primary-button')) return
    if (event.target.closest('.fridge-door') && !event.target.closest('.door-bin')) return
    selectionRoot = event.currentTarget
    selectionGesture = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY, additive: event.ctrlKey || event.metaKey || event.shiftKey, previous: new Set(selectedFoodIds.value), moved: false }
    // Door shelves should select food without also starting a door gesture.
    event.stopPropagation()
    event.preventDefault()
}
function updateFoodSelection(event) {
    if (!selectionGesture) return
    const gesture = selectionGesture
    const x = event.clientX + window.scrollX
    const y = event.clientY + window.scrollY
    if (!gesture.moved && Math.hypot(x - gesture.x, y - gesture.y) < 5) return
    gesture.moved = true
    const box = { left: Math.min(x, gesture.x) - window.scrollX, top: Math.min(y, gesture.y) - window.scrollY, right: Math.max(x, gesture.x) - window.scrollX, bottom: Math.max(y, gesture.y) - window.scrollY }
    selectionBox.value = box
    foodTooltip.value = null
    const selected = gesture.additive ? new Set(gesture.previous) : new Set()
    for (const icon of selectionRoot.querySelectorAll('[data-food-id]')) {
        if (icon.closest('[inert]:not([inert="false"])')) continue
        const rect = icon.getBoundingClientRect()
        let visible = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
        for (let parent = icon.parentElement; parent && parent !== selectionRoot; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            const bounds = parent.getBoundingClientRect()
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { visible.left = Math.max(visible.left, bounds.left); visible.right = Math.min(visible.right, bounds.right) }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { visible.top = Math.max(visible.top, bounds.top); visible.bottom = Math.min(visible.bottom, bounds.bottom) }
        }
        if (visible.right > visible.left && visible.bottom > visible.top && visible.left < box.right && visible.right > box.left && visible.top < box.bottom && visible.bottom > box.top) selected.add(icon.dataset.foodId)
    }
    selectedFoodIds.value = selected
}
function endFoodSelection(event) {
    if (!selectionGesture) return
    if (event?.type === 'pointercancel') selectedFoodIds.value = selectionGesture.previous
    else if (selectionGesture.moved) {
        suppressSelectionClick = true
        clearTimeout(selectionClickTimer)
        selectionClickTimer = setTimeout(() => { suppressSelectionClick = false }, 0)
    } else if (!selectionGesture.additive) selectedFoodIds.value = new Set()
    selectionGesture = null
    selectionBox.value = null
}
function stopSelectionClick(event) {
    if (suppressSelectionClick) {
        event.preventDefault()
        event.stopPropagation()
        suppressSelectionClick = false
        return
    }
    const icon = event.target.closest('[data-food-id]')
    if (!icon || !event.currentTarget.contains(icon)) return
    event.preventDefault()
    event.stopPropagation()
    selectFood(icon.dataset.foodId, event.ctrlKey || event.metaKey || event.shiftKey)
}
function selectFood(id, additive) {
    const selected = additive ? new Set(selectedFoodIds.value) : new Set()
    if (additive && selected.has(id)) selected.delete(id)
    else selected.add(id)
    selectedFoodIds.value = selected
}
function selectFoodWithKeyboard(event) {
    const icon = event.target.closest('[data-food-id]')
    if (!icon || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    selectFood(icon.dataset.foodId, event.ctrlKey || event.metaKey || event.shiftKey)
}
function openFoodCompartment(event) {
    const icon = event.target.closest('[data-food-id]')
    if (!icon) return
    event.preventDefault()
    event.stopPropagation()
    const area = icon.closest('[data-drop-zone]')
    if (!area) return
    openCompartment({ id: area.dataset.dropZone, zone: area.dataset.dropZone,
        storage: area.dataset.dropStorage, title: locationLabel({ storage: area.dataset.dropStorage, storageZone: area.dataset.dropZone }) })
}
function clearFoodSelection(event) {
    if (event.key === 'Escape') {
        selectedFoodIds.value = new Set()
        selectionGesture = null
        selectionBox.value = null
    }
}
onMounted(() => {
    document.addEventListener('pointermove', updateFoodSelection)
    document.addEventListener('pointerup', endFoodSelection)
    document.addEventListener('pointercancel', endFoodSelection)
    document.addEventListener('keydown', clearFoodSelection)
})
onBeforeUnmount(() => {
    clearTimeout(selectionClickTimer)
    document.removeEventListener('pointermove', updateFoodSelection)
    document.removeEventListener('pointerup', endFoodSelection)
    document.removeEventListener('pointercancel', endFoodSelection)
    document.removeEventListener('keydown', clearFoodSelection)
})


const foodTooltip = ref(null)
function showFoodName(item, event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const badge = expiryBadge(item)
    foodTooltip.value = {
        name: item.name,
        expiry: badge === 'Expired' ? badge : badge ? expiryLabel(item) : null,
        expired: badge === 'Expired',
        storageWarning: getRecommendation(item) ? (guidanceDestinationLabel(item) ? `Move to ${guidanceDestinationLabel(item)}` : 'Check storage guidance') : '',
        x: Math.max(100, Math.min(window.innerWidth - 100, rect.left + rect.width / 2)),
        y: rect.top,
    }
}

function scrollCompartment(event) {
    if (event.ctrlKey) return
    const container = event.currentTarget
    const row = container.matches('.door-bin') ? container : container.querySelector('.food-preview, .pantry-all-foods')
    if (!row || row.scrollWidth <= row.clientWidth) return
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    const multiplier = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? row.clientWidth : 1
    event.preventDefault()
    foodTooltip.value = null
    row.scrollLeft += delta * multiplier
}


// `computed` updates this list automatically when the inventory or
// search text changes. An empty query matches every item.
// One fridge (including its freezer) and one pantry. Legacy named items remain visible.
const storageOptions = computed(() => [
    { type: 'fridge', name: 'Main fridge', label: 'Fridge' },
    { type: 'pantry', name: 'Pantry', label: 'Pantry' },
])
const fridgeItems = computed(() => items.value)
const storageIndex = computed(() => storageOptions.value.findIndex(option => option.type === activeStorage.value))
const currentStorage = computed(() => storageOptions.value[storageIndex.value])
const fridgeDoorTitle = 'Fridge'

function itemStorageName(item) {
    return item.storage === 'pantry' ? 'Pantry' : 'Fridge'
}

function selectStorage(option) {
    changeStorage(option.type)
    if (props.embedded) activeStorage.value = option.type
}

function stepStorage(direction) {
    const count = storageOptions.value.length
    selectStorage(storageOptions.value[(storageIndex.value + direction + count) % count])
}

const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    return fridgeItems.value.filter(item => {
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
    if (storage === 'fridge' && storageZone === 'middle-shelf') {
        return filteredItems.value.filter(item => item.storage === 'fridge' && ['upper-shelf', 'middle-shelf', 'lower-shelf'].includes(item.storageZone))
            .sort((a, b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999'))
    }
    return itemsByZone.value.get(`${storage}:${storageZone}`) || []
}
const pantryShelves = computed(() => {
    const pantryItems = itemsInZone('pantry', 'dry-storage')
    return Array.from({ length: 4 }, (_, shelf) => pantryItems.filter((_, index) => index % 4 === shelf))
})

// Count inventory records by broad location; quantity is shown separately.
function countItems(storage) {
    return fridgeItems.value.filter(item => item.storage === storage).length
}

// Vue updates these counts whenever the inventory changes.
const totalItems = computed(() => fridgeItems.value.length)
const expiredCount = computed(() => fridgeItems.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days < 0
}).length)
const expiringSoonCount = computed(() => fridgeItems.value.filter(item => {
    const days = expiryDays(item)
    return days !== null && days >= 0 && days <= 3
}).length)

// These values make the most useful inventory health information visible above the stage.

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

const expiryTrigger = ref(null)

function leaveExpiryDropdown(event) {
    if (event.pointerType === 'mouse' && !discardingExpired.value &&
        !event.currentTarget.contains(document.activeElement)) expiryPanelOpen.value = false
}

function closeExpiryPanel() {
    expiryPanelOpen.value = false
    expiryTrigger.value?.focus()
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

    const originalItem = editingItem.value
    const isEditing = Boolean(originalItem)
    const itemId = originalItem?.id
    const payload = prepareItemForApi(formData)
    const origins = originalItem ? foodTransfer.capture([originalItem]) : []

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
            items.value = items.value.map(item => item.id === String(itemId) ? savedItem : item)
        } else {
            // Show a newly created item at the top of the inventory.
            items.value = [savedItem, ...items.value]
        }

        closeForm()
        if (originalItem && (originalItem.storage !== savedItem.storage || originalItem.storageZone !== savedItem.storageZone)) {
            showMovedStorageAdvice([savedItem])
            selectedCompartment.value = null
            showStorage(savedItem.storage)
            await foodTransfer.play(origins, new Set([savedItem.id]), locationLabel(savedItem))
        }
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

    const group = selectedFoodsFor(item)
    if (group.length > 1) return changeSelectedFoods(group, action, onAnimationSuccess)
    const actionLabel = action === 'consume' ? 'consume' : 'discard'
    const currentQuantity = Number(item.quantity)

    // Weight-only items use kilograms as the tracked amount for consume/discard.
    if (!Number.isFinite(currentQuantity) || currentQuantity <= 0) {
        const currentWeight = Number(item.weightKg)
        if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
            errorMessage.value = `${item.name} has no quantity or weight recorded.`
            return
        }

        const input = await showPrompt({
            title: `How many kg of ${item.name} would you like to ${actionLabel}?`,
            message: `Current weight: ${currentWeight} kg`,
            label: 'Amount (kg)',
            defaultValue: String(currentWeight),
            inputMode: 'decimal',
            confirmLabel: action === 'consume' ? 'Consume' : 'Discard',
            validate: value => {
                const amount = Number(value)
                if (!Number.isFinite(amount) || amount <= 0 || amount > currentWeight) {
                    return `Enter an amount greater than 0 and no more than ${currentWeight} kg.`
                }
                return ''
            },
        })
        if (input === null) return

        const amount = Number(input)
        const remainingWeight = Math.max(0, currentWeight - amount)
        const removesItem = amount >= currentWeight
        const activity = action === 'consume' ? 'consumed' : 'discarded'
        errorMessage.value = ''
        try {
            const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
                method: removesItem ? 'DELETE' : 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(removesItem ? { activity } : { activity, amount })
            })
            if (!response.ok) throw new Error(`Could not ${actionLabel} food (HTTP ${response.status}).`)

            if (removesItem) {
                items.value = items.value.filter(existingItem => existingItem.id !== item.id)
                await nextTick()
                if (selectedCompartment.value) dialogRef.value?.focus()
            } else {
                const data = await response.json()
                items.value = items.value.map(existingItem => existingItem.id === item.id
                    ? normaliseItem(data.item || data) : existingItem)
            }
            onAnimationSuccess?.({ amount, originalQuantity: currentWeight, remainingQuantity: remainingWeight, proportion: amount / currentWeight })
        } catch (error) {
            console.error(`Failed to ${actionLabel} food:`, error)
            errorMessage.value = error.message || `Unable to ${actionLabel} ${item.name}. Please try again.`
        }
        return
    }

    const input = currentQuantity > 1 ? await showPrompt({
        title: `How many ${item.unit} of ${item.name} would you like to ${actionLabel}?`,
        message: `Current quantity: ${item.quantity}`,
        label: `Quantity (${item.unit})`,
        defaultValue: String(item.quantity),
        inputMode: 'decimal',
        confirmLabel: action === 'consume' ? 'Consume' : 'Continue',
        // Validate the quantity.
        validate: (value) => {
            const quantity = Number(value)
            if (!Number.isFinite(quantity) || quantity <= 0 || quantity > currentQuantity) {
                return `Please enter a quantity greater than 0 and no more than ${item.quantity}.`
            }
            return ''
        }
    }) : String(item.quantity)

    // Cancel was clicked.
    if (input === null) return

    const amount = Number(input)
    const remainingQuantity = Number(item.quantity) - amount

    // Confirm before discarding food.
    if (action === 'discard' && Number(item.quantity) > 1) {
        const confirmed = await showConfirm({
            title: remainingQuantity === 0
                ? `Discard all ${item.name}?`
                : `Discard ${amount} ${item.unit} of ${item.name}?`,
            message: remainingQuantity === 0
                ? 'This will remove it from your inventory.'
                : `${remainingQuantity} will remain.`,
            confirmLabel: 'Discard',
            danger: true
        })

        if (!confirmed) return
    }

    errorMessage.value = ''

    try {
        let response

        if (remainingQuantity === 0) {
            // No quantity remains, so remove the item from active inventory.
            response = await fetch(
                `/api/inventory/${encodeURIComponent(item.id)}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activity: action === 'consume' ? 'consumed' : 'discarded' })
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
                        activity: action === 'consume' ? 'consumed' : 'discarded', amount
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
            const data = await response.json()
            items.value = items.value.map(existingItem => existingItem.id === item.id
                ? normaliseItem(data.item || data) : existingItem)
        }

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

async function runCardAction(item, action) {
    if (actionPending.value || shiftingFood.value || saving.value) return
    cardActionPending.value = true
    actionPending.value = true
    try { await changeFoodQuantity(item, action) }
    finally { actionPending.value = false; cardActionPending.value = false }
}


    

// ============================================================
// 7. REMOVE AN ITEM (DELETE)
// ============================================================

async function removeItem(item) {
    // Ask before deleting, so a click does not immediately remove food.
    const confirmed = await showConfirm({
        title: `Remove ${item.name}?`,
        message: 'Are you sure you want to remove this item from your inventory?',
        confirmLabel: 'Remove',
        danger: true
    })
    if (!confirmed) return

    errorMessage.value = ''

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
const storageAction = ref('pantry')
const dragPosition = ref(null)
const dragAnchor = ref(null)
const dragPlacement = ref('')
const windowWidth = ref(1024)
const actionPending = ref(false)
const cardActionPending = ref(false)
const draggedFood = computed(() => items.value.find(item => item.id === draggedItemId.value))
function trackFoodDrag(event) {
    if (!draggedItemId.value) return
    dragPosition.value = { x: event.clientX, y: event.clientY }
    windowWidth.value = window.innerWidth
    const target = event.target.closest?.('[data-drop-zone]')
    const zone = target?.dataset.dropZone
    const names = {
        'upper-shelf': 'Shelves', 'middle-shelf': 'Shelves', 'lower-shelf': 'Shelves',
        'freezer-main': 'Freezer', crisper: 'Crisper drawer',
        door: 'Upper door shelf', 'door-lower': 'Lower door shelf', 'dry-storage': 'Pantry',
    }
    dragPlacement.value = target ? names[zone] || '' : ''
}

onMounted(() => document.addEventListener('dragover', trackFoodDrag))
onBeforeUnmount(() => document.removeEventListener('dragover', trackFoodDrag))
const draggingFromModal = ref(false)
// True only after the pointer has actually moved outside the inventory popup.
const draggingOutsideModal = ref(false)
// Names the action zone that should react after a successful drop.
const actionReaction = ref('')
let actionReactionTimer = null
let actionReactionRequestId = 0

function setEmojiDragImage(event) {
    if (!event.dataTransfer) return

    // Hide the native snapshot; the animated food preview follows the pointer.
    const size = 72
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
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

// Replace the native shelf snapshot with the shared animated preview.
function setStageEmojiDragImage(event) {
    const emojiElement = event.target.closest?.('.mini-food, .door-food')
    if (emojiElement) setEmojiDragImage(event)
}

function foodActionAnchor(item, event) {
    const root = event.currentTarget.closest('.fridge-page-shell')
    const onDoor = item.storage === 'fridge' && ['door', 'door-lower'].includes(item.storageZone)
    const selector = onDoor ? '.door-inner' : item.storage === 'pantry' ? '.pantry-cabinet' : '.fridge-interior'
    const bounds = root?.querySelector(selector)?.getBoundingClientRect()
    return { x: event.clientX, y: event.clientY, side: onDoor ? 'right' : 'left',
        edge: bounds ? onDoor ? bounds.right : bounds.left : event.clientX }
}

function startDrag(item, event) {
    event?.dataTransfer?.setData('application/x-full-circle-food', item.name)
    storageAction.value = item.storage === 'pantry' ? 'fridge' : 'pantry'
    if (!selectedFoodIds.value.has(item.id)) selectedFoodIds.value = new Set([item.id])
    if (event) {
        dragPosition.value = { x: event.clientX, y: event.clientY }
        dragAnchor.value = foodActionAnchor(item, event)
    }
    foodTooltip.value = null
    draggedItemId.value = item.id
    draggingFromModal.value = false
    draggingOutsideModal.value = false
}

let touchDrag
let holdTimer

function clearTouchDrag() {
    clearTimeout(holdTimer)
    touchDrag = null
}
onBeforeUnmount(clearTouchDrag)

function holdFood(event) {
    foodTooltip.value = null
    if (event.touches.length !== 1) {
        if (touchDrag?.active) finishDrag()
        clearTouchDrag()
        return
    }
    const icon = event.target.closest('[data-food-id]')
    const item = items.value.find(food => food.id === icon?.dataset.foodId)
    if (!item || draggedItemId.value || shiftingFood.value || actionPending.value) return
    const { identifier, clientX, clientY } = event.touches[0]
    touchDrag = { identifier, clientX, clientY, active: false }
    holdTimer = setTimeout(() => {
        touchDrag.active = true
        startDrag(item, { currentTarget: icon, clientX, clientY })
        dragAnchor.value = { ...dragAnchor.value, touch: true }
    }, 350)
}

function moveHeldFood(event) {
    if (!touchDrag) return
    const touch = Array.from(event.touches).find(point => point.identifier === touchDrag.identifier)
    if (!touch) return
    const { clientX, clientY } = touch
    if (!touchDrag.active) {
        if (Math.hypot(clientX - touchDrag.clientX, clientY - touchDrag.clientY) > 9) clearTouchDrag()
        return
    }
    event.preventDefault()
    trackFoodDrag({ clientX, clientY, target: document.elementFromPoint(clientX, clientY) ?? event.target })
}

function releaseHeldFood(event) {
    if (!touchDrag) return
    const touch = Array.from(event.changedTouches).find(point => point.identifier === touchDrag.identifier)
    if (!touch && event.type !== 'touchcancel') return
    const active = touchDrag.active
    clearTouchDrag()
    if (!active) return
    if (event.type === 'touchcancel') {
        finishDrag()
        return
    }
    event.preventDefault()
    const { clientX, clientY } = touch
    const hit = document.elementFromPoint(clientX, clientY)
    const action = hit?.closest('[data-food-action]')
    const compartment = hit?.closest('[data-drop-zone]')
    const drop = { clientX, clientY, preventDefault() {}, currentTarget: action ?? compartment }
    if (action) dropOnAction(action.dataset.foodAction, drop)
    else if (compartment && kitchenStage.value?.contains(compartment)) {
        dropOnArea({ storage: compartment.dataset.dropStorage, storageZone: compartment.dataset.dropZone }, drop)
    } else finishDrag()
}

function startModalDrag(item, event) {
    storageAction.value = item.storage === 'pantry' ? 'fridge' : 'pantry'
    if (!selectedFoodIds.value.has(item.id)) selectedFoodIds.value = new Set([item.id])
    if (event) {
        dragPosition.value = { x: event.clientX, y: event.clientY }
        dragAnchor.value = foodActionAnchor(item, event)
        setEmojiDragImage(event)
    }
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
    foodTooltip.value = null
    draggedItemId.value = null
    dragPlacement.value = ''
    dragPosition.value = null
    draggingFromModal.value = false
    draggingOutsideModal.value = false
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
    dropOnArea({ storage, storageZone, targetElement: target }, event)
}

function selectedFoodsFor(item) {
    return selectedFoodIds.value.has(item.id)
        ? items.value.filter(food => selectedFoodIds.value.has(food.id)) : [item]
}

async function saveFoodGroup(group, method, payload) {
    const results = await Promise.allSettled(group.map(async item => {
        const itemPayload = typeof payload === 'function' ? payload(item) : payload
        const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
            method, credentials: 'include',
            ...(itemPayload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemPayload) } : {}),
        })
        if (!response.ok) throw new Error(`Could not update ${item.name}.`)
        if (method === 'DELETE') return item
        const data = await response.json()
        const savedApiItem = data.item || data
        return normaliseItem(savedApiItem)
    }))
    const succeeded = new Set()
    const updates = new Map()
    results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        const id = group[index].id
        succeeded.add(id)
        updates.set(id, result.value)
    })
    // Commit the whole group once so an embedded parent's props cannot lag between items.
    if (succeeded.size) items.value = method === 'DELETE'
        ? items.value.filter(item => !succeeded.has(item.id))
        : items.value.map(item => updates.get(item.id) || item)
    if (method === 'PATCH') {
        const moved = group.filter(item => {
            const updated = updates.get(item.id)
            return updated && (updated.storage !== item.storage || updated.storageZone !== item.storageZone)
        }).map(item => updates.get(item.id))
        if (moved.length) showMovedStorageAdvice(moved)
    }
    selectedFoodIds.value = new Set([...selectedFoodIds.value].filter(id => !succeeded.has(id)))
    const failed = results.filter(result => result.status === 'rejected').length
    if (failed) errorMessage.value = `${failed} food item(s) could not be updated. They remain selected; please try again.`
    return succeeded
}

function otherStorageOptions(item) {
    const type = item.storage === 'pantry' ? 'pantry' : 'fridge'
    return storageOptions.value.filter(option => option.type !== type)
}

async function moveToStorage({ item, destination }) {
    if (shiftingFood.value || actionPending.value || saving.value) return
    if (!otherStorageOptions(item).some(option => option.type === destination.type && option.name === destination.name)) return
    const payload = {
        storage: destination.type,
        storageZone: destination.type === 'pantry' ? 'dry-storage' : 'middle-shelf',
    }
    errorMessage.value = ''
    shiftingFood.value = true
    try {
        await saveFoodGroup([item], 'PATCH', payload)
    } finally {
        shiftingFood.value = false
    }
}

async function changeSelectedFoods(group, action, onAnimationSuccess) {
    const confirmed = await showConfirm({
        title: `${action === 'consume' ? 'Consume' : 'Discard'} ${group.length} selected foods?`,
        message: `This uses the full amount of each selected food: ${group.map(item => `${item.name} (${amountLabel(item)})`).join(', ')}.`,
        confirmLabel: action === 'consume' ? 'Consume all' : 'Discard all',
        danger: action === 'discard',
    })
    if (!confirmed) return
    errorMessage.value = ''
    actionPending.value = true
    try {
        const succeeded = await saveFoodGroup(group, 'DELETE', { activity: action === 'consume' ? 'consumed' : 'discarded' })
        if (succeeded.size && typeof onAnimationSuccess === 'function') onAnimationSuccess({ proportion: 1 })
    } finally { actionPending.value = false }
}

async function dropOnArea(area, event, onSuccess) {
    event.preventDefault()
    if (shiftingFood.value || actionPending.value) return
    const itemId = event.dataTransfer?.getData('text/plain') || draggedItemId.value
    const item = items.value.find(food => food.id === String(itemId))
    if (!item) { finishDrag(); return }
    // Resolve both fields from the exact destination zone so they cannot drift
    // apart when an item is moved between fridge, freezer and pantry.
    // All three visual rows belong to the same shelves location.
    const requestedZone = area.storageZone
    const storageZone = storageForZone(requestedZone) ? requestedZone : defaultZoneFor(area.storage)
    const storage = storageForZone(storageZone) || area.storage
    const group = selectedFoodsFor(item).filter(food => food.storage !== storage || food.storageZone !== storageZone)
    const origins = foodTransfer.capture(group, event)
    if (draggingFromModal.value) selectedCompartment.value = null
    finishDrag()
    if (!group.length) return
    errorMessage.value = ''
    shiftingFood.value = true
    if (onSuccess) actionPending.value = true
    try {
        const destination = { storage, storageZone }
        const succeeded = await saveFoodGroup(group, 'PATCH', destination)
        if (succeeded.size) showStorage(storage)
        await foodTransfer.play(origins, succeeded, locationLabel({ storage, storageZone }))
        if (succeeded.size) onSuccess?.()
    }
    finally { shiftingFood.value = false; if (onSuccess) actionPending.value = false; finishDrag() }
}

// ============================================================
// 9. SIMPLE STORAGE RECOMMENDATIONS
// ============================================================

// Prefer the per-item guidance stored with inventory; retain lightweight
// keyword hints for older or manually entered records without that guidance.
function getRecommendation(item) {
    return item.storageGuidanceIgnored ? '' : storageAdvice(item)
}

function storageAdvice(item) {
    const allowedLocations = Array.isArray(item.allowedLocations) && item.allowedLocations.length
        ? item.allowedLocations : storageForZone(item.suggestedLocation) ? [item.suggestedLocation] : []
    if (allowedLocations.includes(item.storageZone)) return ''
    if (allowedLocations.length > 0 && !allowedLocations.includes(item.storageZone)) {
        const zoneLabels = {
            'upper-shelf': 'Shelves', 'middle-shelf': 'Shelves',
            'lower-shelf': 'Shelves', door: 'Upper door shelf',
            'door-lower': 'Lower door shelf', crisper: 'Crisper drawer',
            'freezer-main': 'Freezer', 'dry-storage': 'Pantry'
        }
        const allowedNames = allowedLocations.map(zone => zoneLabels[zone] || zone).join(', ')
        const suggestedName = zoneLabels[item.suggestedLocation] || item.suggestedLocation
        return `Storage warning: ${item.name} is in ${locationLabel(item)}, but its allowed locations are ${allowedNames}.${suggestedName ? ` Suggested: ${suggestedName}.` : ''}${item.locationReason ? ` ${item.locationReason}` : ''}`
    }

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
    filteredItems.value.filter(item =>
        (!props.embedded || item.storage !== 'pantry') && getRecommendation(item)
    )
)
const ignoredStorageRecommendations = computed(() =>
    filteredItems.value.filter(item => item.storageGuidanceIgnored && storageAdvice(item))
)
const movedStorageAdviceIds = ref([])
const movedStorageWarnings = computed(() => items.value.filter(item => movedStorageAdviceIds.value.includes(item.id) && getRecommendation(item)))
function showMovedStorageAdvice(moved) {
    movedStorageAdviceIds.value = moved.filter(item => getRecommendation(item)).map(item => item.id)
}
const arrangingFoodIds = ref(new Set())
const arrangementError = ref('')
const confirmingGuidanceAction = ref(false)
const guidanceBusy = computed(() => shiftingFood.value || saving.value || actionPending.value || confirmingGuidanceAction.value)

function guidanceDestination(item) {
    if (!getRecommendation(item)) return null
    const allowed = (item.allowedLocations.length ? item.allowedLocations : [item.suggestedLocation]).filter(zone => storageForZone(zone))
    let zone = allowed.length
        ? allowed.includes(item.suggestedLocation) ? item.suggestedLocation : allowed[0]
        : null
    if (!zone) {
        const name = item.name.toLowerCase()
        if (name.includes('frozen') || name.includes('ice cream')) zone = 'freezer-main'
        else if (['rice', 'pasta', 'cereal', 'flour'].some(word => name.includes(word))) zone = 'dry-storage'
    }
    const storage = storageForZone(zone)
    if (!storage || (storage === item.storage && zone === item.storageZone)) return null
    return { storage, storageZone: zone }
}

function guidanceDestinationLabel(item) {
    const destination = guidanceDestination(item)
    if (!destination) return ''
    return `${itemStorageName(destination)} · ${locationLabel(destination)}`
}

const arrangeableFoods = computed(() => storageRecommendations.value.filter(item => guidanceDestination(item)))

async function confirmArrangeAll() {
    if (guidanceBusy.value || !arrangeableFoods.value.length) return
    const foods = [...arrangeableFoods.value]
    confirmingGuidanceAction.value = true
    let confirmed
    try {
        confirmed = await showConfirm({
            title: 'Arrange all displayed items?',
            message: `Move ${foods.length} displayed item(s) to their recommended storage locations?`,
            confirmLabel: 'Arrange all',
        })
    } finally { confirmingGuidanceAction.value = false }
    if (confirmed) await arrangeGuidance(foods)
}

async function arrangeGuidance(group = arrangeableFoods.value) {
    if (guidanceBusy.value) return
    const destinations = new Map(group.map(item => [item.id, guidanceDestination(item)]))
    const foods = group.filter(item => destinations.get(item.id))
    if (!foods.length) return
    errorMessage.value = ''
    arrangementError.value = ''
    arrangingFoodIds.value = new Set(foods.map(item => item.id))
    selectedFoodIds.value = new Set([...selectedFoodIds.value, ...arrangingFoodIds.value])
    shiftingFood.value = true
    try {
        await saveFoodGroup(foods, 'PATCH', item => destinations.get(item.id))
        arrangementError.value = errorMessage.value
    } finally {
        shiftingFood.value = false
        arrangingFoodIds.value = new Set()
    }
}

async function setGuidanceIgnored(item, ignored) {
    return saveGuidancePreferences([item], ignored)
}

async function saveGuidancePreferences(group, ignored) {
    if (guidanceBusy.value) return
    saving.value = true
    errorMessage.value = ''
    arrangementError.value = ''
    const previousSelection = new Set(selectedFoodIds.value)
    try {
        await saveFoodGroup(group, 'PATCH', { storageGuidanceIgnored: ignored })
        selectedFoodIds.value = new Set([...selectedFoodIds.value, ...previousSelection])
        arrangementError.value = errorMessage.value
        foodTooltip.value = null
        movedStorageAdviceIds.value = []
    } finally { saving.value = false }
}

async function ignoreAllGuidance() {
    if (guidanceBusy.value || !storageRecommendations.value.length) return
    const foods = [...storageRecommendations.value]
    confirmingGuidanceAction.value = true
    let confirmed
    try {
        confirmed = await showConfirm({
            title: 'Ignore all displayed storage guidance?',
            message: `Hide storage guidance for ${foods.length} displayed item(s)? Expiry warnings will stay visible. You can restore guidance under Ignored guidance.`,
            confirmLabel: 'Ignore all',
        })
    } finally { confirmingGuidanceAction.value = false }
    if (confirmed) await saveGuidancePreferences(foods, true)
}

// Display a count when recorded, otherwise show the item's optional total weight.
function amountLabel(item) {
    const quantity = Number(item.quantity)
    if (Number.isFinite(quantity) && quantity > 0) return `${item.quantity} ${item.unit || 'items'}`
    const weight = Number(item.weightKg)
    if (Number.isFinite(weight) && weight > 0) return `${item.weightKg} kg`
    return 'Quantity not recorded'
}

function dietTypeLabel(dietType) {
    return ({
        vegan: 'Vegan',
        vegetarian: 'Vegetarian',
        other: 'Contains meat or fish',
        unknown: 'Check the label',
    })[dietType] || ''
}

function foodDescription(item) {
    return [expiryBadge(item), getRecommendation(item)].filter(Boolean).join('. ')
}

// ============================================================
// 10. CAROUSEL, COMPARTMENT DETAILS, EXPIRY PANEL AND ACTION ZONES
// ============================================================

const doorAngle = ref(0)
const doorGesture = ref(null)
let ignoreDoorClick = false
const fridgeDoorOpen = computed({ get: () => doorAngle.value > 85, set: (open) => { doorAngle.value = open ? 170 : 0 } })
const fridgeLightOn = computed(() => doorAngle.value > 25)
const selectedCompartment = ref(null)
const expiryPanelOpen = ref(false)
function startDoorGesture(event) {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('.door-bin, .fridge-close-button, [draggable="true"]')) return
    ignoreDoorClick = false
    doorGesture.value = { x: event.clientX, angle: doorAngle.value, width: event.currentTarget.closest('.fridge-body').getBoundingClientRect().width, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDoorGesture(event) {
    const gesture = doorGesture.value
    if (!gesture) return
    const delta = event.clientX - gesture.x
    if (Math.abs(delta) > 6) gesture.moved = true
    if (gesture.moved) doorAngle.value = Math.max(0, Math.min(170, gesture.angle + delta / Math.max(gesture.width, 1) * 170))
}
function endDoorGesture(event, cancelled = false) {
    const gesture = doorGesture.value
    if (!gesture) return
    doorGesture.value = null
    ignoreDoorClick = gesture.moved
    if (gesture.moved) doorAngle.value = cancelled ? gesture.angle : doorAngle.value >= 60 ? 170 : 0
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancelled && gesture.moved && gesture.angle <= 85 && fridgeDoorOpen.value) centerFridge()
}
function toggleDoor() {
    if (ignoreDoorClick) { ignoreDoorClick = false; return }
    fridgeDoorOpen.value = !fridgeDoorOpen.value
    if (fridgeDoorOpen.value) centerFridge()
}

async function centerFridge() {
    await nextTick()
    const cabinet = kitchenStage.value?.querySelector('.fridge-cabinet')
    cabinet?.scrollIntoView?.({
        block: 'center',
        inline: 'nearest',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
}

function openCompartment(compartment) {
    if (props.embedded && router) {
        finishDrag()
        const query = { location: compartment.zone }
        router.push({ name: 'fridge', query })
        return
    }
    // Clear any drag that ended while its source card was being unmounted.
    finishDrag()
    cancelActionReaction()
    showStorage(compartment.storage)
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
            return item.storage === 'fridge' && (compartment.zone === 'middle-shelf'
                ? ['upper-shelf', 'middle-shelf', 'lower-shelf'].includes(item.storageZone)
                : item.storageZone === compartment.zone)
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
const compartmentStatus = computed(() => ({
    expired: compartmentItems.value.filter(item => expiryBadge(item) === 'Expired').length,
    soon: compartmentItems.value.filter(item => expiryBadge(item) === 'Expiring soon').length,
}))

function itemCount(compartment) {
    return itemsForCompartment(compartment).length
}


function expiryBadge(item) {
    const days = expiryDays(item)
    if (days === null || days > 3) return null
    return days < 0 ? 'Expired' : 'Expiring soon'
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
const discardingExpired = ref(false)

async function discardExpiredFoods() {
    if (discardingExpired.value || !expiryItems.value.length) return
    discardingExpired.value = true
    try {
        const confirmed = await showConfirm({
            title: 'Discard all expired food?',
            message: 'This removes the full quantities of expired foods across all fridges and pantries.',
            confirmLabel: 'Discard all expired food',
            danger: true,
        })
        if (!confirmed) return
        errorMessage.value = ''
        const expired = [...expiryItems.value]
        const discarded = await saveFoodGroup(expired, 'DELETE', { activity: 'discarded' })
        if (discarded.size < expired.length) {
            errorMessage.value = 'Some expired foods could not be discarded. Please try again.'
        }
    } finally {
        discardingExpired.value = false
    }
}

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
        'upper-shelf': 'Shelves',
        'middle-shelf': 'Shelves',
        'lower-shelf': 'Shelves',
        door: 'Upper door shelf',
        'door-lower': 'Lower door shelf',
        crisper: 'Crisper drawer'
    }
    return names[item.storageZone] || 'Main fridge'
}

async function showSavedItems(foods) {
    await jumpToItem(foods[0])
    selectedFoodIds.value = new Set(foods.map(item => item.id))
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        for (const icon of kitchenStage.value?.querySelectorAll('[data-food-id]') || []) {
            if (selectedFoodIds.value.has(icon.dataset.foodId)) {
                icon.animate?.([{ rotate: '-7deg' }, { rotate: '7deg' }, { rotate: '0deg' }],
                    { duration: 500, delay: 450, easing: 'ease-in-out' })
            }
        }
    }
}

function highlightFood(id) {
    const item = items.value.find(food => food.id === id)
    if (item) return jumpToItem(item)
}
defineExpose({ highlightFood })
const revealedFoodId = ref(null)
let revealTimer
onBeforeUnmount(() => clearTimeout(revealTimer))

async function jumpToItem(item) {
    selectedCompartment.value = null
    finishDrag()
    expiryPanelOpen.value = false
    searchQuery.value = ''
    const type = item.storage === 'pantry' ? 'pantry' : 'fridge'
    selectStorage({ type })
    if (type === 'fridge') fridgeDoorOpen.value = true
    await nextTick()

    const icon = [...(kitchenStage.value?.querySelectorAll('[data-food-id]') || [])]
        .find(element => element.dataset.foodId === item.id)
    if (!icon) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    icon.scrollIntoView?.({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center', inline: 'nearest' })
    icon.focus({ preventScroll: true })
    selectedFoodIds.value = new Set([item.id])
    clearTimeout(revealTimer)
    revealedFoodId.value = item.id
    revealTimer = setTimeout(() => { revealedFoodId.value = null }, 3500)
    if (!reduceMotion) {
        icon.animate?.(
            [{ rotate: '0deg' }, { rotate: '-9deg' }, { rotate: '8deg' }, { rotate: '-5deg' }, { rotate: '0deg' }],
            { duration: 520, delay: 450, easing: 'ease-in-out' },
        )
    }
}

async function dropOnAction(action, event) {
    event.preventDefault()
    if (action === 'pantry' || action === 'fridge') {
        const requestId = ++actionReactionRequestId
        await dropOnArea({ storage: action, storageZone: action === 'fridge' ? 'middle-shelf' : 'dry-storage' }, event,
            () => triggerActionReaction(action, requestId))
        return
    }
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
    // Keep the targets visible while quantity confirmation and saving are in progress.
    actionPending.value = true
    finishDrag()
    const reactionTarget = droppedInsideDialog ? `modal-${action}` : action
    const reactionRequestId = ++actionReactionRequestId
    const reactAfterSuccess = () => triggerActionReaction(reactionTarget, reactionRequestId)
    try {
        if (action === 'consume') await consumeItem(item, reactAfterSuccess)
        else await discardItem(item, reactAfterSuccess)
    } finally { actionPending.value = false }
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

onBeforeUnmount(cancelActionReaction)

</script>

<template>
    <div class="fridge-page-shell" :class="{ 'is-embedded': embedded }"><div class="smart-fridge-page">
        <p v-if="loading" class="status-message" role="status">
            Loading your saved inventory from MongoDB...
        </p>

        <div v-if="errorMessage" class="status-message error-message" role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadInventory">Retry loading inventory</button>
        </div>

        <!-- The paper hero makes the page title and main action read like the other feature pages. -->
        <header v-if="!embedded" class="page-header paper hero fc-page-heading">
            <div>
                <p class="eyebrow">FULL CIRCLE · INVENTORY MANAGEMENT</p>
                <h1>My Smart Kitchen</h1>
                <p class="page-description">Switch between your fridge and pantry. Keep food visible, fresh and organised.</p>
            </div>
            <div class="header-actions">
                <span class="hero-doodle" aria-hidden="true"><FoodIcon kind="ice" /></span>
                <div class="expiry-dropdown"
                    @pointerenter="$event.pointerType === 'mouse' && (expiryPanelOpen = true)"
                    @pointerleave="leaveExpiryDropdown"
                    @focusout="!discardingExpired && !$event.currentTarget.contains($event.relatedTarget) && (expiryPanelOpen = false)"
                    @keydown.esc.stop.prevent="closeExpiryPanel">
                    <button ref="expiryTrigger" type="button" class="expiry-button"
                        :aria-expanded="expiryPanelOpen" aria-controls="expired-food-dropdown"
                        @click="expiryPanelOpen = !expiryPanelOpen">
                        <NoticeIcon name="bell" /> Expired <span class="expiry-count">{{ expiryItemCount }}</span>
                    </button>
                    <div v-if="expiryPanelOpen" class="expiry-dropdown-position">
                        <section id="expired-food-dropdown" class="inventory-modal expiry-dropdown-panel" aria-labelledby="expiry-title">
                <header class="modal-heading">
                    <div><p class="eyebrow">REDUCE FOOD WASTE</p><h2 id="expiry-title"><NoticeIcon name="bell" /> Expired Food</h2><p>Food past its expiry date across your fridge, freezer and pantry.</p></div>
                    <button type="button" class="modal-close" aria-label="Close expiry panel" @click="closeExpiryPanel">✕</button>
                </header>
                <button v-if="expiryItems.length" type="button" class="expiry-button mb-3"
                    :disabled="discardingExpired" @click="discardExpiredFoods">
                    {{ discardingExpired ? 'Discarding…' : 'Discard all expired food' }}
                </button>
                <div v-if="expiryItems.length" class="modal-food-list">
                    <button v-for="item in expiryItems" :key="item.id" type="button" class="expiry-food-row" @click="jumpToItem(item)">
                        <span class="modal-food-emoji"><FoodIcon :name="item.name" /><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                        <span class="modal-food-info">
                            <strong>{{ item.name }}</strong>
                            <span>{{ itemStorageName(item) }}<template v-if="item.storage !== 'pantry'"> · {{ locationLabel(item) }}</template> · {{ amountLabel(item) }}</span>
                        </span>
                        <span class="expiry-label" :class="{ 'is-expired': expiryDays(item) < 0 }">{{ expiryLabel(item) }}</span>
                        <span aria-hidden="true">›</span>
                    </button>
                </div>
                <div v-else class="modal-empty"><span>✨</span><strong>No expired food right now</strong><p>Nothing in your fridge, freezer or pantry is past its expiry date.</p></div>
                        </section>
                    </div>
                </div>
                <RouterLink :to="{ name: 'scanning' }" class="primary-button">
                    ＋ Add Food
                </RouterLink>
            </div>
        </header>

        <nav v-if="embedded && storageOptions.length > 1"
            class="dashboard-fridge-switch" aria-label="Switch dashboard storage">
            <button type="button" class="storage-slide-arrow" aria-label="Previous storage"
                :disabled="shiftingFood || actionPending" @click="stepStorage(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg></button>
            <span :key="currentStorage.label" class="dashboard-fridge-name storage-switch-pulse"
                role="status" :title="currentStorage.label">{{ currentStorage.label }}</span>
            <button type="button" class="storage-slide-arrow" aria-label="Next storage"
                :disabled="shiftingFood || actionPending" @click="stepStorage(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" /></svg></button>
        </nav>
        <nav v-if="!embedded" class="storage-switcher" aria-label="Storage slideshow">
            <button type="button" class="storage-slide-arrow" aria-label="Previous storage" :disabled="shiftingFood || saving" @click="stepStorage(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg></button>
            <div class="storage-slide-options fridge-switcher-options">
                <button v-for="(option, index) in storageOptions" :key="option.type + ':' + option.name" type="button"
                    :disabled="shiftingFood || saving" :aria-pressed="storageIndex === index"
                    @click="selectStorage(option)">{{ option.label }}</button>
                <span :key="storageIndex" class="storage-slide-status storage-switch-pulse" role="status">{{ storageIndex + 1 }} / {{ storageOptions.length }}</span>

            </div>
            <button type="button" class="storage-slide-arrow" aria-label="Next storage" :disabled="shiftingFood || saving" @click="stepStorage(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" /></svg></button>
        </nav>
        <section ref="kitchenStage" class="kitchen-stage storage-slideshow" :class="{ 'instant-storage-slide': !animateStorageSlide }" aria-label="Food storage" @pointerdown.capture="beginFoodSelection" @click.capture="stopSelectionClick" @dblclick.capture="openFoodCompartment" @keydown.capture="selectFoodWithKeyboard" @dragstart.capture="setStageEmojiDragImage($event)"
            @touchstart.passive="holdFood" @touchmove="moveHeldFood" @touchend="releaseHeldFood" @touchcancel="releaseHeldFood"
            @contextmenu="touchDrag && $event.target.closest('[data-food-id]') && $event.preventDefault()">


            <div class="carousel-window">
                <div class="carousel-track">
                    <!-- Refrigerator unit -->
                    <section class="storage-unit fridge-unit" :class="{ 'slide-active': activeStorage === 'fridge' }" :inert="activeStorage !== 'fridge' ? true : undefined" :aria-hidden="activeStorage !== 'fridge'" aria-label="Refrigerator">
                        <div class="storage-unit-content" :class="{ 'storage-switch-pulse': animateStorageSlide }">
                        <div v-if="!embedded" class="unit-top-label"><span>❄️</span> FRESH &amp; CHILLED</div>
                        <button v-if="fridgeDoorOpen" type="button" class="mobile-fridge-close" @click="toggleDoor">Close fridge</button>
                        <div class="fridge-body" :class="{ 'fridge-is-open': fridgeDoorOpen, 'door-moving': doorGesture?.moved, 'light-on': fridgeLightOn, 'fridge-is-idle': embedded && doorAngle === 0 && !doorGesture }" :style="{ '--door-angle': `${doorAngle}deg`, '--open-progress': doorAngle / 170 }">
                            <div class="fridge-cabinet">
                                <div v-for="side in (fridgeLightOn ? ['left', 'right'] : [])" :key="side" class="cold-air" :class="`cold-air-${side}`" aria-hidden="true">
                                    <svg v-for="n in 3" :key="n" class="cold-air-puff" :style="{ '--puff-index': n - 1 }" viewBox="0 0 150 100">
                                        <path class="cold-air-cloud" d="M12 63 C-1 52 6 34 22 35 C18 16 45 8 56 25 C69 6 99 15 98 35 C122 24 141 42 130 59 C151 71 133 91 114 82 C95 99 75 89 68 83 C45 97 23 83 28 74 C19 77 12 72 12 63Z" />
                                        <path class="cold-air-curl" d="M13 57 H60 C85 57 90 31 73 31 C59 31 59 47 70 47 M27 72 H96 C115 72 119 51 106 49" />
                                        <path class="cold-air-spark" d="M119 12 V30 M110 21 H128 M113 15 L125 27 M113 27 L125 15" />
                                    </svg>
                                    <span v-for="n in 4" :key="'flake-' + n" class="cold-air-flake" :style="{ '--flake-index': n - 1 }">❄</span>
                                </div>
                                <div class="fridge-interior" :inert="!fridgeDoorOpen">
                                    <div class="interior-header">
                                        <input v-if="!embedded" ref="fridgeSearch" v-model="searchQuery" class="storage-search" type="search"
                                            aria-label="Search fridge food" placeholder="Search food…">
                                        <span v-else>YOUR FRIDGE</span>
                                        <button v-if="!embedded" type="button" class="storage-search-clear"
                                            :disabled="!searchQuery" @click="searchQuery = ''; fridgeSearch?.focus()">Clear</button>
                                        <span class="temperature">❄ 4°C</span>
                                    </div>
                                    <div class="fridge-compartments">
                                        <button type="button" class="compartment freezer-compartment" @wheel="scrollCompartment" data-drop-storage="freezer" data-drop-zone="freezer-main" @click="openCompartment({ id: 'freezer', title: 'Freezer', storage: 'freezer', zone: 'freezer-main' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'freezer', storageZone: 'freezer-main' }, $event)">
                                            <span class="compartment-heading"><span><FoodIcon kind="ice" /> Freezer</span><small>{{ countItems('freezer') }} items</small></span>
                                            <span class="food-preview">
                                                <span v-for="item in itemsInZone('freezer', 'freezer-main')" :key="item.id" class="mini-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                                <span v-if="itemsInZone('freezer', 'freezer-main').length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
                                            </span>
                                        </button>

                                        <button v-for="compartment in [
                                            { id: 'main-fridge', title: 'Shelves', storage: 'fridge', zone: 'middle-shelf', icon: 'milk' }
                                        ]" :key="compartment.id" type="button" class="compartment shelf-compartment" @wheel="scrollCompartment" :data-drop-storage="compartment.storage" :data-drop-zone="compartment.zone" @click="openCompartment(compartment)" @dragover.prevent @drop.stop="dropOnArea({ storage: compartment.storage, storageZone: compartment.zone }, $event)">
                                            <span class="compartment-heading"><span><FoodIcon :kind="compartment.icon" /> {{ compartment.title }}</span><small>{{ itemCount(compartment) }} items</small></span>
                                            <span class="food-preview">
                                                <span v-for="item in itemsInZone(compartment.storage, compartment.zone)" :key="item.id" class="mini-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                                <span v-if="itemsInZone(compartment.storage, compartment.zone).length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
                                            </span>
                                        </button>

                                        <div class="fridge-bottom">
                                            <button type="button" class="compartment crisper-compartment" @wheel="scrollCompartment" data-drop-storage="fridge" data-drop-zone="crisper" @click="openCompartment({ id: 'crisper', title: 'Crisper drawer', storage: 'fridge', zone: 'crisper', icon: 'leafy' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'crisper' }, $event)">
                                                <span class="compartment-heading"><span><FoodIcon kind="leafy" /> Crisper drawer</span> <small>{{ itemsInZone('fridge', 'crisper').length }} items</small></span>
                                                <span class="food-preview">
                                                <span v-for="item in itemsInZone('fridge', 'crisper')" :key="item.id" class="mini-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                                    <span v-if="itemsInZone('fridge', 'crisper').length === 0" class="empty-mini">{{ searchQuery ? 'No matches' : 'Empty' }}</span>
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="fridge-door" :class="{ 'door-open': fridgeDoorOpen }" role="button" tabindex="0" :aria-expanded="fridgeDoorOpen" :aria-label="fridgeDoorOpen ? 'Close refrigerator door' : 'Open refrigerator door'" @click="toggleDoor" @pointerdown="startDoorGesture" @pointermove="moveDoorGesture" @pointerup="endDoorGesture" @pointercancel="endDoorGesture($event, true)" @lostpointercapture="endDoorGesture($event, true)" @keydown.enter.self.prevent="toggleDoor" @keydown.space.self.prevent="toggleDoor">
                                    <span class="door-brand" :title="fridgeDoorTitle">{{ fridgeDoorTitle }}</span>
                                    <span v-if="!fridgeDoorOpen" class="closed-fridge-dashboard" aria-label="Fridge inventory summary">
                                        <span class="dashboard-title">FRIDGE STATUS</span>
                                        <span class="dashboard-stat"><strong>{{ totalItems }}</strong><small>Total tracked</small></span>
                                        <span class="dashboard-stat"><strong>{{ countItems('fridge') + countItems('freezer') }}</strong><small>Fridge &amp; freezer</small></span>
                                        <span class="dashboard-stat dashboard-expired"><strong>{{ expiredCount }}</strong><small>Expired</small></span>
                                        <span class="dashboard-stat dashboard-soon"><strong>{{ expiringSoonCount }}</strong><small>Expiring soon</small></span>
                                    </span>
                                    <span class="door-handle"></span>
                                    <span class="door-hint">{{ fridgeDoorOpen ? 'DOOR OPEN' : 'OPEN FRIDGE' }}</span>
                                    <span class="door-inner" :inert="!fridgeDoorOpen">
                                        <span class="door-inner-title">DOOR SHELVES</span>
                                        <span class="door-bin" @wheel="scrollCompartment" data-drop-storage="fridge" data-drop-zone="door" role="button" tabindex="0" aria-label="Upper door shelf" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)" @click.stop="openCompartment({ id: 'door', title: 'Upper door shelf', storage: 'fridge', zone: 'door' })" @keydown.enter.stop="openCompartment({ id: 'door', title: 'Upper door shelf', storage: 'fridge', zone: 'door' })" @keydown.space.prevent.stop="openCompartment({ id: 'door', title: 'Upper door shelf', storage: 'fridge', zone: 'door' })">
                                            <span v-for="item in itemsInZone('fridge', 'door')" :key="item.id" class="door-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                            <span v-if="itemsInZone('fridge', 'door').length === 0" class="door-empty">{{ searchQuery ? 'No matches' : 'Empty shelf' }}</span>
                                        </span>
                                        <span class="door-bin door-bin-small" @wheel="scrollCompartment" data-drop-storage="fridge" data-drop-zone="door-lower" role="button" tabindex="0" aria-label="Lower door shelf" @dragover.prevent @drop.stop="dropOnArea({ storage: 'fridge', storageZone: 'door-lower' }, $event)" @click.stop="openCompartment({ id: 'door-lower', title: 'Lower door shelf', storage: 'fridge', zone: 'door-lower' })" @keydown.enter.stop="openCompartment({ id: 'door-lower', title: 'Lower door shelf', storage: 'fridge', zone: 'door-lower' })" @keydown.space.prevent.stop="openCompartment({ id: 'door-lower', title: 'Lower door shelf', storage: 'fridge', zone: 'door-lower' })">
                                            <span v-for="item in itemsInZone('fridge', 'door-lower')" :key="item.id" class="door-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                            <span v-if="itemsInZone('fridge', 'door-lower').length === 0" class="door-empty">{{ searchQuery ? 'No matches' : 'Empty shelf' }}</span>
                                        </span>
                                        <span v-if="fridgeDoorOpen" class="fridge-close-button" role="button" tabindex="0" aria-label="Close refrigerator door" @click.stop="fridgeDoorOpen = false" @keydown.enter.stop="fridgeDoorOpen = false" @keydown.space.prevent.stop="fridgeDoorOpen = false">✕ Close door</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                        </div>

                    </section>

                    <!-- Pantry unit -->
                    <section v-if="!embedded || activeStorage === 'pantry'" class="storage-unit pantry-unit" :class="{ 'slide-active': activeStorage === 'pantry' }" :inert="activeStorage !== 'pantry' ? true : undefined" :aria-hidden="activeStorage !== 'pantry'" aria-label="Pantry">
                        <input v-if="!embedded && activeStorage === 'pantry'" v-model="searchQuery" class="storage-search pantry-search" type="search"
                            aria-label="Search pantry food" placeholder="Search food…">
                        <div class="storage-unit-content" :class="{ 'storage-switch-pulse': animateStorageSlide }">
                        <div class="unit-top-label pantry-label">{{ countItems('pantry') }} pantry items · Four open shelves</div>
                        <div class="pantry-cabinet pantry-single-storage open-pantry">
                            <div class="open-pantry-shelves">
                            <button v-for="(shelf, index) in pantryShelves" :key="index" type="button" class="pantry-shelf pantry-whole-storage" :aria-label="`Pantry shelf ${index + 1}, ${shelf.length} foods. View pantry items`" @wheel="scrollCompartment" data-drop-storage="pantry" data-drop-zone="dry-storage" @click="openCompartment({ id: 'pantry', title: 'Pantry', storage: 'pantry', zone: 'dry-storage' })" @dragover.prevent @drop.stop="dropOnArea({ storage: 'pantry', storageZone: 'dry-storage' }, $event)">
                                <span class="pantry-foods pantry-all-foods">
                                <span v-for="item in shelf" :key="item.id" class="mini-food" :data-food-id="item.id" tabindex="0" role="button" :aria-pressed="selectedFoodIds.has(item.id)" :class="{ 'food-being-dragged': draggedItemId === item.id, 'food-selected': selectedFoodIds.has(item.id), 'food-location-highlight': revealedFoodId === item.id }" :title="item.name" :aria-label="item.name" :aria-description="foodDescription(item)" @pointerenter="$event.pointerType === 'mouse' && showFoodName(item, $event)" @pointerleave="foodTooltip = null" draggable="true" @dragstart="startDrag(item, $event); $event.dataTransfer.setData('text/plain', String(item.id))" @dragend="finishDrag"><FoodIcon :item="item" /><span v-if="expiryBadge(item)" class="food-expiry-badge" :class="{ expired: expiryBadge(item) === 'Expired' }" aria-hidden="true">!</span><span v-else-if="getRecommendation(item)" class="food-storage-badge" aria-hidden="true">!</span><span v-if="Number(item.quantity) > 1" class="food-quantity-badge">×{{ item.quantity }}</span></span>
                                </span>
                            </button>
                            </div>
                        </div>
                        <p class="unit-caption">{{ searchQuery && !pantryShelves.some(shelf => shelf.length) ? 'No pantry foods match your search.' : 'Click a shelf to view pantry items · Drag empty space to select foods' }}</p>
                        </div>

                    </section>
                </div>
            </div>


        </section>



        <section v-if="!embedded" class="storage-hint">
            <span><NoticeIcon name="sparkle" /></span>
            <p><strong>Tip:</strong> Food closest to its expiry date appears first. Click any shelf or drawer to see its complete inventory, then drag an item to Consume or Discard.</p>
        </section>

        <section v-if="!embedded" class="recommendation-section">
            <div class="recommendation-heading">
                <h2>Storage Guidance</h2>
                <div class="guidance-heading-actions">
                <button type="button" class="guidance-arrange-all" title="Arrange the items shown below" :disabled="guidanceBusy || !arrangeableFoods.length"
                    @click="confirmArrangeAll">{{ arrangingFoodIds.size ? 'Arranging…' : 'Arrange all' }}</button>
                <button type="button" class="guidance-ignore guidance-ignore-all" :disabled="guidanceBusy || !storageRecommendations.length"
                    @click="ignoreAllGuidance">Ignore all</button>
                </div>
            </div>
            <p>Some foods may need a different storage location. Check product packaging and food-specific guidance.</p>
            <p v-if="arrangementError" class="guidance-error" role="alert">{{ arrangementError }}</p>
            <TransitionGroup name="guidance-list" tag="div" class="recommendation-list" tabindex="0" role="region" aria-label="Storage guidance items">
                <article v-for="item in storageRecommendations" :key="item.id" class="recommendation-card">
                    <span><NoticeIcon name="sparkle" /></span>
                    <div class="recommendation-copy"><strong>{{ item.name }}</strong><p>{{ getRecommendation(item) }}</p>
                        <p v-if="guidanceDestination(item)" class="guidance-destination">Move to {{ guidanceDestinationLabel(item) }}</p>
                    </div>
                    <div class="guidance-item-actions">
                    <button type="button" class="guidance-ignore" :aria-label="`Ignore storage guidance for ${item.name}`"
                        :disabled="guidanceBusy" @click="setGuidanceIgnored(item, true)">Ignore</button>
                    <button type="button" class="guidance-arrange" :aria-label="`Arrange ${item.name}`"
                        :disabled="guidanceBusy || !guidanceDestination(item)" @click="arrangeGuidance([item])">
                        {{ arrangingFoodIds.has(item.id) ? 'Arranging…' : 'Arrange' }}
                    </button>
                    </div>
                </article>
            </TransitionGroup>
            <p v-if="storageRecommendations.length === 0" class="no-recommendations">No basic storage suggestions for the current search.</p>
            <details v-if="ignoredStorageRecommendations.length" class="ignored-guidance">
                <summary>Ignored guidance ({{ ignoredStorageRecommendations.length }})</summary>
                <div v-for="item in ignoredStorageRecommendations" :key="item.id" class="ignored-guidance-row">
                    <span>{{ item.name }}</span>
                    <button type="button" class="guidance-ignore" :aria-label="`Restore storage guidance for ${item.name}`"
                        :disabled="guidanceBusy" @click="setGuidanceIgnored(item, false)">Restore</button>
                </div>
            </details>
        </section>

        <!-- Full compartment inventory -->
        <div v-if="selectedCompartment" class="modal-backdrop" :class="{ 'dragging-out': draggingOutsideModal }" @click.self="closeCompartment" @dragover.prevent="updateModalDragVisibility($event)" @drop.prevent="dropFromModalBackdrop($event)">
            <section ref="dialogRef" class="inventory-modal" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="compartment-title" @keydown="handleDialogKeydown">
                <header class="modal-heading">
                    <span class="compartment-modal-icon" aria-hidden="true"><FoodIcon :kind="selectedCompartment.icon || (selectedCompartment.storage === 'freezer' ? 'ice' : selectedCompartment.storage === 'pantry' ? 'can' : selectedCompartment.zone === 'crisper' ? 'leafy' : 'milk')" /></span>
                    <div class="compartment-modal-title"><p class="eyebrow">{{ currentStorage?.label }} · YOUR INVENTORY</p><h2 id="compartment-title">{{ selectedCompartment.title }}</h2><p>A little organisation. A lot less waste.</p></div>
                    <button type="button" class="modal-close" aria-label="Close compartment" @click="closeCompartment">✕</button>
                </header>
                <div class="compartment-summary" aria-label="Compartment summary">
                    <span class="compartment-count">{{ compartmentItems.length }} {{ compartmentItems.length === 1 ? 'food' : 'foods' }}{{ searchQuery ? ' found' : '' }}</span>
                    <span v-if="compartmentStatus.expired" class="compartment-expired"><NoticeIcon name="bell" /> {{ compartmentStatus.expired }} expired</span>
                    <span v-if="compartmentStatus.soon" class="compartment-soon"><NoticeIcon name="clock" /> {{ compartmentStatus.soon }} use soon</span>
                    <span class="compartment-sort"><NoticeIcon name="clock" /> Expiring first</span>
                </div>
                <div class="modal-toolbar">
                    <label class="compartment-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input v-model="searchQuery" type="search" aria-label="Search compartment food" placeholder="Find food in this compartment…"></label>
                    <RouterLink v-if="!embedded" :to="{ name: 'scanning' }" class="primary-button small-button">＋ Scan to add food</RouterLink>
                </div>
                <p v-if="errorMessage" class="compartment-error" role="alert">{{ errorMessage }}</p>
                <div v-if="compartmentItems.length" class="modal-food-list">
                    <FoodItemCard
                        v-for="item in compartmentItems"
                        :key="item.id"
                        :item="item"
                        :amount="amountLabel(item)"
                        :diet-label="dietTypeLabel(item.dietType)"
                        :storage-warning="getRecommendation(item)"
                        :storage-options="otherStorageOptions(item)"
                        :busy="shiftingFood || actionPending || saving"
                        :dragging="draggedItemId === item.id"
                        @edit="openEditForm"
                        @remove="removeItem"
                        @consume="runCardAction($event, 'consume')"
                        @discard="runCardAction($event, 'discard')"
                        @move-storage="moveToStorage"
                        @reveal="jumpToItem"
                        @drag-start="startModalDrag"
                        @drag-end="finishDrag"
                    />
                </div>
                <div v-else class="modal-empty"><span>{{ searchQuery ? '🔎' : '🧺' }}</span><strong>{{ searchQuery ? 'No foods match this search' : 'This compartment is empty' }}</strong><p>{{ searchQuery ? 'Try a different food name, unit, or location.' : 'Add food to see it here.' }}</p></div>
                <p class="modal-footnote">Drag food to move it, or use the buttons to consume, discard and organise.</p>
            </section>
        </div>

        <FoodDragActions :visible="Boolean(draggedItemId) || (actionPending && !cardActionPending) || Boolean(actionReaction)"
            :storage-action="storageAction"
            :position="dragPosition" :anchor="dragAnchor" :reaction="actionReaction" :pending="actionPending"
            @action-drop="dropOnAction" />
        <FoodTransferOverlay :flights="foodTransfer.flights.value" :announcement="foodTransfer.announcement.value" @complete="foodTransfer.finish" />
        <Teleport to="body">
            <aside v-if="movedStorageWarnings.length" class="storage-move-warning" role="alert" aria-label="Storage guidance after moving food">
                <div class="storage-move-warning-heading"><strong><NoticeIcon name="bell" /> Check the new storage location</strong>
                    <button type="button" aria-label="Dismiss storage guidance prompt" @click="movedStorageAdviceIds = []">✕</button>
                </div>
                <ul><li v-for="item in movedStorageWarnings" :key="item.id">{{ getRecommendation(item) }}</li></ul>
            </aside>
            <div v-if="selectionBox" class="food-selection-box" aria-hidden="true" :style="{ left: selectionBox.left + 'px', top: selectionBox.top + 'px', width: (selectionBox.right - selectionBox.left) + 'px', height: (selectionBox.bottom - selectionBox.top) + 'px' }"></div>
            <div v-if="selectedFoodIds.size" class="food-selection-count" role="status">{{ selectedFoodIds.size }} selected · Drag a highlighted food to move the group · Esc to clear</div>
            <EggLoader :visible="shiftingFood" label="Shifting food" />
            <span v-if="dragPlacement && dragPosition" class="drag-placement-hint" role="status"
                :style="{ left: `${Math.max(95, Math.min(dragPosition.x, windowWidth - 95))}px`, top: `${Math.max(12, dragPosition.y - 72)}px` }">Place at {{ dragPlacement }}</span>
            <div v-if="draggedFood && dragPosition" class="held-food" aria-hidden="true"
                :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }"><span v-if="selectedFoodIds.size > 1" class="drag-group-count">{{ selectedFoodIds.size }} foods</span><FoodIcon :item="draggedFood" /><span v-if="Number(draggedFood.quantity) > 1" class="food-quantity-badge">×{{ draggedFood.quantity }}</span></div>
        </Teleport>

        <FoodItemForm
            :visible="formVisible"
            :item="editingItem"
            :default-storage="defaultStorage"
            :default-storage-zone="defaultStorageZone"
            :saving="saving"
            @save="saveItem"
            @close="closeForm"
        />

        <footer v-if="!embedded" class="page-footer"><p>Full Circle · Interactive Smart Fridge</p><p>Your inventory is loaded from and saved to the backend.</p></footer>
        </div></div>
    <Teleport to="body">
        <div v-if="foodTooltip" role="tooltip" class="fridge-food-tooltip" :style="{ left: foodTooltip.x + 'px', top: foodTooltip.y + 'px' }">
            <span class="food-tooltip-name">{{ foodTooltip.name }}</span>
            <span v-if="foodTooltip.storageWarning" class="food-tooltip-storage">{{ foodTooltip.storageWarning }}</span>
            <span v-if="foodTooltip.expiry" class="food-tooltip-expiry" :class="{ expired: foodTooltip.expired }">{{ foodTooltip.expiry }}</span>
        </div>
    </Teleport>
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
    padding: 16px clamp(8px, 1.5vw, 20px) 16px;
    color: var(--ink);
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
.fridge-door .door-brand {
    align-self:center; margin-right:0; max-width:100%; padding:3px 8px;
    border-radius:6px; background:#effbff; color:#234d50; text-align:center;
    overflow-wrap:anywhere;
}
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
.recommendation-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.guidance-heading-actions { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.storage-move-warning { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); z-index:1100; width:min(560px,calc(100vw - 32px)); box-sizing:border-box; padding:14px 16px; border:2px solid #806020; border-radius:16px; background:#fff4cc; color:#634914; box-shadow:4px 5px 0 #173d3933; font:17px/1.4 var(--font-sans,"Patrick Hand",cursive,sans-serif); }
.storage-move-warning-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.storage-move-warning-heading button { flex:none; display:grid; place-items:center; width:40px; height:40px; border:1px solid #b4a06c; border-radius:10px; background:#fffaf0; color:inherit; cursor:pointer; }
.storage-move-warning ul { max-height:25dvh; overflow:auto; margin:8px 0 0; padding-left:20px; }
.storage-move-warning li + li { margin-top:8px; }
.recommendation-copy { flex:1; min-width:0; }
.guidance-item-actions { display:flex; align-items:center; align-self:center; gap:8px; margin-left:auto; }
.guidance-ignore { min-height:44px; padding:8px 12px; border:1px solid #9fada3; border-radius:12px; background:#fffefa; color:#52665f; font:16px var(--font-sans); cursor:pointer; transition:background .2s; }
.guidance-ignore:hover:not(:disabled) { background:#edf4ed; }
.guidance-ignore:disabled { opacity:.5; cursor:default; }
.ignored-guidance { margin-top:18px; padding-top:12px; border-top:1px dashed var(--line); color:var(--muted); font-size:16px; }
.ignored-guidance summary { cursor:pointer; }
.ignored-guidance-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:10px; }
.ignored-guidance-row > span { overflow-wrap:anywhere; min-width:0; }
.guidance-arrange,.guidance-arrange-all { flex:none; align-self:center; min-height:44px; padding:8px 16px; border:2px solid var(--ink); border-radius:12px; background:#def2ba; color:var(--ink); font:700 17px var(--font-sans); box-shadow:2px 3px 0 #173d3926; cursor:pointer; transition:transform .2s,box-shadow .2s; }
.guidance-arrange-all { background:var(--teal); color:white; }
.guidance-arrange:hover:not(:disabled),.guidance-arrange-all:hover:not(:disabled) { transform:translateY(-2px); box-shadow:3px 5px 0 #173d3930; }
.guidance-arrange:disabled,.guidance-arrange-all:disabled { opacity:.5; cursor:default; box-shadow:none; }
.recommendation-card .guidance-destination { color:var(--teal-dark); font-weight:700; }
.recommendation-section>p.guidance-error { color:#a43d32; }
.guidance-list-enter-active,.guidance-list-leave-active { transition:opacity .2s,transform .2s; }
.guidance-list-enter-from,.guidance-list-leave-to { opacity:0; transform:translateX(12px); }
@media (max-width:600px) { .recommendation-card { flex-wrap:wrap; } .recommendation-copy { flex-basis:calc(100% - 40px); } .guidance-arrange { margin-left:auto; } }
.recommendation-section>p { margin:7px 0 0; color:var(--muted); font-size:13px; line-height:1.6; }
.recommendation-list { --guidance-row-height:156px; display:flex; flex-direction:column; gap:10px; margin-top:16px; max-height:min(calc(3 * var(--guidance-row-height) + 20px),65dvh); overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.recommendation-list:focus-visible { outline:3px solid var(--teal); outline-offset:4px; border-radius:10px; }
.recommendation-card { display:flex; flex-shrink:0; min-height:var(--guidance-row-height); box-sizing:border-box; gap:12px; padding:13px; border:2px solid #d7b96c; border-radius:10px; background:#fff9df; }
@media (max-width:600px) { .recommendation-list { --guidance-row-height:210px; } }
.recommendation-card>span { font-size:22px; }
.recommendation-card strong { font-size:13px; }
.recommendation-card p { margin:5px 0 0; color:#816d48; font-size:12px; line-height:1.5; }
.no-recommendations { color:var(--muted); font-size:12px; }
.status-message { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:0 0 14px; padding:12px 14px; border:2px solid var(--line); border-radius:10px; background:#fff; font-size:13px; }
.error-message { border-color:#bd554b; background:#fff0ed; color:#8d2525; }
.error-message button { padding:7px 10px; border:2px solid #8d2525; border-radius:7px; background:white; color:#8d2525; cursor:pointer; }
.modal-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(15,38,34,.56); backdrop-filter:blur(4px); }
/* Once the pointer leaves the popup, keep it hidden AND remove the overlay
   from hit-testing. This lets the actual fridge/pantry compartments receive
   dragover and drop events, even if the pointer passes over the popup's old spot. */
.modal-backdrop.dragging-out { background:transparent; backdrop-filter:none; pointer-events:none; }
.modal-backdrop.dragging-out .inventory-modal { opacity:0; visibility:hidden; pointer-events:none; }
.inventory-modal { width:min(980px,100%); max-height:min(86dvh,920px); overflow:auto; padding:28px; border:2px solid var(--ink); border-radius:24px; background:#fbfffd; box-shadow:8px 10px 0 rgba(11,36,31,.35); overscroll-behavior:contain; animation:compartment-open .35s cubic-bezier(.2,.8,.2,1) both; }
@keyframes compartment-open { from { opacity:0; transform:translateY(18px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes compartment-food-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
.compartment-modal-icon { display:grid; place-items:center; flex:none; width:74px; height:74px; border:2px solid var(--ink); border-radius:20px; background:#d9f3ec; box-shadow:3px 3px 0 #173d3920; transform:rotate(-5deg); }
.compartment-modal-icon :deep(.food-icon) { width:54px; height:54px; }
.compartment-modal-title { flex:1; min-width:0; }
.compartment-error { padding:12px; border:1px solid #b3483c; border-radius:12px; background:#fff0eb; color:#94392f; font-size:17px; }
.compartment-modal-title .eyebrow { overflow-wrap:anywhere; font-size:12px; letter-spacing:1px; }
.compartment-summary { display:flex; align-items:center; flex-wrap:wrap; gap:9px; padding:0 0 20px; margin-bottom:20px; border-bottom:1px dashed #a5c9c0; }
.compartment-summary > span { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:9px; font-size:16px; }
.compartment-count { background:#d9f3ec; font-weight:700; }
.compartment-expired { background:#ffe1db; color:#a43d32; }
.compartment-soon { background:#fff0b9; color:#7e5b16; }
.compartment-summary .compartment-sort { margin-left:auto; padding-right:0; color:var(--muted); }
.compartment-search { display:flex; flex:1; align-items:center; gap:9px; min-width:0; padding:0 12px; border:1px solid #96bfb4; border-radius:12px; background:white; }
.compartment-search:focus-within { outline:3px solid #e9c04b; outline-offset:2px; }
.compartment-search svg { flex:none; width:21px; height:21px; color:#527871; }
.compartment-search input { width:100%; min-width:0; min-height:46px; padding:8px 0; border:0; outline:none; background:transparent; color:var(--ink); font:18px var(--font-sans); }
.compartment-search input:focus-visible { outline:none; }
@media (max-width:600px) {
    .inventory-modal { padding:18px; border-radius:20px; }
    .modal-heading { gap:10px; }
    .compartment-modal-icon { width:50px; height:50px; border-radius:14px; }
    .compartment-modal-icon :deep(.food-icon) { width:38px; height:38px; }
    .compartment-modal-title .eyebrow { font-size:10px; }
    .compartment-summary .compartment-sort { margin-left:0; }
    .inventory-modal .modal-toolbar { flex-direction:column; align-items:stretch; }
}
@media (prefers-reduced-motion:reduce) { .inventory-modal,.modal-food-list :deep(.food-card) { animation:none!important; } }
.modal-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:17px; }
.modal-heading h2 { margin:0; font-family:var(--font-display, "Kalam", cursive, sans-serif); font-size:clamp(27px,4vw,36px); line-height:1.25; overflow-wrap:anywhere; }
.modal-heading p:not(.eyebrow) { margin:6px 0 0; color:var(--muted); font-size:16px; }
.modal-close { flex-shrink:0; width:44px; height:44px; transition:transform .2s,background .2s; border:2px solid var(--ink); border-radius:9px; background:#fff; color:var(--ink); font-size:17px; cursor:pointer; }
.modal-close:hover { transform:rotate(8deg); background:#ffe7de; }
.modal-toolbar { display:flex; align-items:center; gap:14px; margin-bottom:22px; }
.small-button { padding:10px 14px; font-size:16px; text-decoration:none; }
.modal-food-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr)); align-items:stretch; gap:18px; }
.modal-food-list :deep(.food-card) { min-height:100%; animation:compartment-food-in .3s ease backwards; }
.modal-food-list :deep(.food-card:nth-child(2)) { animation-delay:40ms; }
.modal-food-list :deep(.food-card:nth-child(3)) { animation-delay:80ms; }
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


/* Each storage unit stands on the page without a shared display case. */
.kitchen-stage, .kitchen-stage.storage-pantry {
    display:block; min-height:0; padding:8px 0; overflow:visible;
    border:0; border-radius:0; background:transparent; box-shadow:none;
}
.kitchen-stage .carousel-arrow { display:none; }
.kitchen-stage .carousel-window { width:100%; max-width:1120px; margin:auto; overflow:visible; }
.kitchen-stage .carousel-track, .kitchen-stage .carousel-track.show-pantry {
    display:block; width:100%; transform:none; transition:none;
}
.kitchen-stage .storage-unit { display:none; width:100%; padding:0; transform:none; filter:none; opacity:1; }
.kitchen-stage .storage-unit.unit-current { display:block; animation:storage-arrive .45s ease both; }
.kitchen-stage .storage-unit-activate { display:none; }
.kitchen-stage .fridge-body {
    width:min(82vw,430px); transform:translateX(0);
    transition:transform 1s cubic-bezier(.22,.7,.2,1),width 1s cubic-bezier(.22,.7,.2,1);
}
.kitchen-stage .fridge-body.fridge-is-open { width:min(42vw,380px); transform:translateX(46%); }
.kitchen-stage .fridge-cabinet { perspective:1800px; }
.kitchen-stage .fridge-door { transition:transform 1s cubic-bezier(.22,.7,.2,1),box-shadow 1s; }
.kitchen-stage .fridge-door.door-open { transform:rotateY(-170deg); }
.kitchen-stage .fridge-door .door-inner { backface-visibility:hidden; }
.kitchen-stage .fridge-interior { transition:box-shadow 1s; }
.kitchen-stage .fridge-is-open .fridge-interior { box-shadow:inset 0 0 32px #a5e3ff70; }
.kitchen-stage .pantry-cabinet { width:min(82vw,470px); margin:0 auto; }
.kitchen-stage .food-preview { overflow:visible; flex-wrap:wrap; min-height:36px; }
.kitchen-stage .mini-food,.kitchen-stage .door-food { min-width:34px; width:34px; height:34px; font-size:25px; cursor:grab; }
.food-being-dragged { outline:3px solid #edb935; background:#fff0a9!important; animation:food-held-shake .25s ease-in-out infinite alternate; }
.held-food { position:fixed; z-index:3000; pointer-events:none; width:64px; height:64px; display:grid; place-items:center; margin:-32px 0 0 -32px; font-size:46px; border-radius:50%; background:#fff9dbdd; border:2px solid #e6b533; box-shadow:0 0 0 7px #ffd95840,0 9px 25px #213a3633; animation:food-held-shake .25s ease-in-out infinite alternate; }
@keyframes food-held-shake { from { transform:scale(1.2) rotate(-7deg); } to { transform:scale(1.2) rotate(7deg); } }
@keyframes storage-arrive { from { opacity:0; translate:0 12px; } to { opacity:1; translate:0 0; } }
@media(max-width:600px) {
    .kitchen-stage .fridge-body { padding:6px; }
    .kitchen-stage .fridge-is-open .fridge-door .door-inner { padding:7px; }
    .kitchen-stage .fridge-is-open .compartment-heading { font-size:8px; }
    .kitchen-stage .fridge-is-open .compartment-heading small { font-size:7px; }
    .kitchen-stage .fridge-is-open .mini-food { min-width:28px; width:28px; height:28px; font-size:22px; }
}
@media(prefers-reduced-motion:reduce) {
    .held-food,.kitchen-stage .storage-unit.unit-current { animation:none!important; }
    .held-food,.food-being-dragged { transform:scale(1.2); }
}


/* Shared Home/Dashboard grid-paper shell, with readable inventory text. */
.fridge-page-shell { min-height:100svh; color:var(--ink,#173d39); background:transparent; }
.smart-fridge-page { background:transparent; font-size:18px; }
.smart-fridge-page .page-description { font-size:20px; }
.smart-fridge-page .summary-label,.smart-fridge-page .primary-button,.smart-fridge-page .expiry-button { font-size:18px; }
.smart-fridge-page .inventory-total,.smart-fridge-page .unit-caption,.smart-fridge-page .storage-hint p,.smart-fridge-page .recommendation-section p,.smart-fridge-page .page-footer,.smart-fridge-page .modal-footnote { font-size:16px; }
.smart-fridge-page .toolbar input { font-size:18px; min-height:48px; }
.kitchen-stage .storage-unit { display:block; animation:none; }
.kitchen-stage .pantry-unit { margin-top:32px; padding-top:12px; }
.storage-heading { text-align:center; font-family:var(--font-display); font-size:36px; margin:0 0 8px; }
.storage-intro { text-align:center; font-size:18px; color:var(--muted); }
.pantry-add { display:flex; width:fit-content; margin:0 auto 24px; }
.kitchen-stage .unit-top-label { font-size:16px; }
.kitchen-stage .fridge-body { --closed-width:min(100%,520px); --open-width:min(49%,540px); width:calc(var(--closed-width) * (1 - var(--open-progress)) + var(--open-width) * var(--open-progress)); transform:translateX(calc(-46% * var(--open-progress))); }
.kitchen-stage .fridge-body.fridge-is-open { width:calc(var(--closed-width) * (1 - var(--open-progress)) + var(--open-width) * var(--open-progress)); transform:translateX(calc(-46% * var(--open-progress))); }
.kitchen-stage .fridge-door,.kitchen-stage .fridge-door.door-open { transform:rotateY(var(--door-angle)); touch-action:pan-y; user-select:none; cursor:ew-resize; }
.kitchen-stage .door-moving,.kitchen-stage .door-moving .fridge-door { transition:none; }
.kitchen-stage .fridge-cabinet { height:680px; min-height:680px; }
.kitchen-stage .fridge-interior { background:linear-gradient(135deg,#82959e,#bcc8cb); filter:brightness(.8); transition:background .25s,filter .25s,box-shadow .25s; }
.kitchen-stage .light-on .fridge-interior { background:linear-gradient(135deg,#e1f5fc,#fffef0 55%,#d7edf2); filter:brightness(1); box-shadow:inset 0 0 35px #fffbd1,0 0 28px #e3f9ff90; }
.kitchen-stage .interior-header,.kitchen-stage .compartment-heading,.kitchen-stage .compartment-heading small { font-size:15px; }
.kitchen-stage .compartment-heading { flex-wrap:wrap; gap:4px; }
.kitchen-stage .compartment-heading small { font-size:13px; }
.kitchen-stage .empty-mini,.kitchen-stage .door-empty,.kitchen-stage .temperature,.kitchen-stage .more-food { font-size:14px; }
.kitchen-stage .fridge-door .door-inner-title,.kitchen-stage .fridge-door .fridge-close-button { font-size:14px; }
.kitchen-stage .door-hint,.kitchen-stage .door-brand { font-size:15px; }
.kitchen-stage .dashboard-title,.kitchen-stage .dashboard-stat small { font-size:14px; }
.kitchen-stage .dashboard-stat { min-height:66px; }
.kitchen-stage .dashboard-stat strong { font-size:28px; }
.kitchen-stage .pantry-shelf-label,.kitchen-stage .pantry-storage-hint { font-size:17px; }
.smart-fridge-page .modal-heading p,.smart-fridge-page .modal-food-info span,.smart-fridge-page .expiry-label { font-size:16px; }
.smart-fridge-page .modal-food-info strong { font-size:19px; }
@media(max-width:600px) {
    .kitchen-stage .fridge-cabinet { height:600px; min-height:600px; }
    .kitchen-stage .interior-header,.kitchen-stage .compartment-heading,.kitchen-stage .fridge-is-open .compartment-heading { font-size:13px; }
    .kitchen-stage .compartment-heading small,.kitchen-stage .fridge-is-open .compartment-heading small,.kitchen-stage .temperature { font-size:12px; }
    .kitchen-stage .empty-mini,.kitchen-stage .door-empty { font-size:12px; }
    .kitchen-stage .fridge-door .door-inner-title,.kitchen-stage .fridge-door .fridge-close-button { font-size:12px; }
    .kitchen-stage .closed-fridge-dashboard { left:8%; right:8%; }
    .smart-fridge-page .summary-label { font-size:16px; }
}


/* The dashboard uses the same interactions in its narrower left column. */
.fridge-page-shell.is-embedded { min-height:0; }
.is-embedded .smart-fridge-page { max-width:none; padding:0; }
.is-embedded .toolbar { flex-wrap:wrap; }
.is-embedded .toolbar input { min-width:0; flex:1 1 180px; width:100%; }
.is-embedded .inventory-total { width:100%; margin-left:0; }
.is-embedded .toolbar { margin-bottom:8px; }
.is-embedded .kitchen-stage { padding:0; }
.is-embedded .kitchen-stage .unit-top-label { margin-bottom:8px; }
.is-embedded .kitchen-stage .fridge-body { --open-width:49%; --closed-width:var(--open-width); }
.is-embedded .kitchen-stage .fridge-cabinet { min-height:var(--dashboard-fridge-height,600px); height:var(--dashboard-fridge-height,600px); }
.is-embedded .kitchen-stage .pantry-unit { margin-top:20px; padding-top:0; }
.is-embedded .kitchen-stage .pantry-cabinet { max-width:100%; }
.is-embedded .storage-heading { font-size:28px; }
@media(min-width:992px) {
    .is-embedded .inventory-total { display:none; }
    .is-embedded .kitchen-stage .fridge-interior { padding:8px; }
    .is-embedded .fridge-compartments { gap:6px; }
    .is-embedded .compartment { padding:5px 7px; }
}

/* Keep every product accessible in a single horizontally scrolling shelf. */
.kitchen-stage .food-preview,
.kitchen-stage .pantry-all-foods,
.kitchen-stage .fridge-door .door-bin {
    flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden; max-width:100%;
    min-width:0; gap:10px; scrollbar-width:thin; overscroll-behavior-x:contain;
}
.kitchen-stage .food-preview { min-height:80px; padding:3px 0 7px; }
.kitchen-stage .mini-food,
.kitchen-stage .door-food,
.kitchen-stage .fridge-is-open .mini-food {
    flex:0 0 68px; min-width:68px; width:68px; height:68px; font-size:50px;
}
.kitchen-stage .fridge-cabinet { min-height:760px; height:760px; }
.kitchen-stage .interior-header,
.kitchen-stage .compartment-heading,
.kitchen-stage .fridge-is-open .compartment-heading { font-size:19px; }
.kitchen-stage .compartment-heading small,
.kitchen-stage .fridge-is-open .compartment-heading small,
.kitchen-stage .temperature,
.kitchen-stage .empty-mini,
.kitchen-stage .door-empty { font-size:16px; }
.kitchen-stage .fridge-door .door-inner-title,
.kitchen-stage .fridge-door .fridge-close-button { font-size:17px; }
.smart-fridge-page .storage-intro,
.smart-fridge-page .unit-caption,
.smart-fridge-page .inventory-total { font-size:19px; }
.kitchen-stage .pantry-shelf-label { font-size:20px; }
.fridge-food-tooltip {
    position:fixed; z-index:4000; transform:translate(-50%, calc(-100% - 9px));
    display:grid; justify-items:center; gap:5px; max-width:190px;
    color:white; font-size:17px; line-height:1.3; text-align:center; pointer-events:none;
    overflow-wrap:anywhere;
}
.food-tooltip-name, .food-tooltip-expiry, .food-tooltip-storage {
    padding:8px 12px; border-radius:8px; background:#173d39;
    box-shadow:0 3px 12px #173d3933; overflow-wrap:anywhere;
}
.food-tooltip-expiry,.food-tooltip-storage { background:#ffdc59; color:#4e371e; font-weight:700; }
.food-tooltip-expiry.expired { background:#b53630; color:white; }


/* The dashboard has less room than the full fridge page: keep food inside its shelf. */
.is-embedded .kitchen-stage .fridge-cabinet {
    min-height:680px;
    height:max(680px,var(--dashboard-fridge-height,600px));
}
.is-embedded .kitchen-stage .compartment {
    display:flex; flex-direction:column; gap:3px;
}
.is-embedded .kitchen-stage .compartment-heading,
.is-embedded .kitchen-stage .fridge-is-open .compartment-heading {
    flex:0 0 auto; width:100%; font-size:15px; line-height:1.15;
}
.is-embedded .kitchen-stage .compartment-heading small,
.is-embedded .kitchen-stage .fridge-is-open .compartment-heading small {
    font-size:13px;
}
.is-embedded .kitchen-stage .food-preview {
    flex:1 1 auto; width:100%; min-height:0; margin-top:0;
    padding:2px 0 4px; align-items:center;
}
.is-embedded .kitchen-stage .mini-food,
.is-embedded .kitchen-stage .door-food,
.is-embedded .kitchen-stage .fridge-is-open .mini-food {
    flex:0 0 56px; min-width:56px; width:56px; height:56px; font-size:44px;
}
.is-embedded .kitchen-stage .mini-food :deep(.food-icon),
.is-embedded .kitchen-stage .door-food :deep(.food-icon) {
    width:100%; height:100%; max-width:100%; max-height:100%;
}


/* A continuous moulded liner, glass ledges and transparent produce drawer. */
.kitchen-stage .fridge-interior {
    padding:18px 16px 14px; border:5px solid #b0c4ca; border-radius:22px 22px 15px 15px;
    background:linear-gradient(90deg,#bbd1d8 0%,#edf7fa 7%,#fff 18%,#f2f9fa 82%,#bfd5dc 100%);
    box-shadow:inset 0 0 18px #638a9c55;
}
.kitchen-stage .light-on .fridge-interior {
    background:radial-gradient(ellipse at 50% 0%,#fffde3 0%,transparent 55%),linear-gradient(90deg,#c2dce4,#faffff 12%,#f4fafb 88%,#bcd7df);
    box-shadow:inset 0 0 25px #8bb8c955;
}
.kitchen-stage .interior-header {
    height:42px; margin:0 0 10px; padding:0 4px 12px;
    color:#567480; font-size:12px; letter-spacing:1px;
    border-bottom:5px solid #eefeff; box-shadow:0 4px 12px #e5ffff;
}
.kitchen-stage .fridge-compartments { height:calc(100% - 52px); gap:18px; }
.kitchen-stage .fridge-compartments .compartment {
    position:relative; display:flex; flex-direction:column; padding:14px 8px 18px;
    border:0; border-radius:0; background:transparent; box-shadow:none;
    transform:none; transition:background .2s;
}
.kitchen-stage .fridge-compartments .compartment:hover { background:#ffffff55; transform:none; }
.kitchen-stage .compartment::after {
    content:''; position:absolute; left:-6px; right:-6px; bottom:0; height:9px;
    border:1px solid #92b2bf; border-radius:3px;
    background:linear-gradient(#faffff,#c9e5ec 45%,#85aab8 50%,#d8edf2);
    box-shadow:0 8px 10px #476c7d22;
}
.kitchen-stage .fridge-compartments > button.freezer-compartment,
.kitchen-stage .fridge-compartments > button.freezer-compartment:hover {
    flex:0 0 24%!important; border:2px solid #b3ccd7; border-radius:14px 14px 5px 5px;
    background:linear-gradient(135deg,#e5f6ffcc,#c5e3f288)!important;
    box-shadow:inset 0 5px 14px #8fb8ce44!important;
}
.kitchen-stage .shelf-compartment { flex:1 1 auto; justify-content:space-between; }
.kitchen-stage .shelf-compartment::before {
    content:''; position:absolute; top:20px; left:50%; width:70px; height:20px;
    transform:translateX(-50%); opacity:.3;
    background:repeating-linear-gradient(to bottom,#668995 0 2px,transparent 2px 5px);
}
.kitchen-stage .compartment-heading { position:relative; z-index:1; font-size:17px; color:#476974; }
.kitchen-stage .shelf-compartment .food-preview { flex:0 0 auto; margin-top:auto; }
.kitchen-stage .fridge-compartments > .fridge-bottom { flex:0 0 25%; }
.kitchen-stage .fridge-bottom .crisper-compartment,
.kitchen-stage .fridge-bottom .crisper-compartment:hover {
    border:2px solid #a3c4c8!important; border-radius:5px 5px 14px 14px;
    background:linear-gradient(180deg,#effbf555,#b5d8cf88)!important;
    box-shadow:inset 0 3px 0 #fff, inset 0 -12px 22px #83ada733!important;
}
.kitchen-stage .crisper-compartment::after {
    left:25%; right:25%; top:5px; bottom:auto; height:5px;
    background:#b6cfd0; border:0; border-radius:0 0 5px 5px; box-shadow:0 2px 1px #fff;
}
.kitchen-stage .mini-food,.kitchen-stage .door-food { background:transparent; border:0; border-radius:0; }
.kitchen-stage .mini-food :deep(.food-icon),.kitchen-stage .door-food :deep(.food-icon) {
    filter:drop-shadow(0 4px 2px #3c62652b);
}
.is-embedded .kitchen-stage .fridge-interior { padding:12px 9px; }
.is-embedded .kitchen-stage .interior-header { font-size:11px; }
.is-embedded .kitchen-stage .fridge-compartments { gap:12px; }
.is-embedded .kitchen-stage .compartment { padding:10px 5px 16px; }


/* Blue enamel cabinet and sculpted ice-blue liner, inspired by the reference. */
.kitchen-stage .fridge-body {
    padding:12px 12px 46px; border:3px solid #233e54; border-radius:13px 16px 18px 14px;
    background:linear-gradient(90deg,#739ab7,#bad9e8 4%,#7195b2 10%,#4c7395 90%,#2c506f);
    box-shadow:inset 0 3px 0 #e6f7ff,inset 0 -7px 0 #365775,8px 10px 0 #193c5233;
    position:relative;
}
.kitchen-stage .fridge-body::after {
    content:''; position:absolute; bottom:12px; right:22px; width:54px; height:20px;
    border:2px solid #284b65; border-radius:3px;
    background:repeating-linear-gradient(#86b0c9 0 2px,#365c79 2px 5px);
}
.kitchen-stage .fridge-interior,
.kitchen-stage .light-on .fridge-interior {
    border:3px solid #335b70; border-radius:22px 22px 14px 14px;
    background:linear-gradient(90deg,#5b9bb0 0%,#94d6df 5%,#b8e9eb 9%,#7dbdcd 13%,#85c9d5 84%,#b2e3e7 92%,#619caf);
    box-shadow:inset 0 0 0 8px #b9e9eb88,inset 14px 9px 15px #235d7470,inset -10px -7px 12px #316d7f55;
}
.kitchen-stage .interior-header {
    color:#2c566b; border-bottom:0; box-shadow:none;
    background:radial-gradient(ellipse at 50% 0%,#edffffaa,transparent 65%);
}
.kitchen-stage .fridge-compartments { gap:16px; }
.kitchen-stage .fridge-compartments .compartment { padding:16px 10px 22px; }
.kitchen-stage .fridge-compartments > button.freezer-compartment,
.kitchen-stage .fridge-compartments > button.freezer-compartment:hover {
    border:2px solid #548ea2; border-radius:12px 12px 3px 3px;
    background:linear-gradient(145deg,#b7e4e977,#67aabd66)!important;
    box-shadow:inset 5px 6px 9px #316e8444!important;
}
.kitchen-stage .compartment::after {
    left:-8px; right:-8px; height:15px; border:2px solid #31596d;
    border-radius:50% 50% 7px 7px / 9px 9px 5px 5px;
    background:linear-gradient(175deg,#d2f8f5,#a0dce2 40%,#6faebe 48%,#c6eeee 62%,#8bc1d1);
    box-shadow:0 7px 0 #41768b55,inset 0 2px 0 #e7ffff;
}
.kitchen-stage .shelf-compartment::before {
    top:16%; left:8%; width:84%; height:65%; transform:none;
    opacity:.35; border-radius:18px; border:1px solid #2f7894;
    background:linear-gradient(145deg,#c1eff3,transparent 50%,#4b91ab55);
}
.kitchen-stage .fridge-bottom .crisper-compartment,
.kitchen-stage .fridge-bottom .crisper-compartment:hover {
    border:2px solid #36687c!important; border-radius:18px 18px 10px 10px;
    background:linear-gradient(150deg,#c5eeeb99,#8fc9d5aa)!important;
    box-shadow:inset 4px 5px 0 #d7faff77,inset -5px -8px 14px #46869b66!important;
}
.kitchen-stage .compartment-heading { color:#214c61; }
.kitchen-stage .fridge-door {
    transform-origin:right center; border:3px solid #294c66;
    border-radius:18px 12px 12px 18px;
    background:linear-gradient(100deg,#badce9,#789fbc 9%,#567da0 70%,#2e5375);
    box-shadow:inset 5px 0 0 #d7edf5,inset -7px 0 0 #375c7c,5px 0 0 #294a65;
}
.kitchen-stage .fridge-door .door-inner {
    border:3px solid #355a71; border-radius:19px 14px 14px 19px;
    padding:18px 14px; background:linear-gradient(100deg,#7db6c8,#c6f1f0 14%,#a1dbe2 80%,#5f9cb3);
    box-shadow:inset 0 0 0 6px #d3f5f1aa,inset 10px 0 15px #4b8b9f66;
}
.kitchen-stage .fridge-door .door-bin {
    border:2px solid #568da2; border-bottom:10px solid #9cd2de;
    border-radius:12px 12px 6px 6px;
    background:linear-gradient(135deg,#e6ffff66,#a8dfe655);
    box-shadow:inset 2px 2px 0 #e7ffff99,0 3px 0 #3e7188;
}
.kitchen-stage .door-handle { right:auto; left:15px; background:linear-gradient(90deg,#294a65,#bdd9e8,#355c7a); }


/* One shared shelves area with three fixed rows, extending sideways as needed. */
.kitchen-stage .shelf-compartment .food-preview,
.is-embedded .kitchen-stage .shelf-compartment .food-preview {
    display:grid; grid-template-rows:repeat(3,minmax(76px,1fr));
    grid-auto-flow:column; grid-auto-columns:68px; align-items:end;
    justify-content:start; column-gap:12px; row-gap:5px;
    flex:1 1 auto; min-height:243px; width:100%; margin-top:8px; padding:0 0 7px;
    background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(33.333% - 6px),#daf6f6 calc(33.333% - 6px),#6c9faf calc(33.333% - 3px),#a4d9e1 33.333%);
}
.kitchen-stage .shelf-compartment .empty-mini { grid-row:1 / -1; align-self:center; }
.kitchen-stage .mini-food,.kitchen-stage .door-food { position:relative; }
.food-quantity-badge {
    position:absolute; right:0; bottom:0; z-index:1;
    padding:1px 5px; border:1px solid #52768a; border-radius:6px;
    background:#f1ffff; color:#214c61; font:700 14px/1.3 sans-serif;
    box-shadow:0 2px 3px #244b6333; pointer-events:none;
}
.is-embedded .kitchen-stage .shelf-compartment .food-preview {
    grid-template-rows:repeat(3,minmax(62px,1fr)); grid-auto-columns:56px; min-height:201px;
}


/* Animate the body-level drag preview, outside the shelves' scroll clipping. */
.kitchen-stage .food-being-dragged {
    outline:none; background:transparent!important; animation:none;
    transform:none; opacity:.35;
}
.held-food {
    z-index:10000; overflow:visible; border-radius:9px;
    background:#fff0a9!important; border:3px solid #edb935;
    box-shadow:0 0 0 4px #ffd95840,0 9px 25px #213a3633;
}


/* Outlined cartoon puffs replace the blurred mist. */
.cold-air {
    position:absolute; right:-16px; top:7%; width:92px; height:85%;
    z-index:6; pointer-events:none; overflow:visible;
}
.cold-air-puff {
    position:absolute; left:-35px; top:calc(10% + var(--puff-index) * 29%);
    width:clamp(95px,12vw,150px); height:auto; overflow:visible;
    opacity:0; animation:cartoon-cold-puff 7s ease-out infinite;
    animation-delay:calc(var(--puff-index) * -2.3s);
}
.cold-air-cloud { fill:#8be1ff; fill-opacity:.75; stroke:#329dcc; stroke-width:2.5; stroke-linejoin:round; }
.cold-air-curl { fill:none; stroke:#e2fbff; stroke-width:5; stroke-linecap:round; }
.cold-air-spark { fill:none; stroke:#258bc5; stroke-width:2.5; stroke-linecap:round; }
.cold-air-flake {
    position:absolute; left:10px; top:calc(7% + var(--flake-index) * 23%);
    color:#35baff; font-size:25px; text-shadow:1px 1px 0 #e1faff,-1px -1px 0 #e1faff;
    opacity:0; animation:cartoon-cold-flake 8s ease-out infinite;
    animation-delay:calc(var(--flake-index) * -2s);
}
@keyframes cartoon-cold-puff {
    0% { opacity:0; transform:translate(-18px,0) scale(.4) rotate(-8deg); }
    12% { opacity:.85; }
    35% { opacity:.55; }
    55%,100% { opacity:0; transform:translate(35px,35px) scale(1.05) rotate(6deg); }
}
@keyframes cartoon-cold-flake {
    0% { opacity:0; transform:translate(-10px,0) rotate(0); }
    12% { opacity:1; }
    50%,100% { opacity:0; transform:translate(55px,65px) rotate(100deg); }
}
@media(prefers-reduced-motion:reduce) {
    .cold-air-puff,.cold-air-flake { display:none; animation:none!important; }
}


.cold-air-left { right:auto; left:-16px; transform:scaleX(-1); }
/* Keep animated SVG bounds from briefly creating an overflow line/scrollbar. */
.cold-air { clip-path:inset(-30px -55px -70px -55px); }
.cold-air-puff { overflow:hidden; }

/* The left side releases smaller rising curls on a separate rhythm. */
.cold-air-left .cold-air-puff {
    top:calc(16% + var(--puff-index) * 25%);
    width:clamp(80px,10vw,125px);
    animation-name:cartoon-cold-puff-left;
    animation-duration:9s;
    animation-delay:calc(-1.4s - var(--puff-index) * 2.8s);
}
.cold-air-left .cold-air-flake {
    animation-name:cartoon-cold-flake-left;
    animation-duration:10s;
    animation-delay:calc(-2.7s - var(--flake-index) * 2.2s);
}
@keyframes cartoon-cold-puff-left {
    0% { opacity:0; transform:translate(-12px,15px) scale(.35) rotate(12deg); }
    15% { opacity:.7; }
    32% { opacity:.5; transform:translate(20px,-8px) scale(.85) rotate(-5deg); }
    55%,100% { opacity:0; transform:translate(48px,-45px) scale(1.1) rotate(-14deg); }
}
@keyframes cartoon-cold-flake-left {
    0% { opacity:0; transform:translate(-5px,12px) rotate(15deg); }
    15% { opacity:.8; }
    48%,100% { opacity:0; transform:translate(48px,-60px) rotate(-100deg); }
}

.drag-placement-hint {
    position:fixed; z-index:10001; transform:translateX(-50%); pointer-events:none;
    padding:7px 12px; max-width:190px; border:2px solid #317d72; border-radius:9px;
    background:#effff8; color:#173d39; font-size:17px; font-weight:700; line-height:1.25;
    text-align:center; box-shadow:0 3px 9px #173d392b;
}

.drag-group-count { position:absolute; bottom:calc(100% + 8px); white-space:nowrap; padding:3px 8px; border-radius:12px; background:#173d39; color:white; font:700 14px sans-serif; }
.food-transfer-incoming { opacity:.2; transition:opacity .18s ease; }
/* Open illustrated shelving; only real inventory supplies the contents. */
.kitchen-stage .pantry-cabinet.open-pantry {
    position:relative; display:block; width:min(100%,820px); aspect-ratio:1;
    min-height:0; padding:0; border:0; border-radius:0; margin:0 auto;
    background:url('/images/pantry-shelves.svg') center / 100% 100% no-repeat;
    box-shadow:none; filter:drop-shadow(5px 9px 3px #273f3820);
}
.open-pantry-shelves { position:absolute; inset:7.5% 9.5% 8%; display:grid; grid-template-rows:repeat(4,minmax(0,1fr)); }
.open-pantry .pantry-whole-storage {
    display:flex; align-items:stretch; justify-content:flex-end; min-height:0;
    padding:0 0 9px; gap:0; border:0; border-radius:0; background:transparent;
    box-shadow:none; transform:none; outline:2px dashed transparent; outline-offset:-4px;
}
.open-pantry .pantry-whole-storage:hover { background:#f4f1cb12; transform:none; }
.open-pantry .pantry-whole-storage:focus-visible { outline-color:#fff2a9; }
.kitchen-stage .open-pantry .pantry-all-foods {
    display:flex; align-items:flex-end; align-content:flex-end; flex:1 1 auto;
    width:100%; height:100%; min-height:0; padding:8px 8px 5px; gap:18px;
    overflow-x:auto; overflow-y:hidden; scrollbar-color:#d7b790 #37585a;
}
.kitchen-stage .open-pantry .mini-food {
    flex:0 0 clamp(42px,7vw,90px); min-width:0; width:clamp(42px,7vw,90px);
    height:clamp(42px,7vw,90px); margin:0 0 3px;
}
.kitchen-stage .open-pantry .mini-food :deep(.food-icon) { width:100%; height:100%; filter:drop-shadow(0 5px 2px #10282c55); }
@media(max-width:600px) {
    .kitchen-stage .open-pantry .pantry-all-foods { gap:12px; padding:3px 4px; }
    .open-pantry .pantry-whole-storage { padding-bottom:4px; }
}
.storage-switcher { display:flex; align-items:center; justify-content:center; gap:16px; margin:12px auto 24px; }
.storage-slide-arrow { display:grid; place-items:center; width:48px; height:48px; border:2px solid var(--ink); border-radius:50%; background:var(--paper); color:var(--ink); font-size:38px; line-height:1; box-shadow:2px 3px 0 #173d3920; cursor:pointer; }
.storage-slide-arrow { padding:0; }
.storage-slide-arrow svg { display:block; width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
.storage-slide-arrow:hover { background:#def2e9; }
.storage-slide-options { display:flex; align-items:center; flex-wrap:wrap; justify-content:center; gap:8px; }
.storage-slide-options button { padding:8px 18px; border:2px solid transparent; border-radius:24px; background:transparent; color:var(--ink); font:inherit; font-size:19px; cursor:pointer; }
.storage-slide-options button[aria-pressed="true"] { border-color:var(--ink); background:#e3f3ed; font-weight:800; }
.storage-slide-status { flex:0 0 100%; text-align:center; font-size:14px; color:var(--muted); }
.storage-switcher button:focus-visible { outline:3px solid #168dc7; outline-offset:4px; }
.kitchen-stage.storage-slideshow { overflow:hidden; }
.storage-slideshow .carousel-track { display:grid; grid-template-columns:minmax(0,1fr); align-items:start; }
.storage-slideshow .storage-unit { grid-area:1 / 1; visibility:hidden; opacity:0; pointer-events:none; transition:transform .4s ease, opacity .4s ease, visibility .4s; }
.storage-slideshow .fridge-unit { transform:translateX(-8%); }
.storage-slideshow .pantry-unit { margin-top:0; padding-top:0; transform:translateX(8%); }
.storage-slideshow .storage-unit.slide-active { visibility:visible; opacity:1; pointer-events:auto; transform:translateX(0); }
.instant-storage-slide .storage-unit { transition:none; }
@media(prefers-reduced-motion:reduce) { .storage-slideshow .storage-unit { transition:none; } }
.kitchen-stage { user-select:none; }
.food-selection-box { position:fixed; z-index:10003; pointer-events:none; border:1px solid #168dc7; background:#49b9f333; box-shadow:inset 0 0 0 1px #ffffff55; }
.kitchen-stage .mini-food.food-selected,.kitchen-stage .door-food.food-selected { background:#9cdeffbb; outline:2px solid #168dc7; outline-offset:1px; border-radius:7px; box-shadow:0 0 0 4px #49b9f32b; }
.food-selection-count { position:fixed; bottom:12px; left:50%; transform:translateX(-50%); z-index:10001; pointer-events:none; width:max-content; max-width:calc(100vw - 24px); padding:8px 14px; border-radius:20px; background:#173d39; color:#fff; font-size:15px; text-align:center; box-shadow:0 3px 12px #173d3933; }
@media (max-width: 767.98px) {
    .food-selection-box,.food-selection-count { display:none; }
    .kitchen-stage .mini-food.food-selected,.kitchen-stage .door-food.food-selected {
        background:transparent; outline:none; box-shadow:none;
    }
}
/* A location reveal remains visible on mobile, independently of multi-selection. */
.kitchen-stage .mini-food.food-location-highlight,.kitchen-stage .door-food.food-location-highlight {
    background:#fff0a6; outline:3px solid #b77b12; outline-offset:2px;
    border-radius:10px; box-shadow:0 0 0 6px #ffcf5938; z-index:3;
}
.food-transfer-arrival { outline:3px solid #73b999; outline-offset:3px; animation:food-transfer-arrival 1.1s ease-out; }
@keyframes food-transfer-arrival { 0%,100% { box-shadow:0 0 0 0 #73b99900; } 55% { box-shadow:0 0 0 8px #73b99945; } }
@media(prefers-reduced-motion:reduce) { .food-transfer-arrival { animation:none; } }
.food-expiry-badge,.food-storage-badge {
    position:absolute; top:0; right:0; z-index:2; pointer-events:none;
    display:grid; place-items:center; width:21px; height:21px;
    border:2px solid #4e371e; border-radius:7px 7px 9px 9px;
    background:#ffdc59; color:#4e371e; font:900 16px/1 sans-serif;
    transform:rotate(9deg); box-shadow:1px 2px 0 #4e371e;
}
.food-expiry-badge.expired { background:#df4640; color:white; animation-delay:.35s; }
@media (prefers-reduced-motion:no-preference) {
    .food-expiry-badge,.food-storage-badge { animation:food-warning-nudge 4.2s ease-in-out infinite; }
    .food-storage-badge { animation-delay:1.1s; }
    .food-expiry-badge.expired { animation-delay:.35s; }
}
@keyframes food-warning-nudge {
    0%,18%,100% { rotate:0deg; }
    3%,11% { rotate:-7deg; }
    7%,15% { rotate:6deg; }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
    :is(.mini-food, .door-food):not(.food-being-dragged):hover :deep(.food-icon) {
        animation: fridge-icon-wiggle 420ms ease-in-out;
    }
}
@keyframes fridge-icon-wiggle {
    0%, 100% { rotate: 0deg; }
    25% { rotate: -8deg; }
    50% { rotate: 7deg; }
    75% { rotate: -4deg; }
}
.storage-slide-options.fridge-switcher-options { display:flex; flex-wrap:wrap; justify-content:center; max-width: min(660px, 70vw); }
.storage-switcher {
    position:relative;
    width:min(100%, 780px);
    padding-inline:56px;
}
.storage-switcher > .storage-slide-arrow {
    position:absolute;
    top:0;
}
.storage-switcher > .storage-slide-arrow:first-child { left:0; }
.storage-switcher > .storage-slide-arrow:last-child { right:0; }
.fridge-switcher-options .storage-slide-status { flex-basis:100%; text-align:center; }
.storage-search {
    flex:1; min-width:0; width:100%; max-width:320px;
    padding:4px 8px; border:1px solid #416f77; border-radius:8px;
    background:#f5ffff; color:#173d39; font:600 16px/1.25 var(--font-sans);
}
.storage-search:focus-visible { outline:2px solid #176d72; outline-offset:2px; }
.storage-search-clear {
    flex:none; padding:4px 6px; border:1px solid #416f77; border-radius:8px;
    background:#f5ffff; color:#173d39; font:600 14px/1.25 var(--font-sans);
}
.storage-search-clear:disabled { opacity:.55; }
.pantry-search { display:block; margin:0 auto 12px; }
@media (prefers-reduced-motion: no-preference) {
    .storage-switch-pulse { animation: storage-arrive .35s ease-out; }
    .fridge-switcher-options button { transition: background-color .2s, border-color .2s, box-shadow .2s; }
}
.smart-fridge-page .page-header.paper { overflow:visible; z-index:20; }
.expiry-dropdown { position:relative; }
.expiry-dropdown-position {
    position:absolute; top:100%; right:0; z-index:21; padding-top:8px;
    width:min(420px, calc(100vw - 48px));
}
.expiry-dropdown-panel { width:100%; max-height:min(55vh, 460px); overflow:auto; }
.expiry-dropdown-panel .modal-food-list { grid-template-columns:minmax(0,1fr); }
.dashboard-fridge-switch {
    display:grid; grid-template-columns:36px minmax(0,1fr) 36px; align-items:center;
    gap:8px; width:min(100%, 240px); margin:0 auto 10px;
}
.dashboard-fridge-switch .storage-slide-arrow { width:36px; height:36px; }
.dashboard-fridge-name {
    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    text-align:center; font-weight:700;
}
.mobile-fridge-close { display:none; }
@media (pointer: coarse) {
    .kitchen-stage [data-food-id] { -webkit-touch-callout:none; }
}
@media (max-width: 767.98px) {
    .smart-fridge-page .kitchen-stage .fridge-body,
    .smart-fridge-page .kitchen-stage .fridge-body.fridge-is-open {
        width:min(100%, 440px);
        transform:none;
        padding:8px;
    }
    .smart-fridge-page .fridge-body::after { display:none; }
    .smart-fridge-page .kitchen-stage .fridge-cabinet {
        height:auto;
        min-height:0;
        perspective:none;
    }
    .smart-fridge-page .kitchen-stage .fridge-interior { height:680px; padding:10px 8px; }
    .smart-fridge-page .kitchen-stage .fridge-compartments { gap:12px; }
    .smart-fridge-page .kitchen-stage .fridge-compartments .compartment { padding:10px 5px 16px; }
    .smart-fridge-page .kitchen-stage .fridge-compartments .compartment-heading {
        font-size:15px; line-height:1.15;
    }
    .smart-fridge-page .kitchen-stage .fridge-compartments .compartment-heading small { font-size:13px; }
    .smart-fridge-page .kitchen-stage .fridge-compartments .food-preview {
        flex:1 1 auto; width:100%; min-height:0; margin-top:0; padding:2px 0 4px;
    }
    .smart-fridge-page .kitchen-stage .fridge-compartments .shelf-compartment .food-preview {
        grid-template-rows:repeat(3,minmax(62px,1fr));
        grid-auto-columns:56px; min-height:201px;
    }
    .smart-fridge-page .kitchen-stage :is(.mini-food,.door-food) {
        flex:0 0 56px; min-width:56px; width:56px; height:56px; font-size:44px;
    }
    .smart-fridge-page .kitchen-stage :is(.mini-food,.door-food) :deep(.food-icon) {
        width:100%; height:100%; max-width:100%; max-height:100%;
    }
    .smart-fridge-page .kitchen-stage .fridge-door { transform:none; }
    .smart-fridge-page .kitchen-stage .fridge-door.door-open {
        position:relative; inset:auto; width:100%; height:auto; margin-top:10px; padding:0;
        transform:none; box-shadow:none; background:none; border:0;
    }
    .fridge-door.door-open > :is(.door-brand,.door-handle,.door-hint) { display:none; }
    .smart-fridge-page .kitchen-stage .fridge-door.door-open .door-inner {
        position:relative; inset:auto; width:100%; transform:none; padding:10px;
    }
    .smart-fridge-page .fridge-door.door-open .door-bin { flex:none; min-height:80px; }
    .mobile-fridge-close {
        display:block; min-height:44px; margin:0 auto 8px; padding:6px 14px;
        border:2px solid var(--ink); border-radius:12px; background:var(--paper); color:var(--ink);
    }
    .dashboard-fridge-switch { grid-template-columns:44px minmax(0,1fr) 44px; }
    .dashboard-fridge-switch .storage-slide-arrow { width:44px; height:44px; }
    .storage-switcher { padding-inline:50px; }
    .storage-slide-options button { min-height:44px; overflow-wrap:anywhere; }
    .expiry-dropdown-position { right:auto; left:0; }
    .inventory-modal { max-width:calc(100vw - 24px); max-height:85dvh; }
    .inventory-modal :deep(.food-quantity-actions button),
    .inventory-modal :deep(.icon-button) { min-height:44px; min-width:44px; }
    .expiry-dropdown-panel { max-height:55dvh; }
}

.primary-button { text-decoration:none; }
</style>
