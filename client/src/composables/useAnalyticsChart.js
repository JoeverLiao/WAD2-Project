import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { activityCalendar, indexFoodActivity } from '../utils/foodActivityDates.js'

// Chart coordinates, zoom/pan gestures and viewport motion stay together.
export function useAnalyticsChart({ events, openDate }) {
  const activityIndex = computed(() => indexFoodActivity(events.value))
  const days = computed(() => activityCalendar(activityIndex.value))
  const range = ref([Math.max(0, days.value.length - 30), days.value.length - 1])
  const visibleDays = computed(() => days.value.slice(range.value[0], range.value[1] + 1))
  let mounted = false
  let motionPreference
  let suppressClick = false

  const drag = ref(null)

  const hover = ref(null)

  const chart = ref(null)

  const chartWidth = ref(1000)

  const compactChart = computed(() => chartWidth.value < 600)

  const plot = reactive({ left: 70, right: 950, top: 30, bottom: 300 })

  let chartObserver

  function resizeChart(width) {
    if (width <= 0) return
    const compact = width < 600
    chartWidth.value = compact ? width : 1000
    plot.left = compact ? 45 : 70
    plot.right = compact ? width - 27 : 950
    plot.bottom = compact ? 225 : 300
  }

  const fullDaily = computed(() =>
    days.value.map((date, index) => ({
      date,
      index,
      saved: 0,
      discarded: 0,
      ...activityIndex.value.get(date),
    })),
  )
  const daily = computed(() => fullDaily.value.slice(range.value[0], range.value[1] + 1))
  const yMax = computed(() =>
    Math.max(
      0.5,
      Math.ceil(Math.max(...daily.value.flatMap((day) => [day.saved, day.discarded])) * 2) / 2,
    ),
  )

  const renderedRange = ref([...range.value])

  const renderedYMax = ref(yMax.value)

  let zoomFrame

  const renderedDays = computed(() =>
    fullDaily.value.slice(
      Math.max(0, Math.floor(renderedRange.value[0]) - 1),
      Math.ceil(renderedRange.value[1]) + 2,
    ),
  )
  const globalX = (index) =>
    plot.left +
    ((index - renderedRange.value[0]) / (renderedRange.value[1] - renderedRange.value[0])) *
      (plot.right - plot.left)

  const x = (index) => globalX(range.value[0] + index)

  const y = (value) => plot.bottom - (value / renderedYMax.value) * (plot.bottom - plot.top)

  const points = (key) =>
    renderedDays.value.map((day) => `${globalX(day.index)},${y(day[key])}`).join(' ')

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

  const xTicks = computed(() => {
    const count = Math.min(compactChart.value ? 3 : 6, daily.value.length)
    if (count <= 1) return count ? [0] : []
    return [
      ...new Set(
        Array.from({ length: count }, (_, index) =>
          Math.round((index * (daily.value.length - 1)) / (count - 1)),
        ),
      ),
    ]
  })

  const hoverDay = computed(() => (hover.value === null ? null : fullDaily.value[hover.value]))

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
        days.value.length - 1,
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
      const start = Math.max(0, Math.min(days.value.length - 1 - span, first + shift))
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
    setRange([0, days.value.length - 1], true)
    cancelDrag()
  }

  function changeRange(boundary, event) {
    const index = Number(event.target.value)
    const next = [...range.value]
    next[boundary] =
      boundary === 0
        ? Math.max(0, Math.min(index, next[1] - 1))
        : Math.min(days.value.length - 1, Math.max(index, next[0] + 1))
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
      Math.min(days.value.length - 1, span + (event.deltaY < 0 ? -change : change)),
    )
    if (nextSpan === span) return
    // Keep the date under the pointer at the same position within the new window.
    const anchor = range.value[0] + fraction * span
    const start = Math.max(
      0,
      Math.min(days.value.length - 1 - nextSpan, Math.round(anchor - fraction * nextSpan)),
    )
    setRange([start, start + nextSpan], true)
    hover.value = indexAt(point.x)
  }

  function openDay(index) {
    return openDate(daily.value[index].date)
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
  function motionChanged() {
    if (motionPreference?.matches) updateViewport(false)
  }
  watch(days, (next, previous) => {
    if (next[0] !== previous[0] || next.at(-1) !== previous.at(-1)) {
      range.value = [Math.max(0, next.length - 30), next.length - 1]
    }
    updateViewport(false)
  })
  onMounted(() => {
    mounted = true
    resizeChart(chart.value?.clientWidth ?? 0)
    if (chart.value && typeof ResizeObserver !== 'undefined') {
      chartObserver = new ResizeObserver(([entry]) => resizeChart(entry.contentRect.width))
      chartObserver.observe(chart.value)
    }
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    motionPreference?.addEventListener('change', motionChanged)
  })
  onBeforeUnmount(() => {
    mounted = false
    chartObserver?.disconnect()
    cancelAnimationFrame(zoomFrame)
    motionPreference?.removeEventListener('change', motionChanged)
  })
  return {
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
  }
}
