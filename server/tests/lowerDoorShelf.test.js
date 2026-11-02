import { afterEach, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import InventoryItem from '../models/inventoryItemModel.js'
import inventoryController from '../controllers/inventoryController.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'

afterEach(() => mock.restoreAll())

const owner = '507f1f77bcf86cd799439012'
const id = '507f1f77bcf86cd799439011'
const food = { user: owner, name: 'Apples', quantity: 3, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf' }

test('the database model and confirmed-item validation accept the lower door shelf', async () => {
  await new InventoryItem({ ...food, storageZone: 'door-lower' }).validate()
  const result = validateInventoryItems([{ ...food, storageZone: 'door-lower' }])
  assert.deepEqual(result.errors, [])
  assert.equal(result.items[0].storageZone, 'door-lower')
})

test('moving into and out of the lower door shelf passes actual database schema validation', async () => {
  let saved = { ...food }
  mock.method(InventoryItem, 'findOne', async () => saved)
  mock.method(InventoryItem, 'findOneAndUpdate', async (_query, update, options) => {
    assert.equal(options.runValidators, true)
    const next = { ...saved, ...update.$set }
    await new InventoryItem(next).validate()
    saved = next
    return next
  })
  for (const body of [
    { storage: 'fridge', storageZone: 'door-lower' },
    { quantity: 2 },
    { storage: 'fridge', storageZone: 'middle-shelf' },
  ]) {
    let response
    const res = {
      json: data => { response = data },
      status: code => { throw new Error(`Unexpected HTTP ${code}`) },
    }
    await inventoryController.updateItem({ userId: owner, params: { id }, body }, res, error => { throw error })
    assert.equal(response.item.storageZone, body.storageZone || 'door-lower')
  }
  assert.equal(saved.quantity, 2)
})
