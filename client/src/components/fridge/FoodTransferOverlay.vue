<script setup>
import FoodIcon from '../FoodIcon.vue'

defineProps({
  flights: { type: Array, default: () => [] },
  announcement: { type: String, default: '' },
})
const emit = defineEmits(['complete'])
function flightStyle(flight) {
  return {
    '--from-x': `${flight.from.x}px`,
    '--from-y': `${flight.from.y}px`,
    '--mid-x': `${(flight.from.x + flight.to.x) / 2}px`,
    '--mid-y': `${Math.max(28, Math.min(flight.from.y, flight.to.y) - 56)}px`,
    '--to-x': `${flight.to.x}px`,
    '--to-y': `${flight.to.y}px`,
    animationDelay: `${flight.delay}ms`,
  }
}
</script>

<template>
  <Teleport to="body">
    <span class="visually-hidden" role="status" aria-live="polite">{{
      announcement
    }}</span>
    <div v-if="flights.length" class="food-transfer-layer" aria-hidden="true">
      <div
        v-for="flight in flights"
        :key="flight.id"
        class="food-transfer-flight"
        :style="flightStyle(flight)"
        @animationend.self="emit('complete', flight.id)"
      >
        <FoodIcon :food="flight.name" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.food-transfer-layer {
  position: fixed;
  inset: 0;
  z-index: 10002;
  pointer-events: none;
  overflow: hidden;
}
.food-transfer-flight {
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin: -28px;
  border: 2px solid #70ad98;
  border-radius: 18px;
  background: #f3fff6ed;
  color: #173d39;
  font-size: 36px;
  box-shadow:
    0 5px 16px #173d3930,
    0 0 0 5px #d1f3dc66;
  animation: food-transfer-flight 620ms cubic-bezier(0.25, 0.65, 0.3, 1) both;
  will-change: transform, opacity;
}
@keyframes food-transfer-flight {
  0% {
    opacity: 0;
    transform: translate3d(var(--from-x), var(--from-y), 0) scale(0.9)
      rotate(-7deg);
  }
  12% {
    opacity: 1;
  }
  48% {
    opacity: 1;
    transform: translate3d(var(--mid-x), var(--mid-y), 0) scale(1.15)
      rotate(5deg);
  }
  86% {
    opacity: 1;
    transform: translate3d(var(--to-x), var(--to-y), 0) scale(0.85)
      rotate(-3deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--to-x), var(--to-y), 0) scale(0.65) rotate(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .food-transfer-layer {
    display: none;
  }
}
</style>
