// Tests for POST /api/scanning/confirm (saving reviewed items). The database call is replaced
// by a stand-in, so no MongoDB is needed. Run:  node --test --test-force-exit tests/confirm.test.js
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mock, test } from 'node:test'
import express from 'express'
import auth from '../middleware/auth.js'
import InventoryItem from '../models/inventoryItemModel.js'
import scanningRoutes from '../routes/scanningRoutes.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'

const USER_ID = '507f1f77bcf86cd799439011'
const cookie = { Cookie: `token=${auth.signToken({ id: USER_ID })}` }

async function startApp(t) {
  const app = express()
  app.use(express.json())
  app.use('/api/scanning', scanningRoutes)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  )
  return `http://127.0.0.1:${server.address().port}`
}

// Saving needs every required detail. To keep most tests short, `post` fills in missing required
// details; `postRaw` sends the body exactly as given (used to test the required-field rules).
const ZONE_FOR = { fridge: 'middle-shelf', freezer: 'freezer-main', pantry: 'dry-storage' }
const withRequired = (item) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
  const dairy = item.category !== 'non_food'
  return {
    category: 'other',
    weightKg: 1,
    purchasedAt: '2026-10-12',
    ...(dairy ? { dietType: 'vegetarian', expiresAt: '2026-10-19' } : {}),
    ...(ZONE_FOR[item.storage] && !item.storageZone ? { storageZone: ZONE_FOR[item.storage] } : {}),
    ...item,
  }
}
const postRaw = (base, body, headers = cookie) =>
  fetch(`${base}/api/scanning/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const post = (base, body, headers = cookie) =>
  postRaw(base, Array.isArray(body?.items) ? { ...body, items: body.items.map(withRequired) } : body, headers)

const milk = { name: 'Milk', category: 'dairy', quantity: 2, unit: 'pieces', storage: 'fridge', purchasedAt: '2026-10-12', purchasePrice: 6.4 }
// Stand-in for the database: pretends every product was new (upserted) unless told otherwise.
const fakeBulk = (matched = 0) => async (ops) => ({ upsertedCount: ops.length - matched, matchedCount: matched })
const mockBulk = (t, impl = fakeBulk()) => {
  const bulk = mock.method(InventoryItem, 'bulkWrite', impl)
  t.after(() => bulk.mock.restore())
  return bulk
}

test('saving requires login', async (t) => {
  const base = await startApp(t)
  const response = await post(base, { items: [milk] }, {})
  assert.equal(response.status, 401)
})

test('saves valid items for the logged-in user', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)

  const response = await post(base, { items: [milk, { name: 'Eggs', quantity: '1', storage: 'fridge' }] })
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { saved: 2, added: 2, merged: 0 })

  const ops = bulk.mock.calls[0].arguments[0]
  assert.equal(ops.length, 2)
  const first = ops[0].updateOne
  assert.equal(first.filter.user, USER_ID)
  assert.equal(first.filter.name, 'Milk')
  assert.equal(first.upsert, true)
  assert.deepEqual(first.collation, { locale: 'en', strength: 2 })
  assert.deepEqual(first.update.$inc, { quantity: 2, weightKg: 1, purchasePrice: 6.4 })
  assert.equal(first.update.$setOnInsert.purchasedAt.toISOString(), '2026-10-12T12:00:00.000Z')
  assert.equal(ops[1].updateOne.update.$inc.quantity, 1) // "1" was turned into a number
  // The Smart Fridge details are always filled in, even when the request had none.
  assert.equal(first.update.$setOnInsert.category, 'dairy')
  assert.equal(first.update.$setOnInsert.suggestedLocation, 'middle-shelf')
  assert.equal(first.update.$setOnInsert.storageZone, 'middle-shelf')
  assert.deepEqual(first.update.$setOnInsert.allowedLocations, ['middle-shelf', 'upper-shelf'])
})

test('an item already in stock has its quantity increased, not a second entry', async (t) => {
  mockBulk(t, fakeBulk(1))
  const base = await startApp(t)
  const response = await post(base, { items: [milk, { name: 'Eggs', quantity: 6, storage: 'fridge' }] })
  assert.deepEqual(await response.json(), { saved: 2, added: 1, merged: 1 })
})

test('the same product on several rows is saved as one with the quantities added', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  const response = await post(base, {
    items: [
      { name: 'Coffee', quantity: 1, unit: 'pieces', storage: 'pantry', purchasePrice: 3 },
      { name: 'COFFEE', quantity: 2, unit: 'pieces', storage: 'pantry', purchasePrice: 6 },
    ],
  })
  assert.equal(response.status, 201)
  const ops = bulk.mock.calls[0].arguments[0]
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].updateOne.update.$inc, { quantity: 3, weightKg: 2, purchasePrice: 9 })
})

test('manual entry: no price needed, and common foods get their standard name', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  const response = await post(base, {
    source: 'manual',
    items: [
      { name: 'Full cream milk', quantity: 1, storage: 'fridge' },
      { name: 'Grandma special sauce', quantity: 2, storage: 'pantry' },
    ],
  })
  assert.equal(response.status, 201)
  const ops = bulk.mock.calls[0].arguments[0]
  assert.deepEqual(ops.map((o) => o.updateOne.filter.name), ['Milk', 'Grandma special sauce'])
  assert.deepEqual(ops[0].updateOne.update.$inc, { quantity: 1, weightKg: 1 }) // no price field at all
})

test('stores the smart details and the weight', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  const response = await post(base, {
    items: [
      { name: 'Chicken Breast', quantity: 1, weightKg: 0.5, unit: 'kg', storage: 'fridge', category: 'meat', icon: '🍗', suggestedLocation: 'lower-shelf', storageZone: 'lower-shelf', expiresAt: '2026-11-03' },
    ],
  })
  assert.equal(response.status, 201)
  const { update, filter } = bulk.mock.calls[0].arguments[0][0].updateOne
  assert.deepEqual(update.$inc, { quantity: 1, weightKg: 0.5 })
  assert.equal(update.$setOnInsert.icon, '🍗')
  assert.equal(update.$setOnInsert.suggestedLocation, 'lower-shelf')
  assert.equal(filter.storage, 'fridge')
})

test('a suggested location that is not allowed for the category is replaced by the rules', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  await post(base, { items: [{ name: 'Milk', quantity: 1, storage: 'fridge', category: 'dairy', suggestedLocation: 'door' }] })
  assert.equal(bulk.mock.calls[0].arguments[0][0].updateOne.update.$setOnInsert.suggestedLocation, 'middle-shelf')
})

test('a place that does not match fridge/freezer/pantry is rejected', async (t) => {
  const base = await startApp(t)
  const response = await post(base, { items: [{ name: 'Milk', quantity: 1, storage: 'pantry', storageZone: 'door' }] })
  assert.equal(response.status, 400)
  assert.deepEqual((await response.json()).details.map((d) => d.field), ['storageZone'])
})

test('an item needs a quantity', async (t) => {
  const base = await startApp(t)
  const response = await post(base, { items: [{ name: 'Milk', storage: 'fridge' }] })
  assert.equal(response.status, 400)
  assert.deepEqual((await response.json()).details.map((d) => d.field), ['quantity'])
})

test('the diet label is saved and checked', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  await post(base, { items: [{ name: 'Chicken Breast', quantity: 1, storage: 'fridge', dietType: 'other' }, { name: 'Broccoli', quantity: 1, storage: 'fridge', dietType: 'vegan' }] })
  const ops = bulk.mock.calls[0].arguments[0]
  assert.equal(ops[0].updateOne.update.$setOnInsert.dietType, 'other')
  assert.equal(ops[1].updateOne.update.$setOnInsert.dietType, 'vegan')
  const bad = await post(base, { items: [{ name: 'Broccoli', quantity: 1, storage: 'fridge', dietType: 'paleo' }] })
  assert.equal(bad.status, 400)
  assert.deepEqual((await bad.json()).details.map((d) => d.field), ['dietType'])
})

test('every required detail must be filled in before anything is saved', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)
  const response = await postRaw(base, { items: [{ name: 'Milk', quantity: 1, storage: 'fridge' }] })
  assert.equal(response.status, 400)
  const fields = (await response.json()).details.map((d) => d.field)
  assert.deepEqual(fields, ['purchasedAt', 'weightKg', 'category', 'storageZone', 'dietType', 'expiresAt'])
  assert.equal(bulk.mock.callCount(), 0)
})

test('only the price and the unit are optional', async (t) => {
  mockBulk(t)
  const base = await startApp(t)
  const full = { name: 'Chicken', quantity: 1, weightKg: 0.5, storage: 'fridge', storageZone: 'lower-shelf', category: 'meat', dietType: 'other', purchasedAt: '2026-10-12', expiresAt: '2026-10-14' }
  assert.equal((await postRaw(base, { items: [full] })).status, 201) // no price, no unit
  for (const field of ['name', 'quantity', 'weightKg', 'storageZone', 'category', 'dietType', 'expiresAt', 'purchasedAt']) {
    const { [field]: _removed, ...incomplete } = full
    const response = await postRaw(base, { items: [incomplete] })
    assert.equal(response.status, 400, `${field} should be required`)
    assert.equal((await response.json()).details[0].field, field)
  }
})

test('the owner comes from the login, never from the request', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)

  const response = await post(base, { items: [{ ...milk, user: '000000000000000000000000', _id: 'x', admin: true }] })
  assert.equal(response.status, 201)
  const [op] = bulk.mock.calls[0].arguments[0]
  assert.equal(op.updateOne.filter.user, USER_ID)
  assert.equal(JSON.stringify(op).includes('admin'), false)
  assert.equal(JSON.stringify(op).includes('000000000000000000000000'), false)
})

test('one bad item rejects the whole request and saves nothing', async (t) => {
  const bulk = mockBulk(t)
  const base = await startApp(t)

  const response = await post(base, { items: [milk, { ...milk, name: '   ', quantity: -1, storage: 'garage' }] })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.deepEqual(
    body.details.map((d) => [d.index, d.field]),
    [[1, 'name'], [1, 'quantity'], [1, 'storage'], [1, 'storageZone']],
  )
  assert.equal(bulk.mock.callCount(), 0)
})

test('rejects an empty or missing list', async (t) => {
  const base = await startApp(t)
  for (const body of [{}, { items: [] }, { items: 'milk' }]) {
    const response = await post(base, body)
    assert.equal(response.status, 400)
  }
})

test('a database failure gives a friendly 500, not a crash', async (t) => {
  mockBulk(t, async () => {
    throw new Error('connection lost')
  })
  const log = mock.method(console, 'error', () => {})
  t.after(() => log.mock.restore())
  const base = await startApp(t)
  const response = await post(base, { items: [milk] })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Could not save your items. Please try again.' })
})

test('a token with an invalid user id cannot save', async (t) => {
  const base = await startApp(t)
  const response = await post(base, { items: [milk] }, { Cookie: `token=${auth.signToken({ id: 'test-user' })}` })
  assert.equal(response.status, 401)
})

// ----- the validator on its own ------------------------------------------------------------

const today = new Date('2026-10-21T08:00:00+08:00')
const check = (item) => validateInventoryItems([{ ...milk, ...item }], { today })
const fieldsOf = (r) => r.errors.map((e) => e.field)

test('validator: accepts a good item and trims the name', () => {
  const r = check({ name: '  Fresh   Milk ' })
  assert.deepEqual(r.errors, [])
  assert.equal(r.items[0].name, 'Fresh Milk')
})

test('validator: cleaned items satisfy the real Mongoose schema', () => {
  const { items, errors } = validateInventoryItems(
    [milk, { name: 'Eggs', quantity: '1', storage: 'freezer' }, { name: 'Rice', quantity: 0.358, unit: 'kg', storage: 'pantry', purchasePrice: '4.5' }],
    { today },
  )
  assert.deepEqual(errors, [])
  for (const item of items) {
    const doc = new InventoryItem({ ...item, user: USER_ID })
    assert.equal(doc.validateSync(), undefined)
  }
})

test('validator: names', () => {
  assert.deepEqual(fieldsOf(check({ name: '' })), ['name'])
  assert.deepEqual(fieldsOf(check({ name: 'x'.repeat(101) })), ['name'])
  assert.deepEqual(fieldsOf(check({ name: 42 })), ['name'])
})

test('validator: quantities', () => {
  for (const quantity of [0, -1, '', null, 'abc', NaN, Infinity, 10000, 1.2345]) {
    assert.deepEqual(fieldsOf(check({ quantity })), ['quantity'], String(quantity))
  }
  for (const quantity of [1, 0.358, '2', '0.5', 9999]) {
    assert.deepEqual(check({ quantity }).errors, [], String(quantity))
  }
})

test('validator: storage', () => {
  assert.deepEqual(fieldsOf(check({ storage: 'garage' })), ['storage'])
  assert.deepEqual(fieldsOf(check({ storage: undefined })), ['storage'])
  for (const storage of ['fridge', 'freezer', 'pantry']) assert.deepEqual(check({ storage }).errors, [])
})

test('validator: dates', () => {
  assert.deepEqual(fieldsOf(check({ purchasedAt: '2026-02-30' })), ['purchasedAt'])
  assert.deepEqual(fieldsOf(check({ purchasedAt: '12/10/2026' })), ['purchasedAt'])
  assert.deepEqual(fieldsOf(check({ purchasedAt: '2026-10-30' })), ['purchasedAt']) // future
  assert.deepEqual(fieldsOf(check({ purchasedAt: '1999-01-01', expiresAt: '' })), ['purchasedAt'])
  assert.deepEqual(check({ purchasedAt: '2026-10-22', expiresAt: '' }).errors, []) // tomorrow is allowed
  assert.deepEqual(fieldsOf(check({ purchasedAt: '2026-10-12', expiresAt: '2026-10-11' })), ['expiresAt'])
  assert.deepEqual(fieldsOf(check({ expiresAt: '2040-01-01' })), ['expiresAt'])
  assert.deepEqual(check({ purchasedAt: '', expiresAt: '', purchasePrice: '', unit: '' }).errors, []) // all optional
})

test('validator: prices', () => {
  for (const purchasePrice of [-1, 'abc', 100001, 1.234]) {
    assert.deepEqual(fieldsOf(check({ purchasePrice })), ['purchasePrice'], String(purchasePrice))
  }
  for (const purchasePrice of [0, 3.5, '3.50', 0.1 + 0.2]) {
    assert.deepEqual(check({ purchasePrice }).errors, [], String(purchasePrice))
  }
  assert.equal(check({ purchasePrice: '3.50' }).items[0].purchasePrice, 3.5)
})

test('validator: limits the number of items', () => {
  assert.equal(validateInventoryItems(Array.from({ length: 101 }, () => milk), { today }).errors.length, 1)
  assert.deepEqual(validateInventoryItems(Array.from({ length: 100 }, () => milk), { today }).errors, [])
  assert.equal(validateInventoryItems([null], { today }).errors.length, 1)
})
