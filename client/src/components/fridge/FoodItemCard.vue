<script setup>
// ============================================================
// FOOD ITEM CARD
//
// Purpose:
// Display one food item in the Smart Fridge interface.
// ============================================================

import { computed } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// ------------------------------------------------------------
// 1. PROPS
//
// Props allow the parent component (FridgeView.vue) to pass
// information into this component.
//
// item contains the food's name, quantity, storage and expiry.
// ------------------------------------------------------------

const props = defineProps({
    item: {
        type: Object,
        required: true
    },
    amount: { type: String, default: '' },
    storageWarning: { type: String, default: '' },
    dietLabel: { type: String, default: '' },
    dragging: { type: Boolean, default: false },
    storageOptions: { type: Array, default: () => [] },
    busy: Boolean,
})

// ------------------------------------------------------------
// 2. EVENTS
//
// This component displays buttons, but the parent owns the
// inventory data.
//
// Therefore, clicking Edit or Remove sends an event to the
// parent instead of directly changing the inventory.
// ------------------------------------------------------------

const emit = defineEmits([
    'edit',
    'remove',
    'consume',
    'discard',
    'move-storage',
    'reveal',
    'drag-start',
    'drag-end'
])

// ------------------------------------------------------------
// 3. RECORDED AMOUNT
//
// Show quantity or weight without inventing a default amount.
// ------------------------------------------------------------

const itemAmount = computed(() => {
    if (props.amount) return props.amount
    const quantity = Number(props.item.quantity)
    if (Number.isFinite(quantity) && quantity > 0) {
        return `${props.item.quantity} ${props.item.unit || 'items'}`
    }
    const weight = Number(props.item.weightKg)
    if (Number.isFinite(weight) && weight > 0) return `${props.item.weightKg} kg`
    return 'Quantity not recorded'
})

// ------------------------------------------------------------
// 4. EXPIRY STATUS
//
// Compare the expiry date with today's date.
//
// This is a basic display indicator, not a guarantee that food
// is safe or unsafe to eat.
// ------------------------------------------------------------

const expiryStatus = computed(() => {
    if (!props.item.expiresAt) {
        return 'No expiry date'
    }

    // Use local calendar dates rather than comparing the current
    // time against midnight on the expiry date.
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expiry = new Date(`${props.item.expiresAt}T00:00:00`)

    // An invalid date should not break the card.
    if (Number.isNaN(expiry.getTime())) {
        return 'Invalid expiry date'
    }

    const daysRemaining = Math.round(
        (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    )

    if (daysRemaining < 0) {
        return 'Expired'
    }

    if (daysRemaining === 0) {
        return 'Expires today'
    }

    if (daysRemaining <= 3) {
        return `Expires in ${daysRemaining} day(s)`
    }

    return `Expires ${expiry.toLocaleDateString()}`
})

// Assign a CSS class according to the expiry status.
const expiryClass = computed(() => {
    if (
        expiryStatus.value === 'Expired' ||
        expiryStatus.value === 'Expires today'
    ) {
        return 'expiry-danger'
    }

    if (expiryStatus.value.startsWith('Expires in')) {
        return 'expiry-warning'
    }

    return 'expiry-normal'
})

// ------------------------------------------------------------
// 5. DRAG AND DROP
//
// HTML's draggable attribute allows users to drag the card.
//
// We tell the parent which item is being dragged.
// The parent handles moving the item between storage areas.
// ------------------------------------------------------------

function handleDragStart(event) {
    // Set the item's ID as the dragged data.
    event.dataTransfer.setData(
        'text/plain',
        String(props.item.id)
    )

    event.dataTransfer.effectAllowed = 'move'

    // Notify FridgeView.vue that dragging has started.
    emit('drag-start', props.item, event)
}

function handleDragEnd() {
    // Notify the parent that dragging has finished.
    emit('drag-end')
}
</script>

<template>
    <!--
        The entire card can be dragged to another storage area.
        The buttons inside the card provide edit/remove actions.
    -->
    <article
        class="food-card"
        :class="{ 'food-is-held': dragging }"
        draggable="true"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <!-- Food emoji and edit/remove controls -->
        <div class="card-top">
            <button type="button" class="food-emoji" :disabled="busy"
                :aria-label="`Show ${item.name} in ${item.storage === 'pantry' ? 'pantry' : 'fridge'}`"
                title="Show food in its storage location" @click.stop="emit('reveal', item)">
                <FoodIcon :item="item" />
            </button>

            <div class="card-actions">
                <!-- Send the selected item to the parent's edit form. -->
                <button
                    type="button"
                    class="icon-button"
                    title="Edit food"
                    aria-label="Edit food"
                    :disabled="busy"
                    @click.stop="emit('edit', item)"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>
                </button>

                <!-- Ask the parent to remove the selected item. -->
                <button
                    type="button"
                    class="icon-button remove-icon"
                    title="Remove food"
                    aria-label="Remove food"
                    :disabled="busy"
                    @click.stop="emit('remove', item)"
                >
                    ×
                </button>
            </div>
        </div>

        <!-- Food information -->
        <h4>{{ item.name }}</h4>

        <p class="quantity">
            {{ itemAmount }}
        </p>

        <p v-if="dietLabel" class="diet-badge">{{ dietLabel }}</p>
        <p v-if="storageWarning" class="storage-warning" role="note">{{ storageWarning }}</p>

        <!-- Colour-coded expiry status -->
        <span
            class="expiry-badge"
            :class="expiryClass"
        >
            {{ expiryStatus }}
        </span>
        <label v-if="storageOptions.length" class="food-storage-move" @click.stop>
            Move to another location
            <select :disabled="busy" :aria-label="`Move ${item.name} to another location`"
                @change="emit('move-storage', { item, destination: JSON.parse($event.target.value) }); $event.target.value = ''">
                <option value="" disabled selected>Choose fridge or pantry…</option>
                <option v-for="option in storageOptions" :key="option.type + ':' + option.name"
                    :value="JSON.stringify({ type: option.type, name: option.name })">{{ option.label }}</option>
            </select>
        </label>
        <div class="food-quantity-actions">
            <button type="button" class="consume-button" :disabled="busy" @click.stop="emit('consume', item)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 13c1 4 7 4 8 0M8 8v2m8-2v2"/></svg>
                Consume
            </button>
            <button type="button" class="discard-button" :disabled="busy" @click.stop="emit('discard', item)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>
                Discard
            </button>
        </div>
    </article>
</template>

<style scoped>
.food-card {
    --card-ink:#173d39;
    display:flex; flex-direction:column; min-width:0; box-sizing:border-box;
    padding:18px; border:2px solid var(--card-ink); border-radius:18px;
    background:#fff; color:var(--card-ink); box-shadow:3px 4px 0 #173d391c;
    cursor:grab; font-family:var(--font-sans,"Patrick Hand",cursive,sans-serif);
    transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;
}
.food-card:hover,.food-card:focus-within { transform:translateY(-3px); box-shadow:4px 7px 0 #173d3930; border-color:#087d73; }
.food-card:active { cursor:grabbing; }
.food-card.food-is-held { opacity:.35; }
.card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
.food-emoji {
    display:grid; place-items:center; flex:none; width:76px; height:76px;
    border:1px solid #b4d9d2; border-radius:22px; background:#e8f7f2;
    padding:0; cursor:pointer;
    transform:rotate(-5deg); transition:transform .3s ease;
}
.food-emoji :deep(.food-icon) { width:64px; height:64px; }
.food-card:hover .food-emoji { transform:rotate(4deg) scale(1.05); }
.card-actions { display:flex; gap:6px; }
.icon-button { display:grid; place-items:center; width:40px; height:40px; padding:8px; border:1px solid #b8d6cf; border-radius:12px; background:#f8fdfa; color:var(--card-ink); cursor:pointer; transition:background .2s,transform .2s; }
.icon-button svg { width:21px; height:21px; }
.icon-button:hover { background:#d7f2e9; transform:rotate(-7deg); }
.remove-icon { color:#ac4035; font:26px/1 sans-serif; }
.remove-icon:hover { background:#ffe4df; }
h4 { margin:0 0 5px; overflow-wrap:anywhere; color:var(--card-ink); font-size:23px; line-height:1.25; font-weight:700; }
.quantity { margin:0 0 14px; color:#527871; font-size:18px; }
.diet-badge { align-self:flex-start; margin:0 0 10px; padding:4px 9px; border-radius:8px; background:#f0f5df; color:#506630; font-size:14px; }
.storage-warning { margin:0 0 12px; padding:10px 12px; border:1px dashed #d2ad4d; border-radius:12px; background:#fff7de; color:#78581c; font-size:15px; line-height:1.45; }
.expiry-badge { align-self:flex-start; max-width:100%; box-sizing:border-box; margin-bottom:4px; padding:6px 10px; border:1px solid currentColor; border-radius:10px; font-size:15px; line-height:1.35; overflow-wrap:anywhere; }
.expiry-normal { background:#e8f5ed; color:#2f7050; }
.expiry-warning { background:#fff0b5; color:#866016; }
.expiry-danger { background:#ffe2dc; color:#ab3c32; }
.food-storage-move { display:grid; gap:6px; margin-top:16px; color:#527871; font-size:15px; }
.food-storage-move select { min-width:0; width:100%; min-height:44px; box-sizing:border-box; padding:8px 10px; border:1px solid #8bb8a6; border-radius:10px; background:#f7fffa; color:var(--card-ink); font:inherit; cursor:pointer; }
.food-quantity-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:auto; padding-top:18px; }
.food-quantity-actions button { display:flex; align-items:center; justify-content:center; gap:6px; min-height:44px; padding:8px; border:1px solid var(--card-ink); border-radius:12px; font:700 16px var(--font-sans,"Patrick Hand",cursive,sans-serif); cursor:pointer; transition:transform .18s,box-shadow .18s; }
.food-quantity-actions svg { width:20px; height:20px; flex:none; }
.consume-button { background:#dff0a0; color:#254c34; }
.discard-button { background:#fff0eb; color:#a03d32; }
.food-quantity-actions button:hover { transform:translateY(-2px); box-shadow:0 3px 0 #173d3926; }
.food-quantity-actions button:active { transform:translateY(1px); box-shadow:none; }
button:disabled,select:disabled { opacity:.5; cursor:wait; transform:none!important; }
button:focus-visible,select:focus-visible { outline:3px solid #edbc42; outline-offset:3px; }
@media (max-width:600px) { .icon-button { width:44px; height:44px; } }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none!important; animation:none!important; } }
</style>
