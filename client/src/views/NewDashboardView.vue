<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const now = ref(new Date())
let timer

const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  weekday: 'long',
  month: 'short',
  year: 'numeric',
})

const dateParts = computed(() => {
  const parts = dateFormatter.formatToParts(now.value)

  return Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const currentTime = computed(() => timeFormatter.format(now.value))

const fullDate = computed(() =>
  new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'full',
  }).format(now.value),
)

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

function openSection(section) {
  console.log('Open:', section)
}
</script>

<template>
  <main class="kitchen">
    <!-- Decorative layers -->
    <img
      class="decoration kitchen-window"
      src="/images/window.svg"
      alt=""
    />

    <img
      class="decoration countertop"
      src="/images/countertop.svg"
      alt=""
    />


    <!-- Live clock -->
    <section
      class="wall-clock"
      :aria-label="`Singapore time ${currentTime}`"
    >
      <div class="clock-display">
        <span class="clock-time">{{ currentTime }}</span>
      </div>
    </section>

    <!-- Fridge -->
    <button
      type="button"
      class="object fridge"
      aria-label="Open fridge inventory"
      @click="openSection('fridge')"
    >
      <img
        class="fridge-base"
        src="/images/fridge.svg"
        alt=""
      />

      <span class="fridge-door-layer">
        <img src="/images/fridge-doors.svg" alt="" />
      </span>
    </button>

    <!-- Pantry -->
    <button
      type="button"
      class="object pantry"
      aria-label="Open pantry inventory"
      @click="openSection('pantry')"
    >
      <img src="/images/pantry.svg" alt="" />
    </button>

    <!-- Community board -->
    <div class="community-board">
      <!-- Export the board without the two notes -->
      <img
        class="board-background"
        src="/images/community-board.svg"
        alt=""
      />

      <button
        type="button"
        class="board-note share-note"
        aria-label="Share your surplus food"
        @click="openSection('share')"
      >
        <img src="/images/share-food-note.svg" alt="" />
      </button>

      <button
        type="button"
        class="board-note rescue-note"
        aria-label="Find food to rescue nearby"
        @click="openSection('rescue')"
      >
        <img src="/images/rescue-food-note.svg" alt="" />
      </button>
    </div>

    <!-- Recipe book -->
    <button
      type="button"
      class="object recipe-book"
      aria-label="Find recipes using your ingredients"
      @click="openSection('recipes')"
    >
      <img src="/images/recipe-book.svg" alt="" />
    </button>

    <!-- Impact plant -->
    <button
      type="button"
      class="object impact-plant"
      aria-label="View your food-saving impact"
      @click="openSection('impact')"
    >
      <img src="/images/plant.svg" alt="" />
    </button>

    <!-- Scanner -->
    <button
      type="button"
      class="object scanner"
      aria-label="Scan a receipt"
      @click="openSection('scanner')"
    >
      <img src="/images/scanner.svg" alt="" />
    </button>
  </main>
</template>

<style scoped>
.kitchen {
  position: relative;
  isolation: isolate;
  container-type: inline-size;

  width: 100%;
  max-width: none;
  aspect-ratio: 1200 / 800;
  margin: 0;
  overflow: hidden;

  background: #faf5e9 url('/images/room-background.svg')
    center / 100% 100% no-repeat;
}

/* Shared positioning */
.decoration,
.object,
.wall-clock,
.scan-shortcut {
  position: absolute;
  box-sizing: border-box;
}

.decoration {
  display: block;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.kitchen-window {
  left: 79.8333%;
  top: 16.625%;
  width: 17.25%;
  z-index: 1;
}

.countertop {
  left: 26%;
  top: 66.125%;
  width: 73.1667%;
  z-index: 2;
}

/* Interactive objects */
.object {
  display: block;
  z-index: 3;

  margin: 0;
  padding: 0;
  border: 0;

  background: transparent;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.object img {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.object:hover {
  transform: translateY(-4px);
}

.object:focus-visible,
.scan-shortcut:focus-visible {
  outline: 3px dashed #ba7749;
  outline-offset: 4px;
}

/* Fridge */
.fridge {
  left: 4%;
  top: 23%;
  width: 22%;

  /* Height comes from the base image. */
  bottom: auto;

  perspective: 1000px;
  overflow: visible;
  isolation: isolate;
}

.fridge:hover {
  transform: none;
}

.fridge-base {
  position: relative;
  z-index: 0;
}

/*
  Doors relative to fridge:
  X offset: 15 / 260
  Y offset: 16 / 544.04
  Width: 232 / 260
*/
.fridge-door-layer {
  position: absolute;
  left: 6%;
  top: 3%;
  width: 89%;
  z-index: 2;

  display: block;
  transform-origin: left center;
  transform: rotateY(0deg);
  backface-visibility: hidden;
  pointer-events: none;

  transition:
    transform 0.75s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.75s ease;
}

@media (hover: hover) and (pointer: fine) {
  .fridge:hover .fridge-door-layer {
    transform: rotateY(-85deg);
    filter: brightness(0.92);
  }
}

.fridge:focus-visible .fridge-door-layer {
  transform: rotateY(-85deg);
}

/* Pantry */
.pantry {
  left: 28%;
  top: 26%;
  width: 18%;
}
/* Community Board */
.community-board {
  position: absolute;
  left: 49.0833%;
  top: 7.625%;
  width: 28.75%;
  z-index: 3;
}

.community-board img {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.board-background {
  position: relative;
}

/* Both notes are positioned relative to the board. */
.board-note {
  position: absolute;
  top: 34%;
  width: 36%;
  z-index: 1;

  display: block;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;

  background: transparent;
  cursor: pointer;
  transition: transform 0.2s ease;
}

/* Share on the left */
.share-note {
  left: 8%;
}

/* Rescue on the right */
.rescue-note {
  right: 8%;
}

@media (hover: hover) and (pointer: fine) {
  .board-note:hover {
    transform: translateY(-4px) scale(1.03);
  }
}

.board-note:focus-visible {
  outline: 3px dashed #ba7749;
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .board-note {
    transition: none;
  }

  .board-note:hover {
    transform: none;
  }
}

/* Includes the cookbook stand and shadow. */
.recipe-book {
  left: 35%;
  top: 60%;
  width: 30%;
}

/* Includes the plant's marker and progress label. */
.impact-plant {
  left: 81.9167%;
  top: 51.25%;
  width: 12.6667%;
}

/* Clock */
.wall-clock {
  left: 82.9167%;
  top: 7.625%;
  width: 11.4167%;
  height: 6%;
  z-index: 2;

  padding: 0.4cqw;
  border: 0.208cqw solid #62594a;
  border-radius: 0.75cqw;
  background: #bd956f;
}

.clock-display {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: 100%;
  border-radius: 0.4cqw;
  background: #304f42;
  color: #e3ecc9;
}

.clock-time {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 2cqw;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

/* Optional scanner shortcut */
.scanner {
  left: 70%;
  top: 62%;
  width: 9.25%;
  z-index: 4;
}

@media (prefers-reduced-motion: reduce) {
  .object,
  .fridge-door-layer {
    transition: none;
  }

  .object:hover {
    transform: none;
  }
}
</style>