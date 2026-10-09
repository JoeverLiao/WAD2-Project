import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectDatabase, checkDatabase, initializeCollections } from '../config/database.js'
import { databaseModels } from '../models/index.js'
import InventoryItem from '../models/InventoryItem.js'
import FoodListing from '../models/FoodListing.js'
import FoodEvent from '../models/FoodEvent.js'
import User from '../models/User.js'

test('missing database configuration and disconnected health fail explicitly', async () => {
  await assert.rejects(connectDatabase(''), /mongodbUri is required/)
  await assert.rejects(connectDatabase('mongodb://127.0.0.1:27017/'), /dbName is required/)
  await assert.rejects(checkDatabase(), /disconnected/)
})

test('initialization waits for each collection and its indexes', async (t) => {
  const calls = []
  for (const model of databaseModels) {
    t.mock.method(model, 'createCollection', async () => {
      calls.push(`${model.collection.name}:collection`)
    })
    t.mock.method(model, 'createIndexes', async () => {
      calls.push(`${model.collection.name}:indexes`)
    })
  }
  await initializeCollections()
  assert.deepEqual(calls, [
    'users:collection',
    'users:indexes',
    'inventory_items:collection',
    'inventory_items:indexes',
    'food_listings:collection',
    'food_listings:indexes',
    'food_events:collection',
    'food_events:indexes',
  ])
})

test('initialization failure prevents successful startup', async (t) => {
  t.mock.method(User, 'createCollection', async () => {})
  t.mock.method(User, 'createIndexes', async () => {
    throw new Error('Index creation failed')
  })
  const nextCollection = t.mock.method(InventoryItem, 'createCollection', async () => {})
  await assert.rejects(initializeCollections(), /Index creation failed/)
  assert.equal(nextCollection.mock.callCount(), 0)
})

test('starter models require owners and valid inventory/food event fields', async () => {
  const owner = '507f1f77bcf86cd799439011'
  await assert.doesNotReject(
    new InventoryItem({ user: owner, name: 'Rice', storage: 'pantry' }).validate(),
  )
  await assert.rejects(
    new InventoryItem({ name: 'Rice', storage: 'cupboard', quantity: -1 }).validate(),
    (error) => Boolean(error.errors.user && error.errors.storage && error.errors.quantity),
  )
  await assert.rejects(new User({ name: 'Example' }).validate(), (error) =>
    Boolean(error.errors.email),
  )
  await assert.rejects(new FoodListing({ title: 'Rice' }).validate(), (error) =>
    Boolean(error.errors.user),
  )
  await assert.rejects(
    new FoodEvent({ user: owner, action: 'unknown', quantity: 1 }).validate(),
    (error) => Boolean(error.errors.action),
  )
})
