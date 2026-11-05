import { http } from './http.js'

export async function seedAnalyticsDemo() {
  const { data } = await http.post('/analytics/demo')
  return data
}

export async function fetchFoodActivity(options) {
  const { data } = await http.get('/analytics/history', options)
  return data.events || []
}

export async function saveFoodActivity(event, occurredAt) {
  const body = { ...event, occurredAt }
  const { data } = event._id
    ? await http.put(`/analytics/events/${encodeURIComponent(event._id)}`, body)
    : await http.post('/analytics/events', body)
  return data.event
}
