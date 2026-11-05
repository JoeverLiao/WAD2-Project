import { mockHttp } from './helpers/mockHttp.js'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInventoryStore } from '../stores/inventory.js'
import { fetchInventory, deleteInventoryItem } from '../services/inventory.js'
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
  mockHttp(request)
  const fridge = useInventoryStore()
  const dashboard = useInventoryStore()
  const a = fridge.loadInventory()
  const b = dashboard.loadInventory()
  expect(request).toHaveBeenCalledTimes(1)
  resolve({
    data: {
      items: [
        { _id: 'rice', storage: 'pantry', storageZone: 'middle-shelf', expiresAt: null },
        { _id: 'fish', storage: 'freezer', storageZone: 'door' },
      ],
    },
    status: 200,
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
  mockHttp(
    vi
      .fn()
      .mockResolvedValueOnce({ status: 401, data: {} })
      .mockResolvedValueOnce({ data: { items: [] }, status: 200 }),
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
  mockHttp(vi.fn(async () => ({ status: 204 })))
  expect(await deleteInventoryItem('food')).toBeNull()
})

it('retains a useful status message when an error response is not JSON', async () => {
  mockHttp(vi.fn(async () => ({ status: 401, data: 'Not JSON' })))
  await expect(fetchInventory()).rejects.toMatchObject({
    status: 401,
    message: 'Your session has expired. Please sign in again.',
  })
})

it('clears inventory when the account changes and ignores a late load from the old session', async () => {
  let resolve
  mockHttp(
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
  resolve({ data: { items: [{ _id: 'old-session-food' }] }, status: 200 })
  await pending
  expect(store.items).toEqual([])
  expect(store.loading).toBe(false)
})
