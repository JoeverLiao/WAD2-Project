<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sampleAnalyticsEvents } from '../../data/analyticsDemo.js'

const actionLabels = {
  consumed: 'Consumed',
  discarded: 'Discarded',
  shared: 'Shared',
  rescued: 'Rescued',
}
const series = [
  { key: 'saved', label: 'Consumed, shared or rescued', color: '#3e9a8e' },
  { key: 'discarded', label: 'Discarded', color: '#cf563e' },
]
const days = [
  ...new Set(sampleAnalyticsEvents.map((event) => event.occurredAt.slice(0, 10))),
].sort()
const range = ref([0, days.length - 1])
const events = ref(sampleAnalyticsEvents.map((event) => ({ ...event })))
const editor = ref(null)
const selectedDate = ref(null)
const drafts = ref([])
const editError = ref('')
let suppressClick = false
const drag = ref(null)
const hover = ref(null)
const chart = ref(null)
const plot = { left: 70, right: 950, top: 30, bottom: 300 }
const currency = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })
const dateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const formatDate = (date) => dateFormat.format(new Date(`${date}T12:00:00Z`))
const isZoomed = computed(() => range.value[0] !== 0 || range.value[1] !== days.length - 1)
const visibleDays = computed(() => days.slice(range.value[0], range.value[1] + 1))
const visibleEvents = computed(() =>
  events.value.filter(
    (event) =>
      event.occurredAt.slice(0, 10) >= visibleDays.value[0] &&
      event.occurredAt.slice(0, 10) <= visibleDays.value.at(-1),
  ),
)
const totals = computed(() =>
  visibleEvents.value.reduce(
    (sum, event) => {
      if (event.action === 'discarded') sum.discarded += event.weightKg
      else {
        sum.saved += event.weightKg
        sum.value += event.valueSgd
      }
      if (event.action === 'shared' || event.action === 'rescued') sum.community += 1
      return sum
    },
    { saved: 0, discarded: 0, value: 0, community: 0 },
  ),
)
const animatedTotals = ref({ ...totals.value })
let numberFrame
let motionPreference
let mounted = false

function animateTotals(target) {
  cancelAnimationFrame(numberFrame)
  if (!mounted || motionPreference?.matches) {
    animatedTotals.value = { ...target }
    return
  }
  // Retarget from the currently displayed values when dates change quickly.
  const from = { ...animatedTotals.value }
  const started = performance.now()
  function tick(now) {
    const progress = Math.min((now - started) / 650, 1)
    const eased = 1 - (1 - progress) ** 3
    animatedTotals.value = Object.fromEntries(
      Object.keys(target).map((key) => [key, from[key] + (target[key] - from[key]) * eased]),
    )
    if (progress < 1) numberFrame = requestAnimationFrame(tick)
    else animatedTotals.value = { ...target }
  }
  numberFrame = requestAnimationFrame(tick)
}
watch(totals, animateTotals)

function updateMotion() {
  if (!motionPreference?.matches) return
  cancelAnimationFrame(numberFrame)
  animatedTotals.value = { ...totals.value }
  updateViewport(false)
}
onMounted(() => {
  mounted = true
  motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  motionPreference?.addEventListener('change', updateMotion)
})
onBeforeUnmount(() => {
  mounted = false
  cancelAnimationFrame(numberFrame)
  cancelAnimationFrame(zoomFrame)
  motionPreference?.removeEventListener('change', updateMotion)
})
const daily = computed(() =>
  visibleDays.value.map((date) => {
    const events = visibleEvents.value.filter((event) => event.occurredAt.startsWith(date))
    return {
      date,
      saved: events
        .filter((event) => event.action !== 'discarded')
        .reduce((sum, event) => sum + event.weightKg, 0),
      discarded: events
        .filter((event) => event.action === 'discarded')
        .reduce((sum, event) => sum + event.weightKg, 0),
    }
  }),
)
const yMax = computed(() =>
  Math.max(
    0.5,
    Math.ceil(Math.max(...daily.value.flatMap((day) => [day.saved, day.discarded])) * 2) / 2,
  ),
)
const renderedRange = ref([...range.value])
const renderedYMax = ref(yMax.value)
let zoomFrame
const fullDaily = computed(() =>
  days.map((date) => {
    const records = events.value.filter((event) => event.occurredAt.startsWith(date))
    return {
      date,
      saved: records
        .filter((event) => event.action !== 'discarded')
        .reduce((sum, event) => sum + event.weightKg, 0),
      discarded: records
        .filter((event) => event.action === 'discarded')
        .reduce((sum, event) => sum + event.weightKg, 0),
    }
  }),
)
const globalX = (index) =>
  plot.left +
  ((index - renderedRange.value[0]) / (renderedRange.value[1] - renderedRange.value[0])) *
    (plot.right - plot.left)
const x = (index) => globalX(range.value[0] + index)
const y = (value) => plot.bottom - (value / renderedYMax.value) * (plot.bottom - plot.top)
const points = (key) =>
  fullDaily.value.map((day, index) => `${globalX(index)},${y(day[key])}`).join(' ')
function updateViewport(animate = false) {
  cancelAnimationFrame(zoomFrame)
  const targetRange = [...range.value]
  const targetY = yMax.value
  if (!animate || !mounted || motionPreference?.matches) {
    renderedRange.value = targetRange
    renderedYMax.value = targetY
    return
  }
  const from = [...renderedRange.value]
  const fromY = renderedYMax.value
  const started = performance.now()
  function tick(now) {
    const progress = Math.min((now - started) / 320, 1)
    const eased = 1 - (1 - progress) ** 3
    renderedRange.value = from.map((value, index) => value + (targetRange[index] - value) * eased)
    renderedYMax.value = fromY + (targetY - fromY) * eased
    if (progress < 1) zoomFrame = requestAnimationFrame(tick)
    else {
      renderedRange.value = targetRange
      renderedYMax.value = targetY
    }
  }
  zoomFrame = requestAnimationFrame(tick)
}
function setRange(next, animate = false) {
  range.value = next
  updateViewport(animate)
}
watch(events, () => updateViewport(false))
const xTicks = computed(() => {
  const count = Math.min(6, daily.value.length)
  return [
    ...new Set(
      Array.from({ length: count }, (_, index) =>
        Math.round((index * (daily.value.length - 1)) / (count - 1)),
      ),
    ),
  ]
})
const hoverDay = computed(() => (hover.value === null ? null : fullDaily.value[hover.value]))
const recentEvents = computed(() => [...visibleEvents.value].reverse())

function chartPoint(event) {
  // Account for responsive SVG scaling and letterboxing.
  const point = chart.value.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  return point.matrixTransform(chart.value.getScreenCTM().inverse())
}
function pointerX(event) {
  return Math.max(plot.left, Math.min(plot.right, chartPoint(event).x))
}
function indexAt(position) {
  return Math.max(
    0,
    Math.min(
      days.length - 1,
      Math.round(
        renderedRange.value[0] +
          ((position - plot.left) / (plot.right - plot.left)) *
            (renderedRange.value[1] - renderedRange.value[0]),
      ),
    ),
  )
}
function startDrag(event) {
  if (!event.isPrimary || event.button !== 0) return
  suppressClick = false
  const point = chartPoint(event)
  if (point.x < plot.left || point.x > plot.right || point.y < plot.top || point.y > plot.bottom)
    return
  updateViewport(false)
  chart.value.setPointerCapture(event.pointerId)
  drag.value = {
    start: point.x,
    clientX: event.clientX,
    range: [...range.value],
    pointerId: event.pointerId,
    moved: false,
  }
  hover.value = null
}
function movePointer(event) {
  if (drag.value && drag.value.pointerId === event.pointerId) {
    if (Math.abs(event.clientX - drag.value.clientX) >= 6) drag.value.moved = true
    if (!drag.value.moved) return
    suppressClick = true
    const [first, last] = drag.value.range
    const span = last - first
    // Move the dates with the pointer, preserving the original zoom level.
    const shift = Math.round(
      ((drag.value.start - chartPoint(event).x) / (plot.right - plot.left)) * span,
    )
    const start = Math.max(0, Math.min(days.length - 1 - span, first + shift))
    setRange([start, start + span])
  } else if (!drag.value) hover.value = indexAt(pointerX(event))
}
function finishDrag(event) {
  if (!drag.value || drag.value.pointerId !== event.pointerId) return
  movePointer(event)
  drag.value = null
  chart.value.releasePointerCapture(event.pointerId)
  hover.value = null
}
function cancelDrag() {
  const pointerId = drag.value?.pointerId
  drag.value = null
  hover.value = null
  if (pointerId !== undefined && chart.value.hasPointerCapture?.(pointerId)) {
    chart.value.releasePointerCapture(pointerId)
  }
}
function resetZoom() {
  setRange([0, days.length - 1], true)
  cancelDrag()
}
function changeRange(boundary, event) {
  const index = Number(event.target.value)
  const next = [...range.value]
  next[boundary] =
    boundary === 0
      ? Math.max(0, Math.min(index, next[1] - 1))
      : Math.min(days.length - 1, Math.max(index, next[0] + 1))
  event.target.value = next[boundary]
  setRange(next)
  cancelDrag()
}
function wheelZoom(event) {
  if (drag.value || event.ctrlKey || event.deltaY === 0) return
  const point = chartPoint(event)
  if (point.x < plot.left || point.x > plot.right || point.y < plot.top || point.y > plot.bottom)
    return
  event.preventDefault()
  const fraction = (point.x - plot.left) / (plot.right - plot.left)
  const span = range.value[1] - range.value[0]
  const change = Math.max(1, Math.round(span * 0.2))
  const nextSpan = Math.max(
    1,
    Math.min(days.length - 1, span + (event.deltaY < 0 ? -change : change)),
  )
  if (nextSpan === span) return
  // Keep the date under the pointer at the same position within the new window.
  const anchor = range.value[0] + fraction * span
  const start = Math.max(
    0,
    Math.min(days.length - 1 - nextSpan, Math.round(anchor - fraction * nextSpan)),
  )
  setRange([start, start + nextSpan], true)
  hover.value = indexAt(point.x)
}
function openDay(index) {
  return openDate(daily.value[index].date)
}
async function openDate(date) {
  selectedDate.value = date
  drafts.value = events.value
    .filter((event) => event.occurredAt.startsWith(selectedDate.value))
    .map((event) => ({ ...event }))
  editError.value = ''
  await nextTick()
  editor.value.showModal()
}
function clickDate(event) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  const point = chartPoint(event)
  if (
    point.x < plot.left ||
    point.x > plot.right ||
    point.y < plot.top ||
    point.y > plot.bottom + 40
  )
    return
  openDate(fullDaily.value[indexAt(point.x)].date)
}
function closeEditor() {
  editor.value.close()
  selectedDate.value = null
  drafts.value = []
}
function saveDay() {
  if (
    drafts.value.some(
      (event) =>
        !event.name.trim() ||
        !event.unit.trim() ||
        !event.location.trim() ||
        !Object.hasOwn(actionLabels, event.action) ||
        ['quantity', 'weightKg', 'valueSgd'].some(
          (field) =>
            typeof event[field] !== 'number' || !Number.isFinite(event[field]) || event[field] < 0,
        ),
    )
  ) {
    editError.value = 'Enter a food name, unit and location, and valid non-negative numbers.'
    return
  }
  const updates = new Map(
    drafts.value.map((event) => [
      event._id,
      {
        ...event,
        name: event.name.trim(),
        unit: event.unit.trim(),
        location: event.location.trim(),
      },
    ]),
  )
  events.value = events.value.map((event) => updates.get(event._id) || event)
  closeEditor()
}
</script>

<template>
  <section class="container-xl py-4 analytics-page" aria-label="Food Waste Analytics">
    <header class="hero row align-items-center g-4 mb-5">
      <div class="col-lg-8">
        <p class="eyebrow">✿ FOOD WASTE ANALYTICS</p>
        <h1 class="hero-title">Less waste, <span class="scribble">more impact.</span></h1>
        <p class="hero-sub">
          See where your food goes, what you've kept from waste,<br class="d-none d-md-inline" />
          and the value you keep in the community.
        </p>
      </div>
      <div class="col-lg-4 d-flex justify-content-lg-end">
        <div class="stamp">
          <svg class="stamp-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
          </svg>
          <p class="stamp-title" :aria-label="`${totals.saved.toFixed(2)} kg kept.`">
            <span aria-hidden="true">{{ animatedTotals.saved.toFixed(2) }} kg kept.</span>
          </p>
          <p class="stamp-sub">A little less in the bin.</p>
          <span class="stamp-note">In the selected dates · demo data</span>
        </div>
      </div>
    </header>

    <p class="demo-note">
      <span class="pill pill-aqua">Demo data</span> {{ events.length }} fictional food activity
      records. No account data is used.
    </p>
    <section class="panel panel-tint mb-5" aria-labelledby="impact-heading">
      <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h2 id="impact-heading" class="panel-title">Your impact at a glance</h2>
          <p class="panel-sub">Small habits. Good food. A little less waste.</p>
        </div>
        <p class="scrawl d-none d-md-block">Every little bit counts! ↘</p>
      </div>
      <div class="row g-3">
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-lime"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15Zm0 0 8-8" /></svg
            ></span>
            <h3 class="metric-label">Food kept from waste</h3>
            <strong class="metric-value" :aria-label="`${totals.saved.toFixed(2)} kg`"
              ><span aria-hidden="true">{{ animatedTotals.saved.toFixed(2) }} kg</span></strong
            >
            <p class="metric-note">Consumed, shared and rescued</p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-coral"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6" /></svg
            ></span>
            <h3 class="metric-label">Food discarded</h3>
            <strong class="metric-value" :aria-label="`${totals.discarded.toFixed(2)} kg`"
              ><span aria-hidden="true">{{ animatedTotals.discarded.toFixed(2) }} kg</span></strong
            >
            <p class="metric-note">Opportunities to reduce waste</p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-yellow"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9 M12 6v12" /></svg
            ></span>
            <h3 class="metric-label">Food value preserved</h3>
            <strong class="metric-value" :aria-label="currency.format(totals.value)"
              ><span aria-hidden="true">{{ currency.format(animatedTotals.value) }}</span></strong
            >
            <p class="metric-note">Demo value of food kept from waste</p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-aqua"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
                /></svg
            ></span>
            <h3 class="metric-label">Community activity</h3>
            <strong class="metric-value" :aria-label="String(totals.community)"
              ><span aria-hidden="true">{{ Math.round(animatedTotals.community) }}</span></strong
            >
            <p class="metric-note">Sharing and rescue events</p>
          </article>
        </div>
      </div>
    </section>
    <section class="panel chart-panel mb-5" aria-labelledby="impact-chart-heading">
      <div>
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <h2 id="impact-chart-heading" class="panel-title mb-2">Daily food impact</h2>
            <p id="chart-help" class="text-muted small">
              Scroll up over the graph to zoom in and down to zoom out. When zoomed in, drag left or
              right to move through the dates. Drag the bar handles to adjust the dates. Click a
              date to view and edit its activity.
            </p>
          </div>
          <button class="btn-paper btn-paper-secondary" :disabled="!isZoomed" @click="resetZoom">
            Reset zoom
          </button>
        </div>
        <div class="range-panel mb-3">
          <p class="range-summary mb-1" aria-live="polite">
            {{ formatDate(visibleDays[0]) }} – {{ formatDate(visibleDays.at(-1)) }} 2026 ·
            {{ visibleEvents.length }} events
          </p>
          <div
            class="date-range-bar"
            role="group"
            aria-label="Selected date range"
            :style="{
              '--range-start': `${(range[0] / (days.length - 1)) * 100}%`,
              '--range-end': `${(range[1] / (days.length - 1)) * 100}%`,
            }"
          >
            <div class="date-range-track"></div>
            <input
              type="range"
              aria-label="Start date"
              :aria-valuetext="formatDate(days[range[0]])"
              :value="range[0]"
              min="0"
              :max="days.length - 1"
              step="1"
              @input="changeRange(0, $event)"
            />
            <input
              type="range"
              aria-label="End date"
              :aria-valuetext="formatDate(days[range[1]])"
              :value="range[1]"
              min="0"
              :max="days.length - 1"
              step="1"
              @input="changeRange(1, $event)"
            />
          </div>
          <div class="d-flex justify-content-between text-muted small">
            <span>{{ formatDate(days[0]) }}</span
            ><span>{{ formatDate(days.at(-1)) }}</span>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-3 small mb-2">
          <span v-for="line in series" :key="line.key"
            ><span class="legend-dot" :style="{ background: line.color }"></span
            >{{ line.label }}</span
          >
        </div>
        <svg
          ref="chart"
          class="impact-chart"
          :class="{ 'is-dragging': drag }"
          viewBox="0 0 1000 365"
          role="img"
          aria-labelledby="chart-title chart-description"
          aria-describedby="chart-help"
          @pointerdown="startDrag"
          @pointermove="movePointer"
          @pointerup="finishDrag"
          @pointercancel="cancelDrag"
          @lostpointercapture="cancelDrag"
          @pointerleave="hover = null"
          @wheel="wheelZoom"
          @click="clickDate"
        >
          <title id="chart-title">Daily food kept from waste and discarded, in kilograms</title>
          <desc id="chart-description">
            Two lines compare daily food weight. Select dates using the range bar, drag to pan, or
            scroll over the plot to zoom around a date. The activity table lists the underlying
            records.
          </desc>
          <text :x="plot.left" y="17" class="axis-label">Weight (kg)</text>
          <g v-for="tick in 5" :key="tick">
            <line
              :x1="plot.left"
              :x2="plot.right"
              :y1="y(((tick - 1) * renderedYMax) / 4)"
              :y2="y(((tick - 1) * renderedYMax) / 4)"
              stroke="#e4e9e6"
            />
            <text
              :x="plot.left - 12"
              :y="y(((tick - 1) * renderedYMax) / 4) + 5"
              text-anchor="end"
              class="axis-label"
            >
              {{ (((tick - 1) * renderedYMax) / 4).toFixed(2) }}
            </text>
          </g>
          <text
            v-for="index in xTicks"
            :key="index"
            :x="x(index)"
            :y="plot.bottom + 28"
            text-anchor="middle"
            class="axis-label"
          >
            {{ formatDate(daily[index].date) }}
          </text>
          <defs>
            <clipPath id="analytics-plot-clip">
              <rect
                :x="plot.left - 4"
                :y="plot.top - 4"
                :width="plot.right - plot.left + 8"
                :height="plot.bottom - plot.top + 8"
              />
            </clipPath>
          </defs>
          <g clip-path="url(#analytics-plot-clip)">
            <g v-for="line in series" :key="line.key">
              <polyline
                :points="points(line.key)"
                fill="none"
                :stroke="line.color"
                stroke-width="2.5"
                :stroke-dasharray="line.key === 'discarded' ? '6 4' : undefined"
              />
              <circle
                v-for="(day, index) in fullDaily"
                :key="day.date"
                :cx="globalX(index)"
                :cy="y(day[line.key])"
                r="3"
                :fill="line.color"
                :tabindex="
                  line.key === 'saved' && index >= range[0] && index <= range[1] ? 0 : undefined
                "
                :role="line.key === 'saved' ? 'button' : undefined"
                :aria-label="
                  line.key === 'saved' ? `Edit activity for ${formatDate(day.date)}` : undefined
                "
                @keydown.enter.prevent="openDate(day.date)"
                @keydown.space.prevent="openDate(day.date)"
              />
            </g>
          </g>
          <g v-if="hoverDay && !drag" pointer-events="none">
            <line
              :x1="globalX(hover)"
              :x2="globalX(hover)"
              :y1="plot.top"
              :y2="plot.bottom"
              stroke="#65776c"
              stroke-dasharray="4 4"
            />
            <g :transform="`translate(${Math.min(globalX(hover) + 10, plot.right - 220)}, 35)`">
              <rect width="220" height="85" rx="8" fill="#fff" stroke="#ced8d1" />
              <text x="12" y="23" class="tooltip-label">{{ formatDate(hoverDay.date) }}</text>
              <text x="12" y="47" class="tooltip-label">
                Kept: {{ hoverDay.saved.toFixed(2) }} kg
              </text>
              <text x="12" y="69" class="tooltip-label">
                Discarded: {{ hoverDay.discarded.toFixed(2) }} kg
              </text>
            </g>
          </g>
        </svg>
        <p class="small text-muted mb-0">
          Cards and activity follow the selected dates. Food weight is estimated for this demo.
        </p>
      </div>
    </section>
    <section class="panel activity-panel" aria-labelledby="activity-heading">
      <div>
        <div class="activity-heading">
          <div>
            <h2 id="activity-heading" class="panel-title">Food activity</h2>
            <p class="panel-sub">The little details behind your impact.</p>
          </div>
          <span class="pill pill-aqua">{{ visibleEvents.length }} records</span>
        </div>
        <div class="table-responsive" role="region" aria-label="Food activity table" tabindex="0">
          <table class="activity-table">
            <caption>
              Sample activity for the selected dates, newest first.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Food</th>
                <th scope="col">Action</th>
                <th scope="col">Quantity</th>
                <th scope="col">Weight</th>
                <th scope="col">Value</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in recentEvents" :key="event._id">
                <td class="text-nowrap">
                  <button
                    class="date-link"
                    @click="openDay(visibleDays.indexOf(event.occurredAt.slice(0, 10)))"
                  >
                    {{ formatDate(event.occurredAt.slice(0, 10)) }}
                  </button>
                </td>
                <td>
                  {{ event.name }}<span class="d-block text-muted small">{{ event.category }}</span>
                </td>
                <td>
                  <span class="pill" :class="`pill-${event.action}`">{{
                    actionLabels[event.action]
                  }}</span>
                </td>
                <td class="text-nowrap">{{ event.quantity }} {{ event.unit }}</td>
                <td class="text-nowrap">{{ event.weightKg.toFixed(2) }} kg</td>
                <td>{{ currency.format(event.valueSgd) }}</td>
                <td class="text-nowrap">{{ event.location }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <dialog
      v-if="selectedDate"
      ref="editor"
      class="activity-editor"
      aria-labelledby="editor-title"
      aria-describedby="editor-help"
      @cancel.prevent="closeEditor"
    >
      <form @submit.prevent="saveDay">
        <div class="d-flex justify-content-between align-items-center gap-3 mb-2">
          <h2 id="editor-title" class="h4 mb-0">
            Activity for {{ formatDate(selectedDate) }} 2026
          </h2>
          <button
            type="button"
            class="btn-close"
            aria-label="Close editor"
            @click="closeEditor"
          ></button>
        </div>
        <p id="editor-help" class="small text-muted">
          Edit this day's demo activity. Changes update the chart and totals, and reset when you
          leave or refresh this page.
        </p>
        <fieldset v-for="(draft, index) in drafts" :key="draft._id" class="editor-record p-3 mb-3">
          <legend class="float-none w-auto fs-6 px-2">Food record {{ index + 1 }}</legend>
          <div class="row g-3">
            <label class="col-sm-8"
              >Food name<input
                v-model="draft.name"
                class="form-control"
                name="name"
                required
                maxlength="100"
            /></label>
            <label class="col-sm-4"
              >Action<select v-model="draft.action" class="form-select" name="action">
                <option v-for="(label, key) in actionLabels" :key="key" :value="key">
                  {{ label }}
                </option>
              </select></label
            >
            <label class="col-sm-6"
              >Quantity<input
                v-model.number="draft.quantity"
                class="form-control"
                name="quantity"
                type="number"
                min="0"
                step="any"
                required
            /></label>
            <label class="col-sm-6"
              >Unit<input
                v-model="draft.unit"
                class="form-control"
                name="unit"
                required
                maxlength="40"
            /></label>
            <label class="col-sm-6"
              >Weight (kg)<input
                v-model.number="draft.weightKg"
                class="form-control"
                name="weightKg"
                type="number"
                min="0"
                step="0.01"
                required
            /></label>
            <label class="col-sm-6"
              >Total value (SGD)<input
                v-model.number="draft.valueSgd"
                class="form-control"
                name="valueSgd"
                type="number"
                min="0"
                step="0.01"
                required
            /></label>
            <label class="col-12"
              >Location<input
                v-model="draft.location"
                class="form-control"
                name="location"
                required
                maxlength="100"
            /></label>
          </div>
          <p class="small text-muted mt-3 mb-0">
            Category: {{ draft.category }} · Source: {{ draft.source }}
          </p>
        </fieldset>
        <p v-if="editError" class="text-danger" role="alert">{{ editError }}</p>
        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn-paper btn-paper-secondary" @click="closeEditor">
            Cancel
          </button>
          <button type="submit" class="btn-paper">Save changes</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.analytics-page {
  max-width: 1200px;
}

.activity-editor {
  width: min(640px, calc(100% - 32px));
  max-height: 85vh;
  overflow-y: auto;
  border: 2px solid var(--ink);
  border-radius: 20px;
  background: var(--paper-bright);
  color: var(--ink);
  box-shadow: var(--shadow-paper);
  padding: 24px;
}

.activity-editor::backdrop {
  background: rgb(18 37 27 / 50%);
}

.impact-chart circle[role='button']:focus-visible {
  outline: 3px solid #203c2c;
}

.date-range-bar {
  position: relative;
  height: 40px;
  margin: 0 12px;
}

.date-range-track {
  position: absolute;
  inset: 16px 0;
  border-radius: 8px;
  background: linear-gradient(
    to right,
    #dfe7e2 var(--range-start),
    #3e9a8e var(--range-start),
    #3e9a8e var(--range-end),
    #dfe7e2 var(--range-end)
  );
}

.date-range-bar input {
  position: absolute;
  inset: 0 -12px;
  width: calc(100% + 24px);
  height: 40px;
  margin: 0;
  appearance: none;
  background: transparent;
  pointer-events: none;
}

.date-range-bar input::-webkit-slider-thumb {
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid #3e9a8e;
  background: white;
  pointer-events: auto;
  cursor: ew-resize;
}

.date-range-bar input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid #3e9a8e;
  background: white;
  pointer-events: auto;
  cursor: ew-resize;
}

.date-range-bar input:focus-visible {
  outline: 2px solid #3e9a8e;
  outline-offset: 2px;
  border-radius: 8px;
}

.impact-chart {
  display: block;
  width: 100%;
  min-height: 230px;
  touch-action: none;
  user-select: none;
  cursor: grab;
}

.impact-chart.is-dragging {
  cursor: grabbing;
}

.axis-label {
  font-size: 13px;
  fill: #536259;
}

.tooltip-label {
  font-size: 14px;
  fill: #203c2c;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 7px;
}

/* Match the dashboard's paper panels, handwritten hierarchy and soft palette. */
.analytics-page {
  color: var(--ink);
}
.hero {
  position: relative;
  isolation: isolate;
}
.eyebrow {
  margin-bottom: 0.5rem;
  color: #1f6e66;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
}
.hero-title {
  margin: 0 0 1rem;
  font-size: clamp(2.6rem, 6vw, 4.2rem);
  font-weight: 700;
}
.hero-sub {
  margin: 0;
  color: var(--muted);
  font-size: 1.35rem;
}
.scribble {
  position: relative;
  white-space: nowrap;
}
.scribble::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.05em;
  height: 0.22em;
  border-radius: 999px;
  background: #9fdcd3;
  z-index: -1;
}
.stamp {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 260px;
  height: 190px;
  padding: 1rem;
  border: 2px dashed var(--line);
  border-radius: 50%;
  text-align: center;
  transform: rotate(-4deg);
}
.stamp-icon {
  width: 40px;
  height: 40px;
  color: #3e9a8e;
}
.stamp-icon,
.metric-icon svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.stamp-title {
  margin: 0.25rem 0 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
}
.stamp-sub {
  margin: 0;
  color: var(--muted);
}
.stamp-note {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.demo-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 1.5rem;
  color: var(--muted);
  font-size: 0.95rem;
}
.panel {
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--shadow-paper);
  padding: 1.5rem;
}
.panel-tint {
  background: #e3f3ee;
}
.panel-title {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 700;
}
.panel-sub {
  margin: 0;
  color: var(--muted);
}
.scrawl {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 1.4rem;
  transform: rotate(-4deg);
}
.metric-card {
  height: 100%;
  padding: 1.2rem;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: #fff;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 1rem;
  border-radius: 14px;
  transform: rotate(-4deg);
}
.metric-icon svg {
  width: 27px;
  height: 27px;
}
.icon-lime {
  background: var(--lime);
}
.icon-coral {
  background: #fde0dc;
  color: #9a3a2e;
}
.icon-yellow {
  background: var(--yellow-sticky);
}
.icon-aqua {
  background: var(--aqua-soft);
}
.metric-label {
  margin: 0 0 0.4rem;
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--muted);
}
.metric-value {
  font-variant-numeric: tabular-nums;
  display: block;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.2;
  margin-bottom: 0.4rem;
}
.metric-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.pill {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 0.95rem;
  line-height: 1.4;
  white-space: nowrap;
}
.pill-aqua,
.pill-shared {
  background: var(--aqua-soft);
  color: #1f6e66;
}
.pill-consumed {
  background: var(--lime);
  color: #3f5a12;
}
.pill-rescued {
  background: var(--yellow-sticky);
  color: #72561e;
}
.pill-discarded {
  background: #fde0dc;
  color: #9a3a2e;
}
.btn-paper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 10px 20px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: #3e9a8e;
  color: #fff;
  font-size: 1.05rem;
  box-shadow: var(--shadow-small);
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;
}
.btn-paper:hover:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 1px 2px 0 var(--ink);
}
.btn-paper:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.btn-paper-secondary {
  background: var(--paper-bright);
  color: var(--ink);
}
.btn-paper:focus-visible,
.date-link:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: 4px;
}
#chart-help {
  max-width: 760px;
}
.range-panel {
  margin-top: 1rem;
  padding: 1rem;
  border: 1.5px dashed var(--line);
  border-radius: 14px;
  background: var(--paper-bright);
}
.range-summary {
  color: var(--ink);
  font-size: 0.95rem;
}
.activity-panel {
  padding: 0;
  overflow: hidden;
}
.activity-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 1.5rem;
}
.activity-table {
  width: 100%;
  border-collapse: collapse;
}
.activity-panel .table-responsive {
  max-height: 480px;
  overflow: auto;
}
.activity-panel .table-responsive:focus-visible {
  outline: 3px solid var(--aqua);
  outline-offset: -3px;
}
.activity-table caption {
  padding: 12px 16px;
  color: var(--muted);
  font-size: 0.9rem;
}
.activity-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 14px 16px;
  background: var(--aqua-soft);
  border-bottom: 2px solid var(--ink);
  font-family: var(--font-display);
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}
.activity-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e3efec;
  vertical-align: middle;
}
.activity-table tbody tr:last-child td {
  border-bottom: none;
}
.activity-table tbody tr:hover {
  background: #f4fbf9;
}
.date-link {
  padding: 0;
  border: 0;
  background: none;
  color: #1f7d74;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.editor-record {
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: #fff;
}
.activity-editor .form-control,
.activity-editor .form-select {
  border: 1.5px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
}
.activity-editor .form-control:focus,
.activity-editor .form-select:focus {
  border-color: #3e9a8e;
  box-shadow: 0 0 0 3px var(--aqua-soft);
}
.analytics-page .text-muted {
  color: var(--muted) !important;
}
@media (max-width: 575.98px) {
  .hero {
    padding-top: 48px;
  }
  .analytics-page {
    padding-left: 16px;
    padding-right: 20px;
  }
  .hero-title {
    font-size: clamp(2rem, 9vw, 2.6rem);
  }
  .stamp {
    width: 220px;
    height: 160px;
  }
  .stamp-title {
    font-size: 1.3rem;
  }
  .panel {
    padding: 1rem;
  }
  .metric-card {
    padding: 0.85rem;
  }
  .metric-label {
    min-height: 2.4em;
  }
  .metric-value {
    font-size: 1.45rem;
  }
  .activity-panel {
    padding: 0;
  }
  .activity-heading {
    padding: 1rem;
  }
  .range-panel {
    padding: 0.7rem;
  }
  .activity-editor {
    padding: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .btn-paper {
    transition: none;
  }
}
</style>
