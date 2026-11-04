import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import InventoryItem from '../models/inventoryItemModel.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'
import { addItemsToInventory, groupSameProducts } from '../services/inventoryService.js'

afterEach(() => mock.restoreAll())
const apple = { name: 'Apple', quantity: 1, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf' }

test('receipt validation retains only the applicable named storage and rejects invalid names', () => {
  const valid = validateInventoryItems([
    { ...apple, fridgeName: ' Fridge 2 ' },
    { ...apple, storage: 'pantry', storageZone: 'dry-storage', pantryName: 'Pantry 2' },
  ])
  assert.deepEqual(valid.errors, [])
  assert.equal(valid.items[0].fridgeName, 'Fridge 2')
  assert.equal(valid.items[1].pantryName, 'Pantry 2')
  for (const value of [32, {}, 'x'.repeat(61)]) {
    const bad = validateInventoryItems([{ ...apple, fridgeName: value }])
    assert.equal(bad.errors[0].field, 'fridgeName')
    assert.deepEqual(bad.items, [])
  }
})

test('the same product merges only within the same appliance and compartment', () => {
  const groups = groupSameProducts([
    apple, { ...apple, fridgeName: 'Main fridge' },
    { ...apple, fridgeName: 'Fridge 2' },
    { ...apple, storageZone: 'door-lower' },
    { ...apple, storage: 'pantry', storageZone: 'dry-storage', pantryName: 'Pantry 2' },
  ])
  assert.equal(groups.length, 4)
  assert.equal(groups[0].quantity, 2)
  assert.equal(groups[1].fridgeName, 'Fridge 2')
  assert.equal(groups[2].storageZone, 'door-lower')
  assert.equal(groups[3].pantryName, 'Pantry 2')
})

test('receipt upserts and returned saved items retain each selected destination', async () => {
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
  assert.equal(result.saved, 3)
  assert.deepEqual(operations[0].updateOne.filter.$or, [{ fridgeName: 'Main fridge' }, { fridgeName: null }])
  assert.equal(operations[1].updateOne.filter.fridgeName, 'Fridge 2')
  assert.equal(operations[2].updateOne.filter.pantryName, 'Pantry 2')
  assert.equal(operations[1].updateOne.filter.storageZone, 'middle-shelf')
  assert.deepEqual(result.items.map(item => item.fridgeName || item.pantryName), ['Main fridge', 'Fridge 2', 'Pantry 2'])
})
