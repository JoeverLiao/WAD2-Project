
<script setup>
import { computed } from 'vue'

// ============================================================
// 1. PROPS
// ============================================================

// The parent component supplies the food item to display.
const props = defineProps({
    item: {
        type: Object,
        required: true
    }
})

// ============================================================
// 2. EVENTS
// ============================================================

// The parent handles all inventory changes and API requests.
const emit = defineEmits([
    'edit',
    'remove',
    'consume',
    'discard',
    'drag-start',
    'drag-end'
])

// ============================================================
// 3. FOOD EMOJI
// ============================================================

const foodEmoji = computed(() => {
    const name = props.item.name.toLowerCase()

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

    return '🍱'
})

// ============================================================
// 4. EXPIRY STATUS
// ============================================================

const expiryStatus = computed(() => {
    if (!props.item.expiresAt) {
        return 'No expiry date'
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expiry = new Date(`${props.item.expiresAt}T00:00:00`)

    if (Number.isNaN(expiry.getTime())) {
        return 'Invalid expiry date'
    }

    const daysRemaining = Math.round(
        (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    )

    if (daysRemaining < 0) return 'Expired'
    if (daysRemaining === 0) return 'Expires today'

    if (daysRemaining <= 3) {
        return `Expires in ${daysRemaining} day(s)`
    }

    return `Expires ${expiry.toLocaleDateString()}`
})

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

// ============================================================
// 5. DRAG AND DROP
// ============================================================

function handleDragStart(event) {
    event.dataTransfer.setData(
        'text/plain',
        String(props.item.id)
    )

    event.dataTransfer.effectAllowed = 'move'

    emit('drag-start', props.item)
}

function handleDragEnd() {
    emit('drag-end')
}
</script>

<template>
    <article
        class="food-card"
        draggable="true"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <!-- Card header -->
        <div class="card-top">
            <span class="food-emoji">
                {{ foodEmoji }}
            </span>

            <button
                type="button"
                class="icon-button"
                title="Edit food"
                aria-label="Edit food"
                @click.stop="emit('edit', item)"
            >
                ✏️
            </button>
        </div>

        <!-- Food details -->
        <h4>{{ item.name }}</h4>

        <p class="quantity">
            {{ item.quantity }} {{ item.unit }}
        </p>

        <!-- Expiry status -->
        <span
            class="expiry-badge"
            :class="expiryClass"
        >
            {{ expiryStatus }}
        </span>

        <!-- Inventory actions -->
        <div class="food-actions">
            <button
                type="button"
                class="action-button consume-button"
                title="Record food consumed"
                @click.stop="emit('consume', item)"
            >
                🍽️ Consume
            </button>

            <button
                type="button"
                class="action-button discard-button"
                title="Discard food"
                @click.stop="emit('discard', item)"
            >
                🗑️ Discard
            </button>
        </div>
    </article>
</template>

<style scoped>
/* ============================================================
   FOOD CARD — SHARED FULL CIRCLE DESIGN
   ============================================================ */

.food-card {
    min-width: 0;
    padding: 14px;

    background: var(--paper-bright);
    color: var(--ink);

    border: 3px solid var(--ink);
    border-radius: 0 16px 16px 16px;
    box-shadow: var(--shadow-small);

    cursor: grab;

    transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
}

.food-card:hover {
    transform: translate(-1px, -2px);
    box-shadow: var(--shadow-paper);
}

.food-card:active {
    cursor: grabbing;
}

/* Emoji and edit button */
.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}

.food-emoji {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 42px;
    height: 42px;
    flex-shrink: 0;

    border: 2px solid var(--ink);
    border-radius: 12px;

    background: var(--aqua-soft);
    font-size: 24px;
}

.icon-button {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 34px;
    height: 34px;
    padding: 0;

    border: 2px solid var(--ink);
    border-radius: 9px;

    background: var(--yellow-sticky);
    box-shadow: 2px 3px 0 var(--ink);

    cursor: pointer;
}

.icon-button:hover {
    background: var(--yellow);
}

/* Food name */
h4 {
    margin: 0 0 5px;

    color: var(--ink);
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;

    overflow-wrap: anywhere;
}

.quantity {
    margin: 0 0 10px;

    color: var(--muted);
    font-size: 15px;
}

/* Expiry label */
.expiry-badge {
    display: inline-block;
    max-width: 100%;
    padding: 4px 8px;

    border: 2px solid var(--ink);
    border-radius: 8px;

    font-size: 13px;
    font-weight: 700;
    line-height: 1.4;

    overflow-wrap: anywhere;
}

.expiry-normal {
    background: var(--lime);
    color: var(--ink);
}

.expiry-warning {
    background: var(--yellow-sticky);
    color: var(--ink);
}

.expiry-danger {
    background: var(--coral);
    color: var(--ink);
}

/* Consume and discard buttons */
.food-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
}

.action-button {
    flex: 1 1 90px;

    min-height: 36px;
    padding: 6px 8px;

    border: 2px solid var(--ink);
    border-radius: 9px;
    box-shadow: 2px 3px 0 var(--ink);

    color: var(--ink);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 700;

    cursor: pointer;

    transition:
        transform 0.1s ease,
        box-shadow 0.1s ease;
}

.action-button:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 4px 0 var(--ink);
}

.action-button:active {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 var(--ink);
}

.consume-button {
    background: var(--aqua-soft);
}

.consume-button:hover {
    background: var(--lime);
}

.discard-button {
    background: var(--coral);
}

.discard-button:hover {
    background: #ff8170;
}

/* Keyboard accessibility */
.icon-button:focus-visible,
.action-button:focus-visible {
    outline: 3px dashed var(--aqua);
    outline-offset: 3px;
}
</style>

