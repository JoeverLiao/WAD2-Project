import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import InventoryItem from '../models/inventoryItemModel.js'
import auth from '../middleware/auth.js'
import scanningRoutes from '../routes/scanningRoutes.js'
import inventoryRoutes from '../routes/inventoryRoutes.js'
import { addItemsToInventory, groupSameProducts } from '../services/inventoryService.js'
import { mergeDuplicateItems } from '../services/itemEnrichment.js'
import { normaliseItem } from '../../client/src/utils/inventoryModel.js'

afterEach(() => mock.restoreAll())

const owner = '507f1f77bcf86cd799439011'
const otherOwner = '507f1f77bcf86cd799439012'
const milk = { name: 'Milk', quantity: 1, unit: 'bottles', storage: 'fridge', storageZone: 'middle-shelf' }
const date = day => new Date(`${day}T12:00:00.000Z`)

// An isolated model stand-in: writes and later GETs share records, without touching MongoDB.
// Validate inserted/edited documents with the real schema; implement the filters used by these paths.
function inventoryMemory() {
  const records = []
  const matches = (item, filter) => Object.entries(filter).every(([field, expected]) => {
    const actual = item[field]
    if (expected === null) return actual == null
    if (expected && typeof expected === 'object' && '$gte' in expected) {
      return actual != null && new Date(actual) >= expected.$gte && new Date(actual) < expected.$lt
    }
    return field === 'name'
      ? String(actual).toLowerCase() === String(expected).toLowerCase()
      : String(actual) === String(expected)
  })
  const query = read => ({
    collation() { return this },
    sort() { return this },
    async lean() { return structuredClone(read()) },
    then(resolve, reject) { return this.lean().then(resolve, reject) },
  })
  async function validated(value) {
    const document = new InventoryItem(value)
    await document.validate()
    const plain = document.toObject()
    return { ...plain, _id: String(plain._id), user: String(plain.user) }
  }
  mock.method(InventoryItem, 'create', async value => {
    const item = await validated(value)
    records.push(item)
    return structuredClone(item)
  })
  mock.method(InventoryItem, 'bulkWrite', async operations => {
    let upsertedCount = 0
    let matchedCount = 0
    for (const { updateOne: { filter, update } } of operations) {
      let item = records.find(value => matches(value, filter))
      if (item) matchedCount++
      else {
        const equalities = Object.fromEntries(Object.entries(filter)
          .filter(([, value]) => value === null || typeof value !== 'object'))
        item = await validated({ ...equalities, ...update.$setOnInsert })
        records.push(item)
        upsertedCount++
      }
      for (const [field, amount] of Object.entries(update.$inc || {})) {
        item[field] = (item[field] ?? 0) + amount
      }
    }
    return { upsertedCount, matchedCount }
  })
  mock.method(InventoryItem, 'findOne', filter => query(() => records.find(item => matches(item, filter))))
  mock.method(InventoryItem, 'find', filter => query(() => records.filter(item => matches(item, filter))))
  mock.method(InventoryItem, 'findOneAndUpdate', async (filter, update) => {
    const index = records.findIndex(item => matches(item, filter))
    if (index < 0) return null
    records[index] = await validated({ ...records[index], ...update.$set })
    return structuredClone(records[index])
  })
  return records
}

test('incoming Milk and Eggs with different expiry days remain separate batches', () => {
  const groups = groupSameProducts([
    { ...milk, expiresAt: date('2026-11-10') },
    { ...milk, expiresAt: date('2026-11-20') },
    { ...milk, name: 'Eggs', quantity: 6, expiresAt: date('2026-11-12') },
    { ...milk, name: 'Eggs', quantity: 12, expiresAt: date('2026-11-25') },
  ])
  assert.deepEqual(groups.map(item => item.quantity), [1, 1, 6, 12])
  assert.equal(groups.length, 4)
})

test('the same calendar expiry day merges quantities, weights and prices despite timestamp differences', () => {
  const groups = groupSameProducts([
    { ...milk, quantity: 1, weightKg: 0.5, purchasePrice: 2.5, expiresAt: new Date('2026-11-10T00:00:00Z') },
    { ...milk, name: 'MILK', quantity: 2, weightKg: 1, purchasePrice: 5, expiresAt: date('2026-11-10') },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual([groups[0].quantity, groups[0].weightKg, groups[0].purchasePrice], [3, 1.5, 7.5])
})

test('missing, null and empty expiry group together but never with a known expiry', () => {
  const groups = groupSameProducts([
    milk, { ...milk, expiresAt: null }, { ...milk, expiresAt: '' },
    { ...milk, expiresAt: date('2026-11-20') },
  ])
  assert.deepEqual(groups.map(item => item.quantity), [3, 1])
})

test('OCR duplicate grouping also preserves different and unknown expiry batches', () => {
  const groups = mergeDuplicateItems([
    { ...milk, expiresAt: '2026-11-10', price: 2, weightKg: 0.5 },
    { ...milk, quantity: 2, expiresAt: '2026-11-10T23:59:59.999Z', price: 4, weightKg: 1 },
    { ...milk, expiresAt: '2026-11-20' }, milk,
  ])
  assert.equal(groups.length, 3)
  assert.deepEqual([groups[0].quantity, groups[0].price, groups[0].weightKg], [3, 6, 1.5])
})

for (const time of ['00:00:00.000', '12:00:00.000', '23:59:59.999']) {
  test(`upserts match an existing expiry at ${time} without changing its ID or neighbouring batch`, async () => {
    const records = inventoryMemory()
    const existing = await InventoryItem.create({ ...milk, user: owner, expiresAt: new Date(`2026-11-10T${time}Z`), weightKg: 0.5, purchasePrice: 2.5 })
    const neighbour = await InventoryItem.create({ ...milk, user: owner, expiresAt: date('2026-11-11') })
    const result = await addItemsToInventory(owner, [{ ...milk, quantity: 2, expiresAt: date('2026-11-10'), weightKg: 1, purchasePrice: 5 }])
    assert.equal(result.added, 0)
    assert.equal(result.merged, 1)
    assert.equal(String(result.items[0]._id), existing._id)
    const saved = records.find(item => item._id === existing._id)
    assert.deepEqual([saved.quantity, saved.weightKg, saved.purchasePrice], [3, 1.5, 7.5])
    assert.equal(saved.expiresAt.toISOString(), existing.expiresAt.toISOString())
    assert.deepEqual(records.find(item => item._id === neighbour._id), neighbour)
  })
}

for (const expiry of [undefined, null]) {
  test(`upserts keep ${expiry} expiry stock separate from dated stock and other owners`, async () => {
    const records = inventoryMemory()
    const undated = await InventoryItem.create({ ...milk, user: owner, expiresAt: expiry })
    const other = await InventoryItem.create({ ...milk, user: otherOwner, quantity: 99, expiresAt: date('2026-11-20') })
    const dated = await addItemsToInventory(owner, [{ ...milk, expiresAt: date('2026-11-20') }])
    assert.equal(dated.added, 1)
    assert.notEqual(String(dated.items[0]._id), undated._id)
    assert.deepEqual(records.find(item => item._id === undated._id), undated)
    await addItemsToInventory(owner, [{ ...milk, quantity: 2 }])
    assert.equal(records.find(item => item._id === undated._id).quantity, 3)
    assert.equal(records.find(item => item._id === String(dated.items[0]._id)).quantity, 1)
    assert.deepEqual(records.find(item => item._id === other._id), other)
  })
}

async function startApp(t) {
  const app = express()
  app.use(express.json())
  app.use('/api/scanning', scanningRoutes)
  app.use('/api/inventory', inventoryRoutes)
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => {
    server.close(resolve)
    server.closeAllConnections()
  }))
  const base = `http://127.0.0.1:${server.address().port}`
  return async (path, method = 'GET', body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { Cookie: `token=${auth.signToken({ id: owner })}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const result = await response.json()
    assert.equal(response.status, method === 'POST' ? 201 : 200, JSON.stringify(result))
    return result
  }
}

for (const source of ['receipt', 'manual']) {
  test(`${source} saves product variants separately and preserves confirmed names after reload`, async t => {
    const records = inventoryMemory()
    const legacy = await InventoryItem.create({
      ...milk, user: owner, name: 'Rice', unit: 'pieces', quantity: 10,
      storage: 'pantry', storageZone: 'dry-storage', expiresAt: date('2026-11-20'),
    })
    const request = await startApp(t)
    const names = ['Brown Rice', 'White Rice', 'Spaghetti', 'Penne']
    const items = names.map((name, i) => ({
      name: `  ${name.replace(' ', '   ')}  `, quantity: i + 1, unit: 'pieces',
      weightKg: (i + 1) * 0.5, purchasePrice: i + 2,
      storage: 'pantry', storageZone: 'dry-storage', category: 'pantry_staples',
      dietType: i < 2 ? 'vegan' : 'vegetarian', purchasedAt: '2026-10-01', expiresAt: '2026-11-20',
    }))
    const first = await request('/scanning/confirm', 'POST', { source, items })
    assert.equal(first.added, 4)
    assert.equal(first.merged, 0)
    assert.deepEqual(first.items.map(item => item.name), names)
    assert.equal(new Set(first.items.map(item => item._id)).size, 4)

    const second = await request('/scanning/confirm', 'POST', {
      source, items: [{ ...items[0], quantity: 2, weightKg: 1, purchasePrice: 3 }],
    })
    assert.equal(second.added, 0)
    assert.equal(second.merged, 1)
    assert.equal(second.items[0]._id, first.items[0]._id)
    const loaded = (await request('/inventory')).items.map(normaliseItem)
    const products = names.map(name => loaded.find(item => item.name === name))
    assert.deepEqual(products.map(item => item.name), names)
    assert.deepEqual(products.map(item => item.quantity), [3, 2, 3, 4])
    assert.deepEqual(products.map(item => item.weightKg), [1.5, 1, 1.5, 2])
    assert.deepEqual(products.map(item => item.purchasePrice), [5, 3, 4, 5])
    for (const item of products) {
      assert.equal(item.unit, 'pieces')
      assert.equal(item.category, 'pantry_staples')
      assert.equal(item.suggestedLocation, 'dry-storage')
      assert.equal(item.expiresAt, '2026-11-20')
    }
    assert.deepEqual(records.find(item => item._id === legacy._id), legacy)
  })

  test(`${source} confirmation preserves batch IDs and quantities after inventory reload and an isolated edit`, async t => {
    inventoryMemory()
    const request = await startApp(t)
    const entry = {
      ...milk, name: source === 'manual' ? 'Full cream milk' : 'Milk',
      category: 'dairy', dietType: 'vegetarian', weightKg: 1, purchasedAt: '2026-10-01',
    }
    const first = await request('/scanning/confirm', 'POST', { source, items: [
      { ...entry, expiresAt: '2026-11-10' }, { ...entry, expiresAt: '2026-11-20' },
    ] })
    assert.equal(first.added, 2)
    assert.equal(new Set(first.items.map(item => item._id)).size, 2)
    const second = await request('/scanning/confirm', 'POST', { source, items: [{ ...entry, quantity: 2, expiresAt: '2026-11-10' }] })
    assert.equal(second.added, 0)
    assert.equal(second.merged, 1)
    assert.equal(second.items[0]._id, first.items[0]._id)

    const loaded = (await request('/inventory')).items.map(normaliseItem)
    assert.deepEqual(loaded.map(item => [item.name, item.quantity, item.expiresAt]), [
      [entry.name, 3, '2026-11-10'], [entry.name, 1, '2026-11-20'],
    ])
    assert.equal(new Set(loaded.map(item => item.id)).size, 2)
    await request(`/inventory/${loaded[0].id}`, 'PATCH', { quantity: 2 })
    const refreshed = (await request('/inventory')).items.map(normaliseItem)
    assert.equal(refreshed[0].id, loaded[0].id)
    assert.equal(refreshed[0].quantity, 2)
    assert.deepEqual(refreshed[1], loaded[1])
  })
}
