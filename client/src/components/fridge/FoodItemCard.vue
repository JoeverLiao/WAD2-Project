<script setup>
// ============================================================
// FOOD ITEM CARD
//
// Purpose:
// Display one food item in the Smart Fridge interface.
// ============================================================

import { computed } from 'vue'

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
    'move-storage',
    'drag-start',
    'drag-end'
])

// ------------------------------------------------------------
// 3. FOOD EMOJI
//
// Display a simple emoji based on the food's name.
// This is only for presentation; it does not affect storage.
// ------------------------------------------------------------

const foodEmoji = computed(() => {
    const name = String(props.item.name || '').toLowerCase()

    if (name.includes('milk')) return '🥛'
    if (name.includes('egg')) return '🥚'
    if (name.includes('carrot')) return '🥕'
    if (name.includes('broccoli')) return '🥦'
    if (name.includes('chicken')) return '🍗'
    if (name.includes('fish')) return '🐟'
    if (name.includes('rice')) return '🍚'
    if (name.includes('pasta')) return '🍝'
    if (name.includes('bread')) return '🍞'
    if (name.includes('cheese')) return '🧀'
    if (name.includes('ice cream')) return '🍦'

    // Use a generic food emoji if there is no matching rule.
    return '🍱'
})

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
            <span class="food-emoji">
                {{ foodEmoji }}
            </span>

            <div class="card-actions">
                <!-- Send the selected item to the parent's edit form. -->
                <button
                    type="button"
                    class="icon-button"
                    title="Edit food"
                    aria-label="Edit food"
                    @click.stop="emit('edit', item)"
                >
                    ✏️
                </button>

                <!-- Ask the parent to remove the selected item. -->
                <button
                    type="button"
                    class="icon-button remove-icon"
                    title="Remove food"
                    aria-label="Remove food"
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
                    :value="JSON.stringify({ type: option.type, name: option.name })">{{ option.label }} ({{ option.type }})</option>
            </select>
        </label>
    </article>
</template>

<style scoped>
/* Main appearance of an individual food card. */
.food-card {
    min-width: 0;
    padding: 14px;
    border: 1px solid #e1e9e3;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgb(0 0 0 / 3%);

    /* The grab cursor indicates that the card can be dragged. */
    cursor: grab;

    transition:
        border-color 0.2s,
        box-shadow 0.2s,
        transform 0.2s;
}

.food-card:hover {
    border-color: #9bcdb7;
    box-shadow: 0 4px 12px rgb(0 0 0 / 7%);
    transform: translateY(-1px);
}

.food-card:active {
    cursor: grabbing;
}

/* Emoji and buttons share the same row. */
.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
}

.food-emoji {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #f1f6f1;
    font-size: 23px;
}

/* Edit and remove buttons. */
.card-actions {
    display: flex;
    gap: 3px;
}

.icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
}

.icon-button:hover {
    border-color: #e0e8e1;
    background: #f5f8f5;
}

.remove-icon {
    color: #b33d35;
    font-size: 20px;
}

/* Food name and quantity. */
h4 {
    margin: 0 0 6px;
    overflow-wrap: anywhere;
    color: #263b30;
    font-size: 14px;
    font-weight: 750;
}

.quantity {
    margin: 0 0 12px;
    color: #78877d;
    font-size: 12px;
}

.diet-badge {
    display: inline-block;
    margin: 0 0 8px;
    padding: 4px 7px;
    border-radius: 999px;
    background: #edf3e9;
    color: #52664e;
    font-size: 11px;
    font-weight: 700;
}

.storage-warning {
    margin: 0 0 10px;
    padding: 8px 9px;
    border: 1px solid #e6bd66;
    border-radius: 8px;
    background: #fff5d9;
    color: #704d13;
    font-size: 12px;
    line-height: 1.45;
}

.food-card.food-is-held {
    opacity: 0.35;
}

/* Common appearance for expiry labels. */
.expiry-badge {
    display: inline-block;
    max-width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

/* Green: no immediate expiry warning. */
.expiry-normal {
    background: #e7f5eb;
    color: #267446;
}

/* Amber: expiry is approaching. */
.expiry-warning {
    background: #fff1d8;
    color: #996313;
}

/* Red: expired or expires today. */
.expiry-danger {
    background: #ffe5e3;
    color: #b33d35;
}
.food-storage-move { display:grid; gap:5px; margin-top:14px; color:#557b77; font-size:15px; }
.food-storage-move select { min-width:0; width:100%; min-height:44px; padding:6px 10px; border:1px solid #8bb8a6; border-radius:10px; background:#f7fffa; color:#234d3b; font:inherit; }
</style>
