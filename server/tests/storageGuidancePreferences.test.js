import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import InventoryItem from '../models/inventoryItemModel.js'
import inventoryController from '../controllers/inventoryController.js'

afterEach(() => mock.restoreAll())
const owner = '507f1f77bcf86cd799439010'
const id = '507f1f77bcf86cd799439011'
const food = { _id: id, user: owner, name: 'Apples', quantity: 2, storage: 'fridge', storageZone: 'middle-shelf' }

test('ignoring and restoring guidance persists a boolean without changing food location', async () => {
  let stored = { ...food }
  mock.method(InventoryItem, 'findOne', async query => {
    assert.equal(query.user, owner)
    return stored
  })
  mock.method(InventoryItem, 'findOneAndUpdate', async (query, update, options) => {
    assert.equal(query.user, owner)
    assert.equal(options.runValidators, true)
    assert.deepEqual(Object.keys(update.$set), ['storageGuidanceIgnored'])
    const item = new InventoryItem({ ...stored, ...update.$set })
    await item.validate()
    stored = item.toObject()
    return stored
  })
  for (const ignored of [true, false]) {
    let response
    await inventoryController.updateItem({
      userId: owner, params: { id }, body: { storageGuidanceIgnored: ignored },
    }, {
      json: value => { response = value.item },
      status: code => { throw new Error(`Unexpected HTTP ${code}`) },
    }, error => { throw error })
    assert.equal(response.storageGuidanceIgnored, ignored)
    assert.equal(response.storageZone, food.storageZone)
    assert.equal(response.quantity, food.quantity)
  }
})

test('invalid storage guidance preferences are rejected before saving', async () => {
  mock.method(InventoryItem, 'findOne', async () => food)
  const write = mock.method(InventoryItem, 'findOneAndUpdate', async () => { throw new Error('Must not save') })
  for (const value of ['true', 1, null, {}]) {
    let status
    await inventoryController.updateItem({
      userId: owner, params: { id }, body: { storageGuidanceIgnored: value },
    }, {
      status: code => { status = code; return { json: () => {} } },
      json: () => { throw new Error('Must not succeed') },
    }, error => { throw error })
    assert.equal(status, 400)
  }
  assert.equal(write.mock.callCount(), 0)
})


test('moving a legacy item uses stored suggestions or receipt rules and renews guidance outside allowed storage', async () => {
  for (const original of [
    { ...food, name: 'Milk', storageGuidanceIgnored: true },
    { ...food, storageZone: 'crisper', suggestedLocation: 'crisper', allowedLocations: ['crisper'], storageGuidanceIgnored: true },
  ]) {
    let saved
    const find = mock.method(InventoryItem, 'findOne', async () => original)
    const write = mock.method(InventoryItem, 'findOneAndUpdate', async (_query, update) => {
      const item = new InventoryItem({ ...original, ...update.$set })
      await item.validate()
      return item.toObject()
    })
    await inventoryController.updateItem({
      userId: owner, params: { id }, body: { storage: 'fridge', storageZone: 'door-lower' },
    }, {
      json: value => { saved = value.item },
      status: code => { throw new Error(`Unexpected HTTP ${code}`) },
    }, error => { throw error })
    assert.equal(saved.storageGuidanceIgnored, false)
    assert.ok(saved.allowedLocations.length)
    assert.ok(!saved.allowedLocations.includes(saved.storageZone))
    assert.ok(saved.allowedLocations.includes(saved.suggestedLocation))
    assert.equal(saved.storageZone, 'door-lower')
    find.mock.restore()
    write.mock.restore()
  }
})

test('moving between recommended compartments keeps ignored guidance preferences', async () => {
  const original = { ...food, unit: 'pieces', suggestedLocation: 'middle-shelf', allowedLocations: ['middle-shelf', 'upper-shelf'], storageGuidanceIgnored: true }
  mock.method(InventoryItem, 'findOne', async () => original)
  mock.method(InventoryItem, 'findOneAndUpdate', async (_query, update) => ({ ...original, ...update.$set }))
  let saved
  await inventoryController.updateItem({
    userId: owner, params: { id }, body: { storage: 'fridge', storageZone: 'upper-shelf' },
  }, { json: value => { saved = value.item }, status: code => { throw new Error(`Unexpected HTTP ${code}`) } }, error => { throw error })
  assert.equal(saved.storageGuidanceIgnored, true)
})
