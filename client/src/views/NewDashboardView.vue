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
    <!-- Room background is supplied through CSS. -->

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

    <!-- Live wall calendar -->
    <section
      class="wall-calendar"
      :aria-label="`Today is ${fullDate}`"
    >
      <span class="calendar-ring ring-left" aria-hidden="true"></span>
      <span class="calendar-ring ring-right" aria-hidden="true"></span>

      <div class="calendar-month">
        {{ dateParts.month }} {{ dateParts.year }}
      </div>

      <div class="calendar-paper">
        <span class="calendar-day">{{ dateParts.day }}</span>
        <span class="calendar-weekday">{{ dateParts.weekday }}</span>
        <span class="calendar-footer">a fresh day</span>
      </div>
    </section>

    <!-- Live digital clock -->
    <section
      class="wall-clock"
      :aria-label="`Singapore time ${currentTime}`"
    >
      <div class="clock-display">
        <span class="clock-time">{{ currentTime }}</span>
        <span class="clock-format">24H</span>
      </div>
    </section>

    <!-- Interactive objects -->
    <button
      type="button"
      class="object fridge"
      aria-label="Open fridge"
      @click="openSection('fridge')"
    >
      <img src="/images/fridge.svg" alt="" />
    </button>

    <button
      type="button"
      class="object pantry"
      aria-label="Open pantry"
      @click="openSection('pantry')"
    >
      <img src="/images/pantry.svg" alt="" />
    </button>

    <button
      type="button"
      class="object ledger"
      aria-label="Open community sharing"
      @click="openSection('sharing')"
    >
      <img src="/images/ledger.svg" alt="" />
    </button>

    <button
      type="button"
      class="object food"
      aria-label="View expiring food"
      @click="openSection('expiring-food')"
    >
      <img src="/images/expiring.svg" alt="" />
    </button>

    <button
      type="button"
      class="object scanner"
      aria-label="Scan food"
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

.decoration,
.object,
.wall-calendar,
.wall-clock {
  position: absolute;
  display: block;
  box-sizing: border-box;
}

.decoration {
  height: auto;
  pointer-events: none;
  user-select: none;
}

.kitchen-window {
  left: 70.92%;
  top: 12.25%;
  width: 24.25%;
  z-index: 1;
}

.countertop {
  left: 26.25%;
  top: 60.5%;
  width: 73.75%;
  z-index: 2;
}

/* Wall calendar */
.wall-calendar {
  left: 64.08%;
  top: 24.38%;
  width: 6.17%;
  height: 15.38%;
  z-index: 2;

  border: 0.167cqw solid #62594a;
  border-radius: 0.333cqw;
  background: #fff6df;
  box-shadow: 0.333cqw 0.5cqw 0 rgb(189 149 111 / 20%);
  font-family: 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive;
  color: #62594a;
  text-align: center;
}

.calendar-ring {
  position: absolute;
  top: -0.583cqw;
  width: 0.417cqw;
  height: 1.083cqw;
  z-index: 1;
  border-radius: 0.167cqw;
  background: #62594a;
}

.ring-left {
  left: 22%;
}

.ring-right {
  right: 22%;
}

.calendar-month {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20%;
  border-radius: 0.167cqw 0.167cqw 0 0;
  background: #bc7d66;
  color: #fff6df;
  font-size: 0.833cqw;
  text-transform: uppercase;
  white-space: nowrap;
}

.calendar-paper {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 80%;
}

.calendar-day {
  margin-top: 0.5cqw;
  font-size: 3.25cqw;
  line-height: 1.2;
}

.calendar-weekday {
  margin-top: 0.167cqw;
  font-size: 0.75cqw;
  text-transform: uppercase;
}

.calendar-footer {
  width: 70%;
  margin-top: auto;
  margin-bottom: 0.333cqw;
  padding-top: 0.333cqw;
  border-top: 1px solid #bd956f;
  color: #bc7d66;
  font-size: 0.667cqw;
}

/* Digital wall clock */
.wall-clock {
  left: 71.75%;
  top: 3.25%;
  width: 18.5%;
  height: 7.5%;
  z-index: 2;

  padding: 0.5cqw;
  border: 0.208cqw solid #62594a;
  border-radius: 0.917cqw;
  background: #bd956f;
  box-shadow: 0.333cqw 0.417cqw 0 rgb(189 149 111 / 22%);
}

.clock-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1cqw;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 0.25cqw solid #62594a;
  border-radius: 0.5cqw;
  background: #304f42;
  color: #e3ecc9;
}

.clock-time {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 2.5cqw;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.clock-format {
  align-self: flex-start;
  margin-top: 0.417cqw;
  font-family: monospace;
  font-size: 0.75cqw;
}

/* Interactive objects */
.object {
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
}

.object:hover {
  transform: translateY(-4px);
}

.object:focus-visible {
  outline: 3px dashed #ba7749;
  outline-offset: 4px;
}

.fridge {
  left: 3.83%;
  top: 3.75%;
  bottom: 0;
  width: 21.67%;
}

.pantry {
  left: 28.83%;
  top: 5.5%;
  width: 34%;
}

.ledger {
  left: 33.17%;
  top: 58.13%;
  width: 15%;
}

.food {
  left: 52.25%;
  top: 64.38%;
  width: 25%;
}

.scanner {
  left: 81.83%;
  top: 57.75%;
  width: 9.25%;
}

@media (prefers-reduced-motion: reduce) {
  .object {
    transition: none;
  }

  .object:hover {
    transform: none;
  }
}
</style>