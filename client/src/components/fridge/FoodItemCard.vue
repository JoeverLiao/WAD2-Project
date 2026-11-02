<script setup>
import { computed } from 'vue'
import FoodIcon from '../FoodIcon.vue'

// The parent provides the food item.
const props = defineProps({
    dragging: { type: Boolean, default: false },
    item: {
        type: Object,
        required: true
    }
})

// The parent still handles inventory changes and API requests.
const emit = defineEmits([
    'edit',
    'remove',
    'consume',
    'discard',
    'drag-start',
    'drag-end'
])

// Expiry status.
const expiryStatus = computed(() => {
    if (!props.item.expiresAt) return 'No expiry date'

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expiry = new Date(`${props.item.expiresAt}T00:00:00`)

    if (Number.isNaN(expiry.getTime())) return 'Invalid expiry date'

    const daysRemaining = Math.round(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysRemaining < 0) return 'Expired'
    if (daysRemaining === 0) return 'Expires today'
    if (daysRemaining <= 3) return `Expires in ${daysRemaining} day(s)`

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

// Suppress the native snapshot; the parent supplies an animated food preview.
function setEmojiDragImage(event) {
    if (!event.dataTransfer) return

    // An empty canvas keeps the native drag image transparent.
    const size = 72
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    // Browsers can ignore drag images that are not rendered in the document.
    // Keep the transparent canvas under the pointer until the drag snapshot is taken.
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

function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', String(props.item.id))
    event.dataTransfer.effectAllowed = 'move'
    setEmojiDragImage(event)
    emit('drag-start', props.item, event)
}

function handleDragEnd() {
    emit('drag-end')
}
</script>

<template>
    <article
        class="food-card"
        :data-food-id="item.id"
        :class="{ 'food-is-held': dragging }"
        draggable="true"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <div class="card-top">
            <span class="food-emoji"><FoodIcon :food="item.name" /></span>

            <div class="card-tools" role="group" aria-label="Food item controls">
                <button type="button" class="icon-button" title="Edit food" :aria-label="`Edit ${item.name}`" @click.stop="emit('edit', item)">
                    ✏️
                </button>
                <button type="button" class="icon-button remove-icon-button" title="Remove food" :aria-label="`Remove ${item.name}`" @click.stop="emit('remove', item)">
                    ×
                </button>
            </div>
        </div>

        <h4>{{ item.name }}</h4>

        <p class="quantity">
            {{ item.quantity }} {{ item.unit }}
        </p>

        <span class="expiry-badge" :class="expiryClass" :aria-label="`Expiry status: ${expiryStatus}`">
            {{ expiryStatus }}
        </span>
        <div class="food-quantity-actions" role="group" :aria-label="`Use ${item.name}`">
            <button type="button" @click.stop="emit('consume', item)">😊 Consume</button>
            <button type="button" @click.stop="emit('discard', item)">🗑 Discard</button>
        </div>
    </article>
</template>

<style scoped>
.food-card {
    position: relative;
    min-width: 0;
    padding: 14px;
    overflow: visible;

    background: var(--paper-bright);
    color: var(--ink);

    border: 3px solid var(--ink);
    border-radius: 0 16px 16px 16px;
    box-shadow: var(--shadow-small);

    cursor: grab;

    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        background 0.25s ease;
}

.food-card:hover {
    transform: translate(-1px, -2px);
    box-shadow: var(--shadow-paper);
}

.food-card:active {
    cursor: grabbing;
}

.food-is-held { background: #fff6cc; outline: 3px solid #e4aa28; }
.food-is-held .food-emoji { animation: held-wiggle .28s ease-in-out infinite alternate; }
@keyframes held-wiggle { from { transform: scale(1.2) rotate(-7deg); } to { transform: scale(1.2) rotate(7deg); } }

/* Card header */
.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}

/* Keep the small edit and remove controls together and visible on touch screens. */
.card-tools {
    display: flex;
    gap: 6px;
}

.food-emoji {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border: 2px solid var(--ink);
    border-radius: 12px;
    background: var(--aqua-soft);
    font-size: 32px;
}

.icon-button {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.15s ease, background 0.15s ease;
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

.remove-icon-button {
    color: #8d3832;
}

.food-card:hover .icon-button,
.food-card:focus-within .icon-button,
.icon-button:focus-visible {
    opacity: 1;
    visibility: visible;
}

@media (hover: none) {
    .icon-button {
        opacity: 1;
        visibility: visible;
    }
}

.icon-button:hover {
    background: var(--yellow);
}

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

.icon-button:focus-visible {
    outline: 3px dashed var(--aqua);
    outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
    .food-card {
        animation: none !important;
        transition: none !important;
    }
}
.food-quantity-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.food-quantity-actions button { padding:8px 12px; border:1px solid #739c90; border-radius:8px; background:#edf8f3; color:#214a3c; font:inherit; font-size:16px; cursor:pointer; }
.food-quantity-actions button:last-child { background:#fff0eb; border-color:#c59887; }
</style>

