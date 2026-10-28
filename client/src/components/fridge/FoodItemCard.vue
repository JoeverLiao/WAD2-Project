<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'

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
    'consume',
    'drag-start',
    'drag-end'
])

// Reactions start only after the parent confirms the inventory update succeeded.
const animation = ref('')
const chompCount = ref(0)
const currentChomp = ref(0)
const busy = ref(false)
let animationTimer = null
let chompInterval = null

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

// Run the reaction on the button after a successful inventory update.
function startReaction(type, details = {}) {
    clearTimeout(animationTimer)
    clearInterval(chompInterval)

    busy.value = true

    if (type === 'consume') {
        animation.value = 'consume'
        const amount = Number(details.amount) || 1
        chompCount.value = Math.max(1, Math.min(5, Math.ceil(amount / 2)))
        currentChomp.value = 0

        chompInterval = setInterval(() => {
            currentChomp.value += 1
            if (currentChomp.value >= chompCount.value) {
                clearInterval(chompInterval)
                chompInterval = null
            }
        }, 220)

        animationTimer = setTimeout(finishReaction, 700 + chompCount.value * 220)
    } else {
        const proportion = Number(details.proportion) || 0
        const level = proportion >= 0.75 ? 'strong' : proportion >= 0.35 ? 'medium' : 'gentle'
        animation.value = `discard-${level}`
        animationTimer = setTimeout(finishReaction, level === 'strong' ? 850 : 650)
    }
}

function finishReaction() {
    clearTimeout(animationTimer)
    clearInterval(chompInterval)
    animationTimer = null
    chompInterval = null
    animation.value = ''
    chompCount.value = 0
    currentChomp.value = 0
    busy.value = false
}

// The parent calls the callback only after confirmation and a successful API update.
function handleConsume() {
    if (busy.value) return
    emit('consume', props.item, details => startReaction('consume', details))
}

// Drag-and-drop remains unchanged.
function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', String(props.item.id))
    event.dataTransfer.effectAllowed = 'move'
    emit('drag-start', props.item)
}

function handleDragEnd() {
    emit('drag-end')
}

onBeforeUnmount(() => {
    clearTimeout(animationTimer)
    clearInterval(chompInterval)
})
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

        <h4>{{ item.name }}</h4>

        <p class="quantity">
            {{ item.quantity }} {{ item.unit }}
        </p>

        <span class="expiry-badge" :class="expiryClass">
            {{ expiryStatus }}
        </span>

        <div class="food-actions">
            <button
                type="button"
                class="action-button consume-button"
                :class="{ 'button-consuming': animation === 'consume' }"
                title="Record food consumed"
                :disabled="busy"
                @click.stop="handleConsume"
            >
                <span class="button-emoji consume-emoji" aria-hidden="true">
                    {{ animation === 'consume' ? (currentChomp % 2 ? '🤤' : '😋') : '😋' }}
                </span>
                <span>{{ animation === 'consume' ? 'Nom nom!' : 'Consume' }}</span>
                <span v-if="animation === 'consume'" class="mini-sparkle" aria-hidden="true">✨</span>
            </button>

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

/* Button animations: reactions stay on the button itself. */
.button-emoji {
    display: inline-block;
    font-size: 18px;
    line-height: 1;
    vertical-align: middle;
}

.button-consuming {
    background: #c8f4d5;
    animation: consume-button-bounce 0.22s ease-in-out infinite alternate;
}

.button-consuming .consume-emoji {
    animation: face-chomp 0.22s ease-in-out infinite alternate;
}


.mini-sparkle {
    display: inline-block;
    margin-left: 2px;
    animation: sparkle-tiny 0.45s ease-in-out infinite alternate;
}

@keyframes consume-button-bounce {
    from { transform: translateY(0) scale(1); }
    to { transform: translateY(-2px) scale(1.025); }
}

@keyframes face-chomp {
    from { transform: scale(1) rotate(-4deg); }
    to { transform: scale(1.18) rotate(4deg); }
}


@keyframes sparkle-tiny {
    from { transform: scale(0.7) rotate(-12deg); opacity: 0.45; }
    to { transform: scale(1.15) rotate(12deg); opacity: 1; }
}

/* Discard is slower and deliberately less celebratory. */
.bin-emoji { transform-origin: 50% 80%; }

.bin-gentle .bin-emoji {
    animation: bin-wobble-gentle 0.28s ease-in-out 2;
}

.bin-medium .bin-emoji {
    animation: bin-wobble-medium 0.22s ease-in-out 3;
}

.bin-strong .bin-emoji {
    animation: bin-wobble-strong 0.18s ease-in-out 4;
}

@keyframes bin-wobble-gentle {
    0%, 100% { transform: rotate(0); }
    35% { transform: rotate(-5deg) translateY(1px); }
    70% { transform: rotate(5deg) translateY(1px); }
}

@keyframes bin-wobble-medium {
    0%, 100% { transform: rotate(0); }
    30% { transform: rotate(-10deg) translateY(1px); }
    65% { transform: rotate(10deg) translateY(2px); }
}

@keyframes bin-wobble-strong {
    0%, 100% { transform: rotate(0); }
    25% { transform: rotate(-13deg) translateY(2px); }
    55% { transform: rotate(13deg) translateY(2px); }
    80% { transform: rotate(-7deg); }
}

/* Card header */
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

.food-card:hover .icon-button,
.food-card:focus-within .icon-button,
.icon-button:focus-visible {
    opacity: 1;
    visibility: visible;
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

/* Action buttons */
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
    transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.action-button:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 3px 4px 0 var(--ink);
}

.action-button:active:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 var(--ink);
}

.action-button:disabled {
    cursor: wait;
    opacity: 0.7;
}

.consume-button {
    background: var(--aqua-soft);
}

.consume-button:hover:not(:disabled) {
    background: var(--lime);
}

.discard-button {
    background: var(--coral);
}

.discard-button:hover:not(:disabled) {
    background: #ff8170;
}

.icon-button:focus-visible,
.action-button:focus-visible {
    outline: 3px dashed var(--aqua);
    outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
    .food-card,
    .button-emoji,
    .mini-sparkle {
        animation: none !important;
        transition: none !important;
    }
}
</style>

