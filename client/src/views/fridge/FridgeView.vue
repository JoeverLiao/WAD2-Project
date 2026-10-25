<script setup>
// ============================================================
// SMART FRIDGE - MAIN VIEW
//
// Responsibilities:
// 1. Store the sample inventory.
// 2. Display the four visual storage areas.
// 3. Filter items by search.
// 4. Handle adding, editing and removing items.
// 5. Handle drag-and-drop between storage areas.
//
// IMPORTANT:
// This version uses temporary sample data.
// It does not save items to MongoDB or the backend yet.
// ============================================================

import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useInventoryStore, storageAreas, isInArea } from '../../stores/inventory.js'

// Import the reusable food card component.
import FoodItemCard from '../../components/fridge/FoodItemCard.vue'

// Import the reusable add/edit form component.
import FoodItemForm from '../../components/fridge/FoodItemForm.vue'

// ============================================================
// 1-2. INVENTORY + STORAGE AREAS
// ============================================================

// The sample inventory and the four storage areas live in a
// shared Pinia store, so the Dashboard shows the same items.
// storeToRefs keeps `items` reactive like a normal ref.

const inventory = useInventoryStore()
const { items } = storeToRefs(inventory)

// ============================================================
// 3. SEARCH
// ============================================================

// The search box filters items by name.
// An empty search query displays all items.

const searchQuery = ref('')

const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    return items.value.filter(item => {
        return item.name.toLowerCase().includes(query)
    })
})

// ============================================================
// 4. GET ITEMS FOR EACH STORAGE AREA
// ============================================================

// Apply the shared area rule (see stores/inventory.js) to the
// search results, so each area only shows matching items.

function getItemsForArea(area) {
    return filteredItems.value.filter(item => isInArea(item, area))
}

// ============================================================
// 5. INVENTORY SUMMARY
// ============================================================

// Count the items in each main storage location.
// These counts are based on the complete inventory, not search.

function countItems(storage) {
    return items.value.filter(item => {
        return item.storage === storage
    }).length
}

// The total number of tracked inventory entries.
const totalItems = computed(() => items.value.length)

// ============================================================
// 6. ADD / EDIT FORM STATE
// ============================================================

// formVisible determines whether the modal is displayed.
//
// editingItem stores the item currently being edited.
// If it is null, the user is adding a new item.

const formVisible = ref(false)
const editingItem = ref(null)

// Remember which storage area the user was viewing when
// they clicked Add Food.
const defaultStorage = ref('fridge')

// Open the form to create a new item.
function openAddForm(storage = 'fridge', storageZone = null) {
    // Clear the selected item so the form knows this is an add.
    editingItem.value = null

    // Remember the selected storage location.
    defaultStorage.value = storage

    // Open the form.
    formVisible.value = true
}

// Open the form to edit an existing item.
function openEditForm(item) {
    editingItem.value = item

    // This value is used only if the form needs a default.
    defaultStorage.value = item.storage

    formVisible.value = true
}

// Close the form without saving changes.
function closeForm() {
    formVisible.value = false
    editingItem.value = null
}

// ============================================================
// 7. SAVE FOOD
// ============================================================

// The form emits its data here.
//
// If editingItem contains an item, update that item.
// Otherwise, create a new inventory entry.
//
// These changes exist only in Vue memory for now.

function saveItem(formData) {
    if (editingItem.value) {
        // Find the existing item in the inventory.
        const existingItem = items.value.find(item => {
            return item.id === editingItem.value.id
        })

        // Update its fields.
        if (existingItem) {
            Object.assign(existingItem, formData)
        }
    } else {
        // Create a new item with a unique temporary ID.
        const newItem = {
            id: Date.now(),
            ...formData
        }

        items.value.push(newItem)
    }

    // Close the form after saving.
    closeForm()
}

// ============================================================
// 8. REMOVE FOOD
// ============================================================

// Remove the item only after the user confirms.

function removeItem(item) {
    const confirmed = window.confirm(
        `Are you sure you want to remove ${item.name}?`
    )

    if (!confirmed) return

    // Keep all items except the one being removed.
    items.value = items.value.filter(existingItem => {
        return existingItem.id !== item.id
    })
}

// ============================================================
// 9. DRAG AND DROP
// ============================================================

// draggedItemId identifies the item currently being dragged.

const draggedItemId = ref(null)

function startDrag(item) {
    draggedItemId.value = item.id
}

function finishDrag() {
    draggedItemId.value = null
}

// Move an item into the selected visual storage area.
//
// IMPORTANT:
// We update both storage and storageZone.
// This keeps the item's location consistent with the shared
// InventoryItem model and our frontend compartment design.

// Handles moving food items into a storage area or fridge shelf.
function dropOnArea(area, event) {
    // Get the ID of the item being dragged.
    const transferredId = event.dataTransfer.getData('text/plain');

    // Use the ID from the drag event, or fall back to our saved ID.
    const itemId = transferredId
        ? Number(transferredId)
        : draggedItemId.value;

    // Stop if we don't have a valid item ID.
    if (itemId == null || !Number.isFinite(itemId)) {
        return;
    }

    // Find the food item being moved.
    const item = items.value.find((food) => food.id === itemId);

    // Stop if the item doesn't exist.
    if (!item) {
        return;
    }

    // Update the item's storage location.
    item.storage = area.storage;

    // Update its specific shelf or storage zone.
    if (area.storage === 'fridge') {
        // Keep the item in the exact fridge section it was dropped into.
        item.storageZone = area.storageZone || 'middle-shelf';
    } else if (area.storage === 'freezer') {
        item.storageZone = 'freezer-main';
    } else {
        item.storageZone = 'dry-storage';
    }

    // Clear the saved drag ID.
    draggedItemId.value = null;
}

// ============================================================
// 10. STORAGE RECOMMENDATIONS
// ============================================================

// Simple keyword-based recommendations for demonstration.
//
// This is not a complete food-safety system.
// Later, these rules can be improved or replaced with a more
// reliable recommendation service.

function getRecommendation(item) {
    const name = item.name.toLowerCase()

    // Basic examples of foods commonly stored frozen.
    if (
        name.includes('frozen') ||
        name.includes('ice cream')
    ) {
        if (item.storage !== 'freezer') {
            return 'Consider whether this product needs freezer storage.'
        }
    }

    // Examples of common dry pantry staples.
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

            <article class="summary-card">
                <span class="summary-icon">🧊</span>

                <div>
                    <p>Main Fridge</p>
                    <strong>{{ countItems('fridge') }}</strong>
                    <small>Items, including crisper</small>
                </div>
            </article>

            <article class="summary-card">
                <span class="summary-icon">❄️</span>

                <div>
                    <p>Freezer</p>
                    <strong>{{ countItems('freezer') }}</strong>
                    <small>Items</small>
                </div>
            </article>

            <article class="summary-card">
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
            @save="saveItem"
            @close="closeForm"
        />

        <!-- Footer -->
        <footer class="page-footer">
            <p>Full Circle · Interactive Smart Fridge</p>

            <p>
                Demonstration inventory — data is not yet saved
                to the backend.
            </p>
        </footer>

    </main>
</template>

<style scoped>
/* ============================================================
   PAGE
   ============================================================ */

.smart-fridge-page {
    --primary: #167d68;
    --primary-dark: #105c4d;
    --text: #24352f;
    --muted: #78867f;
    --border: #e1e9e3;

    max-width: 1500px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px;

    background: #f5f8f5;
    color: var(--text);
}

/* Apply consistent box sizing to everything in this page. */
.smart-fridge-page * {
    box-sizing: border-box;
}

/* ============================================================
   PAGE HEADER
   ============================================================ */

.page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 28px;
}

.eyebrow {
    margin: 0 0 8px;
    color: var(--primary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.4px;
}

.page-header h1 {
    margin: 0;
    font-size: clamp(26px, 3vw, 36px);
    font-weight: 800;
    letter-spacing: -1px;
}

.page-description {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
}

/* Main Add Food button. */
.primary-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    padding: 12px 20px;
    border: none;
    border-radius: 9px;

    background: var(--primary);
    color: white;

    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;

    cursor: pointer;
}

.primary-button:hover {
    background: var(--primary-dark);
}

.primary-button span {
    font-size: 20px;
}

/* ============================================================
   SUMMARY CARDS
   ============================================================ */

.summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 30px;
}

.summary-card {
    display: flex;
    align-items: center;
    gap: 14px;

    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 13px;

    background: white;
    box-shadow: 0 2px 8px rgb(0 0 0 / 3%);
}

.summary-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    width: 45px;
    height: 45px;
    border-radius: 11px;

    background: #e8f4ed;
    font-size: 23px;
}

.summary-card p {
    margin: 0 0 5px;
    color: var(--muted);
    font-size: 12px;
}

.summary-card strong {
    display: block;
    font-size: 25px;
}

.summary-card small {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 10px;
}

/* ============================================================
   SEARCH
   ============================================================ */

.search-section {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 30px;
}

.search-section label {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 700;
}

.search-section input {
    width: 100%;
    max-width: 430px;
    padding: 11px 13px;

    border: 1px solid var(--border);
    border-radius: 9px;
    outline: none;

    background: white;
    font-size: 13px;
}

.search-section input:focus {
    border-color: var(--primary);
}

/* ============================================================
   SECTION HEADINGS
   ============================================================ */

.section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.section-heading h2,
.recommendation-section h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
}

.section-heading p,
.recommendation-section > p {
    margin: 7px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
}

/* ============================================================
   FOUR STORAGE AREAS
   ============================================================ */

/*
    The four areas appear in a two-column grid on wide screens.
    Each area is an independent drop target.
*/

.storage-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 18px;
}

.storage-area {
    min-width: 0;
    padding: 20px;

    border: 1px solid var(--border);
    border-radius: 15px;

    background: white;
    box-shadow: 0 3px 10px rgb(0 0 0 / 3%);

    transition:
        border-color 0.2s,
        background 0.2s;
}

/* Give the user a visual cue when dragging over a storage area. */
.storage-area:has(.food-card:hover) {
    border-color: #cbded1;
}

/* A different subtle background for each storage type. */
.area-freezer {
    background: #f5fbff;
    border-color: #d8e8f1;
}

.area-fridge {
    background: #ffffff;
}

.area-crisper {
    background: #f7fcf5;
    border-color: #dcebd5;
}

.area-pantry {
    background: #fffaf1;
    border-color: #ebdfc7;
}

/* ============================================================
   STORAGE AREA HEADER
   ============================================================ */

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
    border-radius: 12px;

    background: white;
    border: 1px solid var(--border);
    font-size: 25px;
}

.area-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
}

.area-header p {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
}

/* Storage description and temperature information. */
.area-information {
    margin-bottom: 15px;
    padding: 11px 12px;

    border-radius: 8px;
    background: rgb(255 255 255 / 75%);
}

.area-information p {
    margin: 0 0 7px;
    color: #617067;
    font-size: 11px;
    line-height: 1.5;
}

.area-information span {
    color: var(--primary-dark);
    font-size: 10px;
    font-weight: 700;
}

/* ============================================================
   MAIN FRIDGE SHELVES
   ============================================================ */

.fridge-shelves {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* Each shelf has its own background and border. */
.fridge-shelf {
    min-width: 0;
    padding: 12px;

    border: 1px solid #dfe8e1;
    border-radius: 10px;

    background: #f8fbf8;
}

.fridge-shelf h4 {
    margin: 0 0 11px;
    padding-bottom: 8px;
    border-bottom: 2px solid #dfe8e1;

    color: #52665a;
    font-size: 12px;
    font-weight: 800;
}

/* ============================================================
   FOOD CARD GRID
   ============================================================ */

.item-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 10px;
    min-width: 0;
}

/* ============================================================
   EMPTY STATES
   ============================================================ */

.empty-message,
.area-empty-message {
    margin: 10px 0;
    padding: 14px 8px;

    color: #93a49a;
    font-size: 11px;
    text-align: center;
    line-height: 1.5;
}

.area-empty-message {
    margin-top: 15px;
}

/* ============================================================
   ADD FOOD BUTTONS
   ============================================================ */

.area-add-button {
    width: 100%;
    margin-top: 16px;
    padding: 11px;

    border: 1px dashed #b8d2c0;
    border-radius: 8px;

    background: rgb(255 255 255 / 70%);
    color: var(--primary-dark);

    font-size: 12px;
    font-weight: 700;

    cursor: pointer;
}

.area-add-button:hover {
    border-color: var(--primary);
    background: #edf7f0;
}

/* ============================================================
   STORAGE RECOMMENDATIONS
   ============================================================ */

.recommendation-section {
    margin-top: 30px;
    padding: 23px;

    border: 1px solid var(--border);
    border-radius: 14px;

    background: white;
}

.recommendation-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
}

.recommendation-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;

    padding: 13px;
    border: 1px solid #f0dfb9;
    border-radius: 9px;

    background: #fff9ec;
}

.recommendation-card > span {
    font-size: 20px;
}

.recommendation-card strong {
    color: #614d27;
    font-size: 12px;
}

.recommendation-card p {
    margin: 5px 0 0;
    color: #816d48;
    font-size: 11px;
    line-height: 1.5;
}

.no-recommendations {
    color: var(--muted);
    font-size: 12px;
}

/* ============================================================
   FOOTER
   ============================================================ */

.page-footer {
    display: flex;
    justify-content: space-between;
    gap: 15px;

    margin-top: 25px;
    padding: 10px 0;

    color: #849188;
    font-size: 10px;
}

.page-footer p {
    margin: 0;
}

/* ============================================================
   RESPONSIVE DESIGN
   ============================================================ */

/* Medium screens: reduce the number of columns in summaries. */
@media (max-width: 1000px) {
    .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .storage-grid {
        grid-template-columns: 1fr;
    }
}

/* Mobile screens: stack controls and simplify spacing. */
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

/* Very narrow screens: show one food card per row. */
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