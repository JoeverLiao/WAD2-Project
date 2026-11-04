import { test, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import controller, { validateEvent } from '../controllers/analyticsController.js'
import inventoryController from '../controllers/inventoryController.js'
import InventoryItem from '../models/inventoryItemModel.js'
import FoodEvent from '../models/foodEventModel.js'

afterEach(() => mock.restoreAll())
const userId = '507f1f77bcf86cd799439012'
test('manual activity validates numbers, action and date', () => {
  const valid = { name: 'Milk', unit: 'carton', location: 'Kitchen', action: 'discarded',
    quantity: 1, weightKg: 1, valueSgd: 3, occurredAt: '2026-01-01' }
  assert.equal(validateEvent(valid).name, 'Milk')
  for (const changes of [{ weightKg: -1 }, { valueSgd: NaN }, { action: 'bad' }, { occurredAt: 'bad' }, { name: '' }]) {
    assert.throws(() => validateEvent({ ...valid, ...changes }))
  }
})
test('editing activity scopes the query to the signed-in user', async () => {
  mock.method(FoodEvent, 'findOneAndUpdate', async query => {
    assert.equal(query.user, userId)
    return null
  })
  let status
  await controller.updateEvent({ userId, params: { id: '507f1f77bcf86cd799439011' },
    body: { name: 'Milk', unit: 'carton', location: 'Kitchen', action: 'discarded',
      quantity: 1, weightKg: 1, valueSgd: 3, occurredAt: '2026-01-01' } },
  { status(code) { status = code; return this }, json() {} }, error => { throw error })
  assert.equal(status, 404)
})
test('partial consumption records proportional weight and value in the inventory transaction', async () => {
  const session = {}
  const item = { _id: '507f1f77bcf86cd799439011', user: userId, name: 'Rice', quantity: 4,
    unit: 'portions', weightKg: 2, purchasePrice: 8, storage: 'fridge',
    async save(options) { assert.equal(options.session, session) } }
  mock.method(mongoose.connection, 'transaction', async callback => callback(session))
  mock.method(InventoryItem, 'findOne', query => {
    assert.equal(query.user, userId)
    return { session: async () => item }
  })
  mock.method(FoodEvent, 'create', async (events, options) => {
    assert.equal(options.session, session)
    assert.equal(events[0].action, 'consumed')
    assert.equal(events[0].weightKg, .5)
    assert.equal(events[0].valueSgd, 2)
  })
  let result
  await inventoryController.updateItem({ userId, params: { id: item._id }, body: { activity: 'consumed', amount: 1 } },
    { json(data) { result = data }, status() { throw new Error('Unexpected status') } }, error => { throw error })
  assert.equal(result.item.quantity, 3)
  assert.equal(result.item.weightKg, 1.5)
  assert.equal(result.item.purchasePrice, 6)
})
