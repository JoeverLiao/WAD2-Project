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

import { reactive, ref, watch, nextTick } from 'vue'

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

    // Optional exact compartment passed by FridgeView. This lets the form
    // default to the Crisper Drawer or a specific shelf when opened there.
    defaultStorageZone: {
        type: String,
        default: ''
    },

    // The parent owns the API request; this prop keeps the form responsive
    // while that request is in flight and prevents repeated submissions.
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

// Focus is moved into the dialog on open, kept inside while tabbing, and
// returned to the opening control when the parent closes the form.
const dialogElement = ref(null)
let returnFocusElement = null

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
    // The inventory model no longer assumes every food has one unit.
    // Start blank so the user records the actual quantity.
    quantity: '',
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
        if (!props.visible) {
            nextTick(() => returnFocusElement?.focus?.())
            return
        }

        // Capture the trigger once per open; later field edits should not
        // replace it with an element inside the dialog that will be removed.
        if (!dialogElement.value) returnFocusElement = document.activeElement
        nextTick(() => dialogElement.value?.querySelector('input')?.focus())

        if (props.item) {
            // Editing: copy the existing values into the form.
            form.name = props.item.name
            form.quantity = props.item.quantity ?? ''
            form.unit = props.item.unit
            form.storage = props.item.storage
            form.storageZone = props.item.storageZone
            form.expiresAt = props.item.expiresAt || ''
        } else {
            // Adding: start with an empty form.
            form.name = ''
            form.quantity = ''
            form.unit = 'pieces'
            form.storage = props.defaultStorage
            // Prefer the exact area the user clicked. Otherwise use the
            // standard default for fridge, freezer or pantry.
            form.storageZone = props.defaultStorageZone || getDefaultZone(props.defaultStorage)
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

    // Native `required`, `min`, and `type=number` constraints show errors
    // beside the fields without interrupting the user with browser alerts.
    if (!trimmedName || !Number.isFinite(Number(form.quantity)) || Number(form.quantity) <= 0 || props.saving) return

    // Emit a clean copy rather than exposing the reactive form.
    emit('save', {
        name: trimmedName,
        quantity: Number(form.quantity),
        unit: form.unit,
        storage: form.storage,
        storageZone: form.storageZone,
        expiresAt: form.expiresAt
    })
}

// Escape closes the dialog, and Tab/Shift+Tab cycle through its controls.
function handleDialogKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault()
        emit('close')
        return
    }

    if (event.key !== 'Tab') return
    const focusable = [...dialogElement.value.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
    )]
    if (!focusable.length) return

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
            ref="dialogElement"
            class="form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-form-title"
            tabindex="-1"
            @keydown="handleDialogKeydown"
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

                <!-- Quantity and unit share one row. -->
                <div class="form-row">
                    <div class="form-field">
                        <label for="food-quantity">Quantity *</label>

                        <input
                            id="food-quantity"
                            v-model.number="form.quantity"
                            type="number"
                            min="0.01"
                            step="any"
                            required
                        >
                    </div>

                    <div class="form-field">
                        <label for="food-unit">Unit</label>

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
                            <option value="upper-shelf">
                                Upper Shelf
                            </option>

                            <option value="middle-shelf">
                                Middle Shelf
                            </option>

                            <option value="lower-shelf">
                                Lower Shelf
                            </option>

                            <option value="crisper">
                                Crisper Drawer
                            </option>

                            <option value="door-lower">Lower door shelf</option>
                            <option value="door">
                                Upper door shelf
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

    background: rgb(18 35 27 / 58%);
    backdrop-filter: blur(4px);
}

/* The paper surface, bold outline, and offset shadow match the fridge page. */
.form-modal {
    width: 100%;
    max-width: 500px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;

    padding: 25px;
    border: 2px solid var(--ink, #123f3b);
    border-radius: 17px;

    background: var(--paper, #fdfaf3);
    box-shadow: var(--shadow-paper, 6px 8px 0 #123f3b), 0 20px 60px rgb(0 0 0 / 20%);
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
    color: var(--ink, #123f3b);
    font-family: var(--font-display, "Kalam", cursive, sans-serif);
    font-size: 27px;
}

.close-button {
    width: 34px;
    height: 34px;
    border: 2px solid var(--ink, #123f3b);
    border-radius: 8px;
    background: white;
    color: var(--ink, #123f3b);
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
    font-size: 16px;
    font-weight: 700;
}

.form-field input,
.form-field select {
    width: 100%;
    min-height: 43px;
    padding: 10px 12px;

    border: 2px solid #b8d1c9;
    border-radius: 8px;
    outline: none;

    background: var(--paper-bright, #fbfffd);
    color: var(--ink, #123f3b);
    font-size: 17px;
}

.form-field input:focus,
.form-field select:focus {
    border-color: var(--teal, #0fa89c);
    box-shadow: 0 0 0 3px rgb(15 168 156 / 16%);
    outline: 2px solid transparent;
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
    border-top: 2px dashed #b8d1c9;
}

.cancel-button,
.save-button {
    padding: 11px 17px;
    border: 2px solid var(--ink, #123f3b);
    border-radius: 9px;
    box-shadow: 2px 3px 0 var(--ink, #123f3b);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
}

.cancel-button {
    background: var(--paper-bright, #fbfffd);
    color: var(--ink, #123f3b);
}

.save-button {
    background: var(--teal, #0fa89c);
    color: white;
}

.save-button:hover {
    background: #087d73;
}

.save-button:disabled {
    cursor: wait;
    opacity: .72;
    transform: none;
    box-shadow: 2px 3px 0 var(--ink, #123f3b);
}

.form-modal:focus { outline: none; }

/* Preserve visible focus for keyboard users across both modal actions and fields. */
.form-modal button:focus-visible,
.form-modal input:focus-visible,
.form-modal select:focus-visible {
    outline: 3px solid #f0b93d;
    outline-offset: 2px;
}

@media (max-width: 480px) {
    .form-row {
        grid-template-columns: 1fr;
        gap: 0;
    }
}
</style>
