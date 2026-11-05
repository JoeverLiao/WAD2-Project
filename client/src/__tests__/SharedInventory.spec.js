import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '../stores/inventory.js'
import { apiRequest } from '../services/api.js'
import { useAuthStore } from '../stores/auth.js'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

it('shares a single load and normalizes legacy food consistently for every consumer', async () => {
  let resolve
  const request = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('fetch', request)
  const fridge = useInventoryStore()
  const dashboard = useInventoryStore()
  const a = fridge.loadInventory()
  const b = dashboard.loadInventory()
  expect(request).toHaveBeenCalledTimes(1)
  resolve({
    ok: true,
    json: async () => ({
      items: [
        { _id: 'rice', storage: 'pantry', storageZone: 'middle-shelf', expiresAt: null },
        { _id: 'fish', storage: 'freezer', storageZone: 'door' },
      ],
    }),
  })
  await Promise.all([a, b])
  expect(fridge).toBe(dashboard)
  expect(fridge.items[0]).toMatchObject({
    id: 'rice',
    storageZone: 'dry-storage',
    expiresAt: '',
    allowedLocations: [],
  })
  expect(dashboard.items[1].storageZone).toBe('freezer-main')
})

it('keeps existing inventory visible on a failed refresh and allows retrying', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) }),
  )
  const store = useInventoryStore()
  store.items = [{ id: 'existing' }]
  await store.loadInventory()
  expect(store.error).toContain('sign in')
  expect(store.items).toHaveLength(1)
  expect(store.loading).toBe(false)
  await store.loadInventory()
  expect(store.error).toBe('')
  expect(store.items).toEqual([])
})

it('handles empty delete responses through the common API helper', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 204 })),
  )
  expect(await apiRequest('/inventory/food', { method: 'DELETE' })).toBeNull()
})

it('retains a useful status message when an error response is not JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError('Not JSON')
      },
    })),
  )
  await expect(apiRequest('/inventory')).rejects.toMatchObject({
    status: 401,
    message: 'Your session has expired. Please sign in again.',
  })
})

it('clears inventory when the account changes and ignores a late load from the old session', async () => {
  let resolve
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    ),
  )
  const auth = useAuthStore()
  auth.user = { id: 'first' }
  const store = useInventoryStore()
  store.items = [{ id: 'old-food' }]
  const pending = store.loadInventory()
  auth.user = { id: 'second' }
  expect(store.items).toEqual([])
  resolve({ ok: true, json: async () => ({ items: [{ _id: 'old-session-food' }] }) })
  await pending
  expect(store.items).toEqual([])
  expect(store.loading).toBe(false)
})
