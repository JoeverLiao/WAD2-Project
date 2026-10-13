<script setup>
import { computed, nextTick, ref } from 'vue'
import { sampleAnalyticsEvents } from '../../data/analyticsDemo.js'

const actionLabels = {
  consumed: 'Consumed',
  discarded: 'Discarded',
  shared: 'Shared',
  rescued: 'Rescued',
}
const series = [
  { key: 'saved', label: 'Consumed, shared or rescued', color: '#198754' },
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
const x = (index) => plot.left + (index / (daily.value.length - 1)) * (plot.right - plot.left)
const y = (value) => plot.bottom - (value / yMax.value) * (plot.bottom - plot.top)
const points = (key) => daily.value.map((day, index) => `${x(index)},${y(day[key])}`).join(' ')
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
const hoverDay = computed(() => (hover.value === null ? null : daily.value[hover.value]))
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
  return Math.round(((position - plot.left) / (plot.right - plot.left)) * (daily.value.length - 1))
}
function startDrag(event) {
  if (!event.isPrimary || event.button !== 0) return
  suppressClick = false
  const position = pointerX(event)
  chart.value.setPointerCapture(event.pointerId)
  drag.value = { start: position, end: position, pointerId: event.pointerId }
  hover.value = null
}
function movePointer(event) {
  const position = pointerX(event)
  if (drag.value && drag.value.pointerId === event.pointerId) drag.value.end = position
  else if (!drag.value) hover.value = indexAt(position)
}
function finishDrag(event) {
  if (!drag.value || drag.value.pointerId !== event.pointerId) return
  const { start } = drag.value
  const end = pointerX(event)
  drag.value = null
  chart.value.releasePointerCapture(event.pointerId)
  // Ignore clicks and tiny movements; keep at least two dates.
  if (Math.abs(end - start) < 12) return
  suppressClick = true
  const first = indexAt(Math.min(start, end))
  const last = indexAt(Math.max(start, end))
  if (first === last) return
  const offset = range.value[0]
  range.value = [offset + first, offset + last]
  hover.value = null
}
function cancelDrag() {
  drag.value = null
  hover.value = null
}
function resetZoom() {
  range.value = [0, days.length - 1]
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
  range.value = next
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
  range.value = [start, start + nextSpan]
  hover.value = indexAt(point.x)
}
async function openDay(index) {
  selectedDate.value = daily.value[index].date
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
  openDay(indexAt(point.x))
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
  <section class="container py-4 analytics-page" aria-label="Food Waste Analytics">
    <h1>Food Waste Analytics</h1>
    <p class="text-muted">See where your food goes and the value you keep in the community.</p>
    <div class="alert alert-info">
      Demo mode: 50 fictional food activity records. No account data is used.
    </div>
    <div class="row g-3 mb-4">
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <p class="text-muted mb-1">Food kept from waste</p>
            <strong class="fs-3">{{ totals.saved.toFixed(2) }} kg</strong>
            <p class="small mb-0">Consumed, shared and rescued</p>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <p class="text-muted mb-1">Food discarded</p>
            <strong class="fs-3">{{ totals.discarded.toFixed(2) }} kg</strong>
            <p class="small mb-0">Opportunities to reduce waste</p>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <p class="text-muted mb-1">Food value preserved</p>
            <strong class="fs-3">{{ currency.format(totals.value) }}</strong>
            <p class="small mb-0">Demo value of food kept from waste</p>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <p class="text-muted mb-1">Community activity</p>
            <strong class="fs-3">{{ totals.community }}</strong>
            <p class="small mb-0">Sharing and rescue events</p>
          </div>
        </div>
      </div>
    </div>
    <div class="card mb-4">
      <div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <h2 class="h4">Daily food impact</h2>
            <p id="chart-help" class="text-muted small">
              Drag across the graph to zoom, or hover over a date and scroll up to zoom in and down
              to zoom out. Drag the bar handles to adjust the dates. Click a date to view and edit
              its activity.
            </p>
          </div>
          <button class="btn btn-outline-success" :disabled="!isZoomed" @click="resetZoom">
            Reset zoom
          </button>
        </div>
        <div class="mb-3">
          <p class="small mb-1" aria-live="polite">
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
            Two lines compare daily food weight. Select dates using the range bar, drag to zoom, or
            scroll over the plot to zoom around a date. The activity table lists the underlying
            records.
          </desc>
          <text :x="plot.left" y="17" class="axis-label">Weight (kg)</text>
          <g v-for="tick in 5" :key="tick">
            <line
              :x1="plot.left"
              :x2="plot.right"
              :y1="y(((tick - 1) * yMax) / 4)"
              :y2="y(((tick - 1) * yMax) / 4)"
              stroke="#e4e9e6"
            />
            <text
              :x="plot.left - 12"
              :y="y(((tick - 1) * yMax) / 4) + 5"
              text-anchor="end"
              class="axis-label"
            >
              {{ (((tick - 1) * yMax) / 4).toFixed(2) }}
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
          <g v-for="line in series" :key="line.key">
            <polyline
              :points="points(line.key)"
              fill="none"
              :stroke="line.color"
              stroke-width="2.5"
              :stroke-dasharray="line.key === 'discarded' ? '6 4' : undefined"
            />
            <circle
              v-for="(day, index) in daily"
              :key="day.date"
              :cx="x(index)"
              :cy="y(day[line.key])"
              r="3"
              :fill="line.color"
              :tabindex="line.key === 'saved' ? 0 : undefined"
              :role="line.key === 'saved' ? 'button' : undefined"
              :aria-label="
                line.key === 'saved' ? `Edit activity for ${formatDate(day.date)}` : undefined
              "
              @keydown.enter.prevent="openDay(index)"
              @keydown.space.prevent="openDay(index)"
            />
          </g>
          <rect
            v-if="drag"
            :x="Math.min(drag.start, drag.end)"
            :y="plot.top"
            :width="Math.abs(drag.end - drag.start)"
            :height="plot.bottom - plot.top"
            fill="#198754"
            fill-opacity="0.16"
            stroke="#198754"
          />
          <g v-if="hoverDay && !drag" pointer-events="none">
            <line
              :x1="x(hover)"
              :x2="x(hover)"
              :y1="plot.top"
              :y2="plot.bottom"
              stroke="#65776c"
              stroke-dasharray="4 4"
            />
            <g :transform="`translate(${Math.min(x(hover) + 10, plot.right - 220)}, 35)`">
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
    </div>
    <div class="card">
      <div class="card-body">
        <h2 class="h4">Food activity</h2>
        <div class="table-responsive">
          <table class="table align-middle mb-0">
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
                    class="btn btn-link p-0"
                    @click="openDay(visibleDays.indexOf(event.occurredAt.slice(0, 10)))"
                  >
                    {{ formatDate(event.occurredAt.slice(0, 10)) }}
                  </button>
                </td>
                <td>
                  {{ event.name }}<span class="d-block text-muted small">{{ event.category }}</span>
                </td>
                <td>
                  <span
                    class="badge"
                    :class="event.action === 'discarded' ? 'text-bg-danger' : 'text-bg-success'"
                    >{{ actionLabels[event.action] }}</span
                  >
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
    </div>
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
        <fieldset v-for="(draft, index) in drafts" :key="draft._id" class="border rounded p-3 mb-3">
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
          <button type="button" class="btn btn-outline-secondary" @click="closeEditor">
            Cancel
          </button>
          <button type="submit" class="btn btn-success">Save changes</button>
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
  border: 1px solid #ced8d1;
  border-radius: 14px;
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
    #198754 var(--range-start),
    #198754 var(--range-end),
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
  border: 3px solid #198754;
  background: white;
  pointer-events: auto;
  cursor: ew-resize;
}
.date-range-bar input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid #198754;
  background: white;
  pointer-events: auto;
  cursor: ew-resize;
}
.date-range-bar input:focus-visible {
  outline: 2px solid #198754;
  outline-offset: 2px;
  border-radius: 8px;
}
.impact-chart {
  display: block;
  width: 100%;
  min-height: 230px;
  touch-action: none;
  user-select: none;
  cursor: crosshair;
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
</style>
