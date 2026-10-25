const DAY_MS = 86400000
const dayTime = (date) => Date.parse(`${date}T00:00:00Z`)
const isoDay = (time) => new Date(time).toISOString().slice(0, 10)
export const foodKey = (name) => name.trim().toLowerCase()

export function summarizeFoodEvents(events) {
  return events.reduce(
    (sum, event) => {
      if (event.action === 'discarded') {
        sum.discarded += event.weightKg
        sum.discardedValue += event.valueSgd
      } else {
        sum.saved += event.weightKg
        sum.value += event.valueSgd
      }
      if (event.action === 'shared' || event.action === 'rescued') sum.community++
      return sum
    },
    { saved: 0, discarded: 0, discardedValue: 0, value: 0, community: 0 },
  )
}

// Compare equal calendar windows, never a partial earlier window against a full one.
export function previousFoodPeriod(start, end, coverageStart) {
  const length = Math.round((dayTime(end) - dayTime(start)) / DAY_MS) + 1
  const previousStart = isoDay(dayTime(start) - length * DAY_MS)
  const previousEnd = isoDay(dayTime(start) - DAY_MS)
  return {
    start: previousStart,
    end: previousEnd,
    complete: previousStart >= coverageStart,
    length,
  }
}

export function rankWastedFoods(events, metric = 'value') {
  const groups = new Map()
  for (const event of events) {
    if (event.action !== 'discarded') continue
    const key = foodKey(event.name)
    const group = groups.get(key) || {
      key,
      name: event.name.trim(),
      weight: 0,
      value: 0,
      frequency: 0,
    }
    group.weight += event.weightKg
    group.value += event.valueSgd
    group.frequency++
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
}

export function foodPeriodChange(current, previous, lowerIsBetter = false) {
  const difference = current - previous
  if (Math.abs(difference) < 0.000001) return { text: 'No change', tone: 'neutral' }
  const tone = difference > 0 !== lowerIsBetter ? 'good' : 'bad'
  if (previous === 0) return { text: 'New this period', tone }
  const percent = Math.abs(difference / previous) * 100
  const amount = percent < 0.1 ? '<0.1' : percent.toFixed(1).replace(/\.0$/, '')
  return { text: `${difference > 0 ? '↑' : '↓'} ${amount}% vs previous`, tone }
}
