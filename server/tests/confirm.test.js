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

const post = (base, body, headers = cookie) =>
  fetch(`${base}/api/scanning/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const milk = { name: 'Fresh Milk 1L', quantity: 2, unit: 'pieces', storage: 'fridge', purchasedAt: '2026-10-12', expiresAt: '2026-10-19', purchasePrice: 6.4 }
const fakeSave = (docs) => docs.map((d, i) => ({ _id: { toString: () => `id${i}` }, ...d }))

test('saving requires login', async (t) => {
  const base = await startApp(t)
  const response = await post(base, { items: [milk] }, {})
  assert.equal(response.status, 401)
})

test('saves valid items for the logged-in user and returns them', async (t) => {
  const insert = mock.method(InventoryItem, 'insertMany', async (docs) => fakeSave(docs))
  t.after(() => insert.mock.restore())
  const base = await startApp(t)

  const response = await post(base, { items: [milk, { name: 'Eggs', quantity: '1', storage: 'fridge' }] })
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.saved, 2)
  assert.equal(body.items[0].name, 'Fresh Milk 1L')

  const docs = insert.mock.calls[0].arguments[0]
  assert.equal(docs.length, 2)
  assert.equal(docs[0].user, USER_ID)
  assert.equal(docs[1].quantity, 1) // "1" was turned into a number
  assert.ok(docs[0].purchasedAt instanceof Date)
  assert.equal(docs[0].purchasedAt.toISOString(), '2026-10-12T12:00:00.000Z')
})

test('the owner comes from the login, never from the request', async (t) => {
  const insert = mock.method(InventoryItem, 'insertMany', async (docs) => fakeSave(docs))
  t.after(() => insert.mock.restore())
  const base = await startApp(t)

  const response = await post(base, { items: [{ ...milk, user: '000000000000000000000000', _id: 'x', admin: true }] })
  assert.equal(response.status, 201)
  const [doc] = insert.mock.calls[0].arguments[0]
  assert.equal(doc.user, USER_ID)
  assert.equal(doc.admin, undefined)
  assert.equal(doc._id, undefined)
})

test('one bad item rejects the whole request and saves nothing', async (t) => {
  const insert = mock.method(InventoryItem, 'insertMany', async (docs) => fakeSave(docs))
  t.after(() => insert.mock.restore())
  const base = await startApp(t)

  const response = await post(base, { items: [milk, { ...milk, name: '   ', quantity: -1, storage: 'garage' }] })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.deepEqual(
    body.details.map((d) => [d.index, d.field]),
    [[1, 'name'], [1, 'quantity'], [1, 'storage']],
  )
  assert.equal(insert.mock.callCount(), 0)
})

test('rejects an empty or missing list', async (t) => {
  const base = await startApp(t)
  for (const body of [{}, { items: [] }, { items: 'milk' }]) {
    const response = await post(base, body)
    assert.equal(response.status, 400)
  }
})

test('a database failure gives a friendly 500, not a crash', async (t) => {
  const insert = mock.method(InventoryItem, 'insertMany', async () => {
    throw new Error('connection lost')
  })
  const log = mock.method(console, 'error', () => {})
  t.after(() => {
    insert.mock.restore()
    log.mock.restore()
  })
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
