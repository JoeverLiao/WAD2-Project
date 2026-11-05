import { expect, it, vi } from 'vitest'
import { mockHttp } from './helpers/mockHttp.js'
import { http, isRequestCancelled } from '../services/http.js'
import { fetchFoodActivity, saveFoodActivity } from '../services/analytics.js'
import { saveInventoryItem, deleteInventoryItem } from '../services/inventory.js'

it('uses the API base URL and cookies for both features and serializes mutation payloads', async () => {
  const request = vi.fn(async (url, config) => ({
    status: 200,
    data: url.includes('/analytics/')
      ? { event: { ...JSON.parse(config.data), _id: 'event' } }
      : { item: { ...JSON.parse(config.data), _id: 'food' } },
  }))
  mockHttp(request)
  await saveInventoryItem(null, { name: 'Milk', quantity: 2 })
  await saveInventoryItem('food', { storage: 'pantry', storageZone: 'dry-storage' })
  await saveFoodActivity({ name: 'Milk' }, '2026-11-04T16:00:00.000Z')
  await saveFoodActivity({ _id: 'event', name: 'Eggs' }, '2026-11-04T16:00:00.000Z')
  expect(request.mock.calls.map(([url, config]) => [url, config.method])).toEqual([
    ['/api/inventory', 'POST'],
    ['/api/inventory/food', 'PATCH'],
    ['/api/analytics/events', 'POST'],
    ['/api/analytics/events/event', 'PUT'],
  ])
  expect(request.mock.calls.every(([, config]) => config.withCredentials === true)).toBe(true)
  expect(JSON.parse(request.mock.calls[2][1].data).occurredAt).toBe('2026-11-04T16:00:00.000Z')
})

it('keeps the activity payload when deleting food', async () => {
  const request = vi.fn(async () => ({ status: 204 }))
  mockHttp(request)
  expect(await deleteInventoryItem('food', { activity: 'discarded' })).toBeNull()
  expect(request).toHaveBeenCalledWith(
    '/api/inventory/food',
    expect.objectContaining({
      method: 'DELETE',
      data: JSON.stringify({ activity: 'discarded' }),
    }),
  )
})

it('transforms JSON responses using Axios', async () => {
  mockHttp(vi.fn(async () => ({ status: 200, data: '{"events":[]}' })))
  expect(await fetchFoodActivity()).toEqual([])
})

it('keeps backend validation messages and status codes', async () => {
  mockHttp(vi.fn(async () => ({ status: 400, data: { error: 'Enter a valid quantity.' } })))
  await expect(saveInventoryItem('food', { quantity: -1 })).rejects.toMatchObject({
    status: 400,
    message: 'Enter a valid quantity.',
  })
})

it('reports malformed success responses instead of silently using an empty history', async () => {
  mockHttp(vi.fn(async () => ({ status: 200, data: 'Not JSON' })))
  await expect(fetchFoodActivity()).rejects.toMatchObject({
    status: 200,
    message: 'Server returned an invalid response (HTTP 200).',
  })
})

it('passes AbortSignals through and preserves Axios cancellation', async () => {
  const controller = new AbortController()
  let complete
  const request = vi.fn(async (_url, config) => {
    expect(config.signal).toBe(controller.signal)
    return new Promise((resolve) => {
      complete = resolve
    })
  })
  mockHttp(request)
  const pending = fetchFoodActivity({ signal: controller.signal }).catch((error) => error)
  controller.abort()
  complete({ status: 200, data: { events: [] } })
  expect(isRequestCancelled(await pending)).toBe(true)
})

it('does not send an already-cancelled request', async () => {
  const request = vi.fn()
  mockHttp(request)
  const controller = new AbortController()
  controller.abort()
  const error = await http.get('/inventory', { signal: controller.signal }).catch((error) => error)
  expect(isRequestCancelled(error)).toBe(true)
  expect(request).not.toHaveBeenCalled()
})
