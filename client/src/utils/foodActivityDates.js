// Activity timestamps use Singapore calendar days throughout the analytics UI.
// Calendar-only values stay calendar-only; do not shift expiry/form dates.
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function foodActivityDay(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function foodActivityTimestamp(day) {
  return new Date(`${day}T00:00:00+08:00`).toISOString()
}

export function indexFoodActivity(events) {
  const days = new Map()
  for (const event of events) {
    const day = foodActivityDay(event.occurredAt)
    if (!day) continue
    if (!days.has(day)) days.set(day, { date: day, saved: 0, discarded: 0, events: [] })
    const bucket = days.get(day)
    bucket[event.action === 'discarded' ? 'discarded' : 'saved'] += event.weightKg
    bucket.events.push(event)
  }
  return days
}

export function activityCalendar(index, today = foodActivityDay()) {
  const dates = [...index.keys()].sort()
  const end = dates.at(-1) > today ? dates.at(-1) : today
  const endTime = Date.parse(`${end}T00:00:00Z`)
  const start = Math.min(
    endTime - 29 * 86400000,
    dates[0] ? Date.parse(`${dates[0]}T00:00:00Z`) : Infinity,
  )
  return Array.from({ length: Math.round((endTime - start) / 86400000) + 1 }, (_, i) =>
    new Date(start + i * 86400000).toISOString().slice(0, 10),
  )
}
