import { afterEach, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import InventoryItem from '../models/inventoryItemModel.js'
import inventoryController from '../controllers/inventoryController.js'
import { addItemsToInventory } from '../services/inventoryService.js'

afterEach(() => mock.restoreAll())

test('inventory defaults use a zone matching the storage location', () => {
  for (const [storage, zone] of [['pantry', 'dry-storage'], ['freezer', 'freezer-main'], ['fridge', 'middle-shelf']]) {
    assert.equal(new InventoryItem({ storage }).storageZone, zone)
  }
})

test('scanned upserts set the correct zone explicitly', async () => {
  let operations
  mock.method(InventoryItem, 'bulkWrite', async (value) => { operations = value; return {} })
  await addItemsToInventory('owner', [{ name: 'Rice', quantity: 2, storage: 'pantry' }, { name: 'Peas', quantity: 1, storage: 'freezer' }])
  assert.equal(operations[0].updateOne.update.$setOnInsert.storageZone, 'dry-storage')
  assert.equal(operations[1].updateOne.update.$setOnInsert.storageZone, 'freezer-main')
})

test('partial quantity updates repair a legacy pantry shelf instead of rejecting it', async () => {
  const existing = { name: 'Rice', quantity: 3, unit: 'packets', storage: 'pantry', storageZone: 'middle-shelf' }
  mock.method(InventoryItem, 'findOne', async () => existing)
  let saved
  mock.method(InventoryItem, 'findOneAndUpdate', async (_query, update) => { saved = update.$set; return { ...existing, ...saved } })
  const res = { json: () => {}, status: () => { throw new Error('Unexpected validation failure') } }
  await inventoryController.updateItem({ userId: 'owner', params: { id: '507f1f77bcf86cd799439011' }, body: { quantity: 2 } }, res, (error) => { throw error })
  assert.equal(saved.quantity, 2)
  assert.equal(saved.storageZone, 'dry-storage')
})
