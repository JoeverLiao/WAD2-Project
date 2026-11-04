<script setup>
// ============================================================
// FOOD ITEM FORM
//
// Purpose:
// Provide a reusable form for adding and editing food items.
//
// This component does not directly modify the parent's
// inventory. It emits a save event containing the form data.
// ============================================================

import { reactive, watch } from 'vue'

// ------------------------------------------------------------
// 1. PROPS
//
// visible controls whether the form is shown.
// item is the existing item when editing, or null when adding.
// ------------------------------------------------------------

const props = defineProps({
    visible: {
        type: Boolean,
        default: false
    },

    item: {
        type: Object,
        default: null
    },

    defaultStorage: {
        type: String,
        default: 'fridge'
    },

    defaultStorageZone: {
        type: String,
        default: ''
    },

    saving: {
        type: Boolean,
        default: false
    }
})

// ------------------------------------------------------------
// 2. EVENTS
//
// save: Send the completed form data to the parent.
// close: Ask the parent to close the form.
// ------------------------------------------------------------

const emit = defineEmits(['save', 'close'])

// ------------------------------------------------------------
// 3. FORM DATA
//
// reactive() makes the form fields respond to changes.
//
// We use a separate form object instead of editing the original
// inventory item immediately. This prevents unsaved changes
// from changing the inventory before Save is clicked.
// ------------------------------------------------------------

const form = reactive({
    name: '',
    quantity: '',
    weightKg: '',
    unit: 'pieces',
    storage: 'fridge',
    storageZone: 'middle-shelf',
    expiresAt: ''
})

// ------------------------------------------------------------
// 4. DEFAULT STORAGE ZONE
//
// Your shared model has three storage values:
// fridge, freezer and pantry.
//
// The crisper is a zone within the fridge, not a fourth
// storage value.
// ------------------------------------------------------------

function getDefaultZone(storage) {
    if (storage === 'fridge') return 'middle-shelf'
    if (storage === 'freezer') return 'freezer-main'

    return 'dry-storage'
}

// ------------------------------------------------------------
// 5. PREPARE THE FORM
//
// When the form opens, copy the selected item's values into
// the form. If adding a new item, use sensible defaults.
//
// watch() runs when visibility, selected item or default
// storage changes.
// ------------------------------------------------------------

watch(
    () => [
        props.visible,
        props.item,
        props.defaultStorage,
        props.defaultStorageZone
    ],
    () => {
        if (!props.visible) return

        if (props.item) {
            // Editing: copy the existing values into the form.
            form.name = props.item.name
            form.quantity = props.item.quantity ?? ''
            form.weightKg = props.item.weightKg ?? ''
            form.unit = props.item.unit
            form.storage = props.item.storage
            form.storageZone = ['upper-shelf', 'lower-shelf'].includes(props.item.storageZone)
                ? 'middle-shelf' : props.item.storageZone
            form.expiresAt = props.item.expiresAt || ''
        } else {
            // Adding: start with an empty form.
            form.name = ''
            form.quantity = ''
            form.weightKg = ''
            form.unit = 'pieces'
            form.storage = props.defaultStorage
            form.storageZone = ['upper-shelf', 'lower-shelf'].includes(props.defaultStorageZone)
                ? 'middle-shelf' : props.defaultStorageZone || getDefaultZone(props.defaultStorage)
            form.expiresAt = ''
        }
    },
    { immediate: true }
)

// ------------------------------------------------------------
// 6. CHANGE DEFAULT ZONE WHEN STORAGE CHANGES
//
// Example:
// Selecting Freezer changes the zone to "freezer-main".
// Selecting Pantry changes the zone to "dry-storage".
// ------------------------------------------------------------

function updateStorageZone() {
    form.storageZone = getDefaultZone(form.storage)
}

// ------------------------------------------------------------
// 7. SAVE THE FORM
//
// Validate the basic inputs, then send a copy of the form data
// to FridgeView.vue. The parent will add or update the item.
// ------------------------------------------------------------

function submitForm() {
    const trimmedName = form.name.trim()

    // A food name is required.
    if (!trimmedName) {
        alert('Please enter a food name.')
        return
    }

    const hasQuantity = form.quantity !== '' && form.quantity !== null && form.quantity !== undefined
    const hasWeight = form.weightKg !== '' && form.weightKg !== null && form.weightKg !== undefined
    const quantity = Number(form.quantity)
    const weightKg = Number(form.weightKg)

    if (!hasQuantity && !hasWeight) {
        alert('Enter a quantity, a total weight, or both.')
        return
    }
    if (hasQuantity && (!Number.isFinite(quantity) || quantity <= 0)) {
        alert('Quantity must be greater than zero.')
        return
    }
    if (hasWeight && (!Number.isFinite(weightKg) || weightKg <= 0)) {
        alert('Weight must be greater than zero.')
        return
    }

    // Emit a clean copy rather than exposing the reactive form.
    emit('save', {
        name: trimmedName,
        quantity: hasQuantity ? quantity : null,
        weightKg: hasWeight ? weightKg : null,
        unit: form.unit,
        storage: form.storage,
        storageZone: form.storageZone,
        expiresAt: form.expiresAt
    })
}
</script>

<template>
    <!--
        Render the modal only when visible is true.
        The parent decides whether it should be open.
    -->
    <div
        v-if="visible"
        class="modal-backdrop"
        @click.self="emit('close')"
    >
        <section
            class="form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-form-title"
        >
            <!-- Modal heading -->
            <header class="modal-header">
                <div>
                    <p class="eyebrow">INVENTORY MANAGEMENT</p>

                    <h2 id="food-form-title">
                        {{ item ? 'Edit Food Item' : 'Add Food Item' }}
                    </h2>
                </div>

                <button
                    type="button"
                    class="close-button"
                    aria-label="Close form"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>

            <!--
                @submit.prevent stops the browser from refreshing
                the page when the form is submitted.
            -->
            <form @submit.prevent="submitForm">
                <!-- Food name -->
                <div class="form-field">
                    <label for="food-name">Food Name *</label>

                    <input
                        id="food-name"
                        v-model="form.name"
                        type="text"
                        placeholder="e.g. Fresh Milk"
                        required
                    >
                </div>

                <!-- Quantity and its unit share one row; weight can be tracked independently. -->
                <div class="form-row">
                    <div class="form-field">
                        <label for="food-quantity">Quantity</label>

                        <input
                            id="food-quantity"
                            v-model.number="form.quantity"
                            type="number"
                            min="0.01"
                            step="any"
                        >
                    </div>

                    <div class="form-field">
                        <label for="food-unit">Quantity unit</label>

                        <select
                            id="food-unit"
                            v-model="form.unit"
                        >
                            <option value="pieces">Pieces</option>
                            <option value="carton">Carton</option>
                            <option value="bottle">Bottle</option>
                            <option value="bag">Bag</option>
                            <option value="packet">Packet</option>
                            <option value="container">Container</option>
                            <option value="tub">Tub</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="litres">Litres</option>
                            <option value="ml">ml</option>
                        </select>
                    </div>
                </div>

                <div class="form-field">
                    <label for="food-weight">Total weight (kg)</label>
                    <input
                        id="food-weight"
                        v-model.number="form.weightKg"
                        type="number"
                        min="0.001"
                        step="any"
                        placeholder="Optional"
                    >
                    <small class="form-help">Enter a quantity, a total weight, or both.</small>
                </div>

                <!-- Main storage location -->
                <div class="form-field">
                    <label for="food-storage">Storage Location</label>

                    <select
                        id="food-storage"
                        v-model="form.storage"
                        @change="updateStorageZone"
                    >
                        <option value="fridge">Fridge</option>
                        <option value="freezer">Freezer</option>
                        <option value="pantry">Pantry</option>
                    </select>
                </div>

                <!--
                    The zone is separate from the main storage value.
                    For example, crisper items still use storage=fridge.
                -->
                <div class="form-field">
                    <label for="food-zone">Compartment / Zone</label>

                    <select
                        id="food-zone"
                        v-model="form.storageZone"
                    >
                        <template v-if="form.storage === 'fridge'">
                            <option value="middle-shelf">
                                Shelves
                            </option>

                            <option value="crisper">
                                Crisper Drawer
                            </option>

                            <option value="door">
                                Upper Door Shelf
                            </option>

                            <option value="door-lower">
                                Lower Door Shelf
                            </option>
                        </template>

                        <template v-else-if="form.storage === 'freezer'">
                            <option value="freezer-main">
                                Main Freezer
                            </option>
                        </template>

                        <template v-else>
                            <option value="dry-storage">
                                Pantry Shelves
                            </option>
                        </template>
                    </select>
                </div>

                <!-- Expiry date -->
                <div class="form-field">
                    <label for="food-expiry">Expiry Date</label>

                    <input
                        id="food-expiry"
                        v-model="form.expiresAt"
                        type="date"
                    >
                </div>

                <!-- Form actions -->
                <footer class="modal-actions">
                    <button
                        type="button"
                        class="cancel-button"
                        @click="emit('close')"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="save-button"
                        :disabled="saving"
                    >
                        {{ saving ? 'Saving…' : item ? 'Save Changes' : 'Add Food' }}
                    </button>
                </footer>
            </form>
        </section>
    </div>
</template>

<style scoped>
/* Dark background behind the modal. */
.modal-backdrop {
    position: fixed;
    z-index: 2000;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    overflow-y: auto;
    padding: 20px;

    background: rgb(18 35 27 / 55%);
}

/* The actual form container. */
.form-modal {
    width: 100%;
    max-width: 500px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;

    padding: 25px;
    border: 1px solid #e4ebe5;
    border-radius: 16px;

    background: white;
    box-shadow: 0 20px 60px rgb(0 0 0 / 20%);
}

.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 25px;
}

.eyebrow {
    margin: 0 0 8px;
    color: #167d68;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.3px;
}

.modal-header h2 {
    margin: 0;
    color: #24352f;
    font-size: 22px;
}

.close-button {
    width: 34px;
    height: 34px;
    border: 1px solid #e1e9e3;
    border-radius: 8px;
    background: white;
    color: #647168;
    font-size: 22px;
    cursor: pointer;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 17px;
}

.form-field label {
    color: #43534a;
    font-size: 12px;
    font-weight: 700;
}

.form-help {
    color: #78877d;
    font-size: 11px;
    line-height: 1.4;
}

.form-field input,
.form-field select {
    width: 100%;
    min-height: 43px;
    padding: 10px 12px;

    border: 1px solid #dce5de;
    border-radius: 8px;
    outline: none;

    background: white;
    color: #24352f;
    font-size: 13px;
}

.form-field input:focus,
.form-field select:focus {
    border-color: #167d68;
    box-shadow: 0 0 0 3px rgb(22 125 104 / 10%);
}

/* Quantity and unit fields sit side by side on wider screens. */
.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 13px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;

    margin-top: 25px;
    padding-top: 18px;
    border-top: 1px solid #e1e9e3;
}

.cancel-button,
.save-button {
    padding: 11px 17px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.cancel-button {
    border: 1px solid #e1e9e3;
    background: white;
    color: #647168;
}

.save-button {
    border: 1px solid #167d68;
    background: #167d68;
    color: white;
}

.save-button:hover {
    background: #105c4d;
}

.save-button:disabled {
    opacity: 0.65;
    cursor: wait;
}

@media (max-width: 480px) {
    .form-row {
        grid-template-columns: 1fr;
        gap: 0;
    }
}
</style>
