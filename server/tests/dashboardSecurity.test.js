import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, mock, test } from 'node:test'
import express from 'express'
import auth from '../middleware/auth.js'
import InventoryItem from '../models/inventoryItemModel.js'
import dashboardRoutes from '../routes/dashboardRoutes.js'

afterEach(() => mock.restoreAll())

const USER_A = '507f1f77bcf86cd799439011'
const USER_B = '507f1f77bcf86cd799439012'
const USER_WITHOUT_ITEMS = '507f1f77bcf86cd799439013'
const cookieFor = (userId) => ({ Cookie: `token=${auth.signToken({ id: userId })}` })

async function startApp(t) {
  const app = express()
  app.use('/api/dashboard', dashboardRoutes)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()))
    server.closeAllConnections()
  }))
  return `http://127.0.0.1:${server.address().port}/api/dashboard`
}

const getDashboard = (url, headers = {}) => fetch(url, { headers })
const query = (items) => ({ lean: async () => items })

test('GET /api/dashboard requires authentication before reading inventory', async (t) => {
  const find = mock.method(InventoryItem, 'find', () => query([]))
  const url = await startApp(t)

  const response = await getDashboard(url)

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Authentication required' })
  assert.equal(find.mock.calls.length, 0)
})

test('GET /api/dashboard returns only the authenticated user inventory', async (t) => {
  const userItems = new Map([
    [USER_A, [
      { _id: 'a-milk', name: 'Milk', quantity: 2, unit: 'cartons', storage: 'fridge' },
      { _id: 'a-eggs', name: 'Eggs', quantity: 6, unit: 'pieces', storage: 'pantry' },
    ]],
    [USER_B, [
      { _id: 'b-rice', name: 'Rice', quantity: 1, unit: 'bag', storage: 'pantry' },
    ]],
  ])
  const find = mock.method(InventoryItem, 'find', filter => query(userItems.get(String(filter.user)) ?? []))
  const url = await startApp(t)

  const responseA = await getDashboard(url, cookieFor(USER_A))
  const dashboardA = await responseA.json()
  const responseB = await getDashboard(url, cookieFor(USER_B))
  const dashboardB = await responseB.json()

  assert.equal(responseA.status, 200)
  assert.equal(dashboardA.totalItems, 8)
  assert.deepEqual(dashboardA.storageBreakdown.fridge.items.map(item => item.name), ['Milk'])
  assert.deepEqual(dashboardA.storageBreakdown.pantry.items.map(item => item.name), ['Eggs'])
  assert.equal(responseB.status, 200)
  assert.equal(dashboardB.totalItems, 1)
  assert.deepEqual(dashboardB.storageBreakdown.fridge.items, [])
  assert.deepEqual(dashboardB.storageBreakdown.pantry.items.map(item => item.name), ['Rice'])
  assert.deepEqual(find.mock.calls.map(call => call.arguments[0]), [
    { user: USER_A },
    { user: USER_B },
  ])
})

test('GET /api/dashboard preserves the response shape for a user with no inventory', async (t) => {
  const find = mock.method(InventoryItem, 'find', () => query([]))
  const url = await startApp(t)

  const response = await getDashboard(url, cookieFor(USER_WITHOUT_ITEMS))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    totalItems: 0,
    categories: 0,
    urgentCount: 0,
    storageBreakdown: {
      fridge: { count: 0, itemCount: 0, items: [], expiringSoon: [], healthyCount: 0 },
      freezer: { count: 0, itemCount: 0, items: [], expiringSoon: [], healthyCount: 0 },
      pantry: { count: 0, itemCount: 0, items: [], expiringSoon: [], healthyCount: 0 },
    },
    expiringToday: [],
    expired: [],
  })
  assert.deepEqual(find.mock.calls[0].arguments[0], { user: USER_WITHOUT_ITEMS })
})
