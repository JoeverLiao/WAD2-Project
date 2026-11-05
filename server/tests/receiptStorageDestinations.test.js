import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import InventoryItem from '../models/inventoryItemModel.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'
import { addItemsToInventory, groupSameProducts } from '../services/inventoryService.js'
import inventoryController from '../controllers/inventoryController.js'

afterEach(() => mock.restoreAll())
const apple = { name: 'Apple', quantity: 1, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf' }

test('receipt validation ignores legacy appliance names', () => {
  const valid = validateInventoryItems([
    { ...apple, fridgeName: 'Fridge 2' },
    { ...apple, storage: 'pantry', storageZone: 'dry-storage', pantryName: 'Pantry 2' },
  ])
  assert.deepEqual(valid.errors, [])
  for (const item of valid.items) {
    assert.equal(Object.hasOwn(item, 'fridgeName'), false)
    assert.equal(Object.hasOwn(item, 'pantryName'), false)
  }
})

test('inventory updates cannot rename or assign additional appliances', async () => {
  const write = mock.method(InventoryItem, 'findOneAndUpdate', async () => { throw new Error('Must not save') })
  let status
  await inventoryController.updateItem({
    userId: 'owner', params: { id: '507f1f77bcf86cd799439011' },
    body: { fridgeName: 'Fridge 2', pantryName: 'Pantry 2' },
  }, { status: code => { status = code; return { json: () => {} } } }, error => { throw error })
  assert.equal(status, 400)
  assert.equal(write.mock.callCount(), 0)
})

test('legacy appliance names no longer split the same product within one compartment', () => {
  const groups = groupSameProducts([
    apple, { ...apple, fridgeName: 'Main fridge' },
    { ...apple, fridgeName: 'Fridge 2' },
    { ...apple, storageZone: 'door-lower' },
    { ...apple, storage: 'pantry', storageZone: 'dry-storage', pantryName: 'Pantry 2' },
  ])
  assert.equal(groups.length, 3)
  assert.equal(groups[0].quantity, 3)
  assert.equal(groups[1].storageZone, 'door-lower')
  assert.equal(groups[2].storage, 'pantry')
})

test('receipt upserts use only Fridge or Pantry compartments and include legacy stock', async () => {
  let operations
  mock.method(InventoryItem, 'bulkWrite', async ops => {
    operations = ops
    return { upsertedCount: ops.length }
  })
  mock.method(InventoryItem, 'findOne', filter => ({ collation: () => ({ lean: async () => {
    const operation = operations.find(op => op.updateOne.filter === filter).updateOne
    return { _id: String(operations.indexOf(operations.find(op => op.updateOne === operation))),
      ...filter, ...operation.update.$setOnInsert, ...operation.update.$inc }
  } }) }))
  const result = await addItemsToInventory('owner', [
    apple, { ...apple, fridgeName: 'Fridge 2' },
    { ...apple, storage: 'pantry', storageZone: 'dry-storage', pantryName: 'Pantry 2' },
  ])
  assert.equal(result.saved, 2)
  assert.equal(operations[0].updateOne.filter.storage, 'fridge')
  assert.equal(operations[0].updateOne.filter.storageZone, 'middle-shelf')
  assert.equal(operations[1].updateOne.filter.storage, 'pantry')
  for (const { updateOne } of operations) {
    assert.equal(Object.hasOwn(updateOne.filter, 'fridgeName'), false)
    assert.equal(Object.hasOwn(updateOne.filter, 'pantryName'), false)
    assert.equal(Object.hasOwn(updateOne.filter, '$or'), false)
    assert.equal(Object.hasOwn(updateOne.update.$setOnInsert, 'fridgeName'), false)
    assert.equal(Object.hasOwn(updateOne.update.$setOnInsert, 'pantryName'), false)
  }
})
