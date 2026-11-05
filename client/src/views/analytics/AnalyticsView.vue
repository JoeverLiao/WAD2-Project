<script setup>
import { computed, ref, watch } from 'vue'
import { useFoodActivity, actionLabels } from '../../composables/useFoodActivity.js'
import { useAnalyticsChart } from '../../composables/useAnalyticsChart.js'
import { useAnimatedTotals } from '../../composables/useAnimatedTotals.js'
import { foodActivityDay } from '../../utils/foodActivityDates.js'
import ImpactOverview from '../../components/analytics/ImpactOverview.vue'
import { RouterLink } from 'vue-router'
import { usePageLoading } from '../../utils/pageLoading.js'
import VegetableCompanions from '../../components/analytics/VegetableCompanions.vue'
import {
  foodKey,
  summarizeFoodEvents,
  previousFoodPeriod,
  rankWastedFoods,
  foodPeriodChange,
} from '../../utils/analyticsUtils.js'

const {
  events,
  loading,
  saving,
  loadError,
  editor,
  selectedDate,
  drafts,
  editError,
  loadActivity,
  openDate,
  closeEditor,
  saveDay,
  addDraft,
} = useFoodActivity()
const {
  days,
  range,
  visibleDays,
  activityIndex,
  chart,
  chartWidth,
  compactChart,
  plot,
  daily,
  renderedDays,
  renderedYMax,
  x,
  y,
  globalX,
  points,
  xTicks,
  hoverDay,
  hover,
  drag,
  setRange,
  startDrag,
  movePointer,
  finishDrag,
  cancelDrag,
  resetZoom,
  changeRange,
  wheelZoom,
  openDay,
  clickDate,
} = useAnalyticsChart({ events, openDate })
usePageLoading(loading, 'Loading your food activity')

const series = [
  { key: 'saved', label: 'Consumed, shared or rescued', color: '#3e9a8e' },
  { key: 'discarded', label: 'Discarded', color: '#cf563e' },
]

const currency = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })

const dateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const formatDate = (date) => dateFormat.format(new Date(`${date}T12:00:00Z`))

const isZoomed = computed(() => range.value[0] !== 0 || range.value[1] !== days.value.length - 1)

const visibleEvents = computed(() =>
  visibleDays.value.flatMap((day) => activityIndex.value.get(day)?.events || []),
)
const totals = computed(() => summarizeFoodEvents(visibleEvents.value))

const comparison = computed(() =>
  previousFoodPeriod(visibleDays.value[0], visibleDays.value.at(-1), days.value[0]),
)

const previousTotals = computed(() =>
  summarizeFoodEvents(
    events.value.filter((event) => {
      const date = foodActivityDay(event.occurredAt)
      return date >= comparison.value.start && date <= comparison.value.end
    }),
  ),
)

function periodChange(key) {
  return foodPeriodChange(
    totals.value[key],
    previousTotals.value[key],
    ['discarded', 'discardedValue'].includes(key),
  )
}

const rankingMetric = ref('value')

const rankingOptions = [
  { key: 'value', label: 'Cost' },
  { key: 'weight', label: 'Weight' },
  { key: 'frequency', label: 'Frequency' },
]

const wasteRanking = computed(() => rankWastedFoods(visibleEvents.value, rankingMetric.value))

const topWastedFoods = computed(() => wasteRanking.value.slice(0, 5))

const selectedFood = ref(null)

const selectedWaste = computed(() =>
  wasteRanking.value.find((food) => food.key === selectedFood.value),
)

const rankingMax = computed(() =>
  Math.max(1e-9, ...topWastedFoods.value.map((food) => food[rankingMetric.value])),
)

function rankingValue(food) {
  if (rankingMetric.value === 'value') return currency.format(food.value)
  if (rankingMetric.value === 'weight') return `${food.weight.toFixed(2)} kg`
  return `${food.frequency} ${food.frequency === 1 ? 'occasion' : 'occasions'}`
}

function selectFood(key) {
  selectedFood.value = selectedFood.value === key ? null : key
}

watch(wasteRanking, (foods) => {
  if (selectedFood.value && !foods.some((food) => food.key === selectedFood.value))
    selectedFood.value = null
})

const periodPresets = [
  { label: 'All dates', count: null },
  { label: 'Last 7 days', count: 7 },
  { label: 'Last 14 days', count: 14 },
  { label: 'Last 30 days', count: 30 },
]

function choosePeriod(count) {
  selectedFood.value = null
  cancelDrag()
  setRange(
    count
      ? [Math.max(0, days.value.length - count), days.value.length - 1]
      : [0, days.value.length - 1],
    true,
  )
}

function isPreset(count) {
  return (
    range.value[1] === days.value.length - 1 &&
    range.value[0] === (count ? Math.max(0, days.value.length - count) : 0)
  )
}

const recentEvents = computed(() =>
  visibleEvents.value
    .filter((event) => !selectedFood.value || foodKey(event.name) === selectedFood.value)
    .slice()
    .reverse(),
)
const animatedTotals = useAnimatedTotals(totals)
</script>

<template>
  <section class="container-xl py-4 analytics-page" aria-label="Food Waste Analytics">
    <header class="hero row align-items-center fc-page-heading">
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
          <span class="stamp-note">In the selected dates</span>
        </div>
      </div>
    </header>

    <div v-if="loadError" class="alert alert-danger" role="alert">
      {{ loadError }} <button type="button" @click="loadActivity">Retry</button>
    </div>
    <p v-if="!loading && !events.length" class="mb-4">
      No food activity yet. Consume or discard food in your fridge to start tracking your impact.
    </p>
    <ImpactOverview
      class="mb-5"
      :totals="totals"
      :animated-totals="animatedTotals"
      :period-change="comparison.complete ? periodChange : undefined"
    />
    <section
      id="daily-food-impact"
      class="panel chart-panel mb-5"
      aria-labelledby="impact-chart-heading"
    >
      <div>
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <h2 id="impact-chart-heading" class="panel-title mb-2">Daily food impact</h2>
            <p id="chart-help" class="text-muted small">
              <template v-if="compactChart">
                Pick a date range below. Swipe sideways when zoomed in, or tap a date to edit its
                activity.
              </template>
              <template v-else>
                Scroll over the graph to zoom. When zoomed in, drag sideways to move through the
                dates. Drag the bar handles to adjust the range, or click a date to edit its
                activity.
              </template>
            </p>
          </div>
          <button class="btn-paper btn-paper-secondary" :disabled="!isZoomed" @click="resetZoom">
            Reset zoom
          </button>
        </div>
        <div class="period-presets" role="group" aria-label="Date presets">
          <button
            v-for="preset in periodPresets"
            :key="preset.label"
            type="button"
            class="filter-chip"
            :aria-pressed="isPreset(preset.count)"
            @click="choosePeriod(preset.count)"
          >
            {{ preset.label }}
          </button>
        </div>
        <div class="range-panel mb-3">
          <p class="range-summary mb-1" aria-live="polite">
            {{ formatDate(visibleDays[0]) }} – {{ formatDate(visibleDays.at(-1)) }} ·
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
              min="0"
              :max="days.length - 1"
              step="1"
              :value="range[0]"
              @input="changeRange(0, $event)"
            />
            <input
              type="range"
              aria-label="End date"
              :aria-valuetext="formatDate(days[range[1]])"
              min="0"
              :max="days.length - 1"
              step="1"
              :value="range[1]"
              @input="changeRange(1, $event)"
            />
          </div>
          <div class="d-flex justify-content-between text-muted small">
            <span>{{ formatDate(days[0]) }}</span
            ><span>{{ formatDate(days.at(-1)) }}</span>
          </div>
        </div>
        <div class="comparison-note" aria-live="polite">
          <template v-if="comparison.complete"
            >Comparing {{ formatDate(visibleDays[0]) }}–{{ formatDate(visibleDays.at(-1)) }} with
            {{ formatDate(comparison.start) }}–{{ formatDate(comparison.end) }} ·
            {{ comparison.length }} days each.
            <span :class="`change-${periodChange('discardedValue').tone}`"
              >Discarded value: {{ periodChange('discardedValue').text.toLowerCase() }}.</span
            ></template
          >
          <template v-else
            >Not enough earlier history to compare this {{ comparison.length }}-day period. Try Last
            7 days or Last 14 days. Recorded history: {{ formatDate(days[0]) }}–{{
              formatDate(days.at(-1))
            }}
            .</template
          >
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
          :class="{ 'is-dragging': drag, 'is-compact': compactChart }"
          :viewBox="`0 0 ${chartWidth} ${compactChart ? 265 : 365}`"
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
                v-for="day in renderedDays"
                :key="day.date"
                :cx="globalX(day.index)"
                :cy="y(day[line.key])"
                r="3"
                :fill="line.color"
                :tabindex="
                  line.key === 'saved' && day.index >= range[0] && day.index <= range[1]
                    ? 0
                    : undefined
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
            <g
              :transform="`translate(${Math.max(8, Math.min(globalX(hover) + 10, chartWidth - 228))}, 35)`"
            >
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
          Cards and activity follow the selected dates. Weights and values reflect your recorded
          activity.
        </p>
      </div>
    </section>
    <section class="panel waste-panel mb-5" aria-labelledby="waste-ranking-heading">
      <div class="ranking-heading">
        <div>
          <h2 id="waste-ranking-heading" class="panel-title">What keeps going to waste?</h2>
          <p class="panel-sub">
            Your top five foods, based on recorded discards in the selected dates.
          </p>
        </div>
        <div class="ranking-controls" role="group" aria-label="Rank wasted foods by">
          <button
            v-for="option in rankingOptions"
            :key="option.key"
            type="button"
            class="filter-chip"
            :aria-pressed="rankingMetric === option.key"
            @click="rankingMetric = option.key"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <p class="ranking-hint">
        Select a food to explore its activity below. Frequency counts discard records, not
        quantities.
      </p>
      <div v-if="topWastedFoods.length" class="ranking-layout">
        <TransitionGroup tag="ol" name="ranking" class="waste-ranking">
          <li v-for="(food, index) in topWastedFoods" :key="food.key">
            <button
              type="button"
              class="ranking-row"
              :aria-pressed="selectedFood === food.key"
              :aria-label="`${food.name}: ${rankingValue(food)}. Filter food activity`"
              @click="selectFood(food.key)"
            >
              <span class="ranking-position" aria-hidden="true">{{ index + 1 }}</span>
              <span class="ranking-food"
                ><span class="ranking-food-heading"
                  ><b>{{ food.name }}</b
                  ><span class="ranking-amount">{{ rankingValue(food) }}</span></span
                ><span class="ranking-track" aria-hidden="true"
                  ><span
                    :style="{ width: `${(food[rankingMetric] / rankingMax) * 100}%` }"
                  ></span></span
                ><span class="ranking-meta"
                  >{{ currency.format(food.value) }} · {{ food.weight.toFixed(2) }} kg ·
                  {{ food.frequency }} {{ food.frequency === 1 ? 'discard' : 'discards' }}</span
                ></span
              >
            </button>
          </li>
        </TransitionGroup>
        <aside class="waste-insight" aria-live="polite">
          <template v-if="selectedWaste"
            ><span class="pill pill-discarded">A little less next time?</span>
            <h3>{{ selectedWaste.name }}</h3>
            <p>
              {{
                selectedWaste.frequency > 1
                  ? `Discarded on ${selectedWaste.frequency} occasions. Try buying a smaller quantity next time.`
                  : 'Plan a meal around this food before your next shop.'
              }}
            </p>
            <p class="insight-value">
              {{ currency.format(selectedWaste.value) }} of recorded food value discarded.
            </p>
            <RouterLink :to="{ name: 'freshness-recipes' }" class="insight-link"
              >Explore recipes <span aria-hidden="true">→</span></RouterLink
            ></template
          >
          <template v-else
            ><h3>Spot a pattern. Make a small change.</h3>
            <p>
              Choose Cost to see the biggest financial loss, Weight for volume, or Frequency for
              recurring habits.
            </p>
            <p>Select a bar to see a suggestion and filter the activity table.</p></template
          >
        </aside>
      </div>
      <p v-else class="waste-empty" role="status">
        No discarded food recorded in these dates. Choose a wider date range to explore more
        activity.
      </p>
    </section>
    <section class="panel activity-panel" aria-labelledby="activity-heading">
      <div>
        <div class="activity-heading">
          <div>
            <h2 id="activity-heading" class="panel-title">Food activity</h2>
            <p class="panel-sub">The little details behind your impact.</p>
          </div>
          <span class="pill pill-aqua">{{ recentEvents.length }} records</span>
        </div>
        <p v-if="selectedWaste" class="activity-filter" role="status">
          Showing all actions for <b>{{ selectedWaste.name }}</b> in these dates.
          <button type="button" class="date-link" @click="selectedFood = null">
            Clear food filter
          </button>
        </p>
        <div class="table-responsive" role="region" aria-label="Food activity table" tabindex="0">
          <table class="activity-table">
            <caption>
              Food activity for the selected dates{{
                selectedWaste ? `, filtered to ${selectedWaste.name}` : ''
              }}, newest first.
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
                    @click="openDay(visibleDays.indexOf(foodActivityDay(event.occurredAt)))"
                  >
                    {{ formatDate(foodActivityDay(event.occurredAt)) }}
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
            Activity for {{ formatDate(selectedDate) }} {{ selectedDate?.slice(0, 4) }}
          </h2>
          <button
            type="button"
            class="btn-close"
            aria-label="Close editor"
            @click="!saving && closeEditor()"
          ></button>
        </div>
        <p id="editor-help" class="small text-muted">
          Record what happened on this date. Saved activity updates your chart and totals.
        </p>
        <button type="button" class="btn-paper mb-3" :disabled="saving" @click="addDraft">
          Add record
        </button>
        <fieldset
          :disabled="saving"
          v-for="(draft, index) in drafts"
          :key="draft._id"
          class="editor-record p-3 mb-3"
        >
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
          <button
            type="button"
            class="btn-paper btn-paper-secondary"
            @click="!saving && closeEditor()"
          >
            Cancel
          </button>
          <button type="submit" class="btn-paper" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </form>
    </dialog>
    <VegetableCompanions :events="visibleEvents" />
  </section>
</template>

<style scoped src="../../styles/analytics/analytics.css"></style>
