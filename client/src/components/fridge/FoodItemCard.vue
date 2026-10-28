<script setup>
import { computed } from 'vue'

// The parent provides the food item.
const props = defineProps({
    item: {
        type: Object,
        required: true
    }
})

// The parent still handles inventory changes and API requests.
const emit = defineEmits([
    'edit',
    'remove',
    'drag-start',
    'drag-end'
])

// Food emoji.
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

// Use an emoji-only preview for drag operations.
function setEmojiDragImage(event) {
    if (!event.dataTransfer) return

    // Draw the food emoji on a transparent canvas so the native drag preview
    // shows the food being held instead of a snapshot of the full card.
    const size = 72
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return

    context.font = '52px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(foodEmoji.value, size / 2, size / 2)

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
        <div class="card-top">
            <span class="food-emoji">{{ foodEmoji }}</span>

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
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border: 2px solid var(--ink);
    border-radius: 12px;
    background: var(--aqua-soft);
    font-size: 24px;
}

.icon-button {
    opacity: 0;
    visibility: hidden;
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
</style>

