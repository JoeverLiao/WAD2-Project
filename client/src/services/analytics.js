import { apiRequest } from './api.js'

export async function fetchFoodActivity(options) {
  const data = await apiRequest('/analytics/history', options)
  return data.events || []
}

export async function saveFoodActivity(event, occurredAt) {
  const data = await apiRequest(
    event._id ? `/analytics/events/${encodeURIComponent(event._id)}` : '/analytics/events',
    {
      method: event._id ? 'PUT' : 'POST',
      body: { ...event, occurredAt },
    },
  )
  return data.event
}
