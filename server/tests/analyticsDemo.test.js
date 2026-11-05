import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import auth from '../middleware/auth.js'
import routes from '../routes/analyticsRoutes.js'
import FoodEvent from '../models/foodEventModel.js'
import { analyticsDemoEvents } from '../services/analyticsDemo.js'
import { validateEvent } from '../controllers/analyticsController.js'

afterEach(() => mock.restoreAll())
const owner = '507f1f77bcf86cd799439012'
const other = '507f1f77bcf86cd799439013'

test('generates 50 valid recent records with distinct IDs per user and stable IDs across retries', async () => {
  const now = new Date('2026-11-05T00:30:00Z')
  const events = analyticsDemoEvents(owner, now)
  assert.equal(events.length, 50)
  assert.equal(new Set(events.map(item => item._id)).size, 50)
  assert.ok(events.every(item => item.user === owner && item.occurredAt < now))
  assert.deepEqual(events.map(item => item._id), analyticsDemoEvents(owner, new Date('2026-11-06')).map(item => item._id))
  assert.ok(!analyticsDemoEvents(other, now).some(item => events.some(event => item._id === event._id)))
  for (const event of events) {
    validateEvent(event)
    await new FoodEvent(event).validate()
  }
})

test('requires authentication, ignores supplied owners, and inserts each user demo only once', async () => {
  const stored = new Map()
  let calls = 0
  mock.method(FoodEvent, 'bulkWrite', async operations => {
    calls++
    let upsertedCount = 0
    for (const { updateOne } of operations) {
      assert.equal(updateOne.filter.user, owner)
      assert.equal(updateOne.update.$setOnInsert.user, owner)
      assert.equal(updateOne.upsert, true)
      assert.deepEqual(Object.keys(updateOne.update), ['$setOnInsert'])
      if (!stored.has(updateOne.filter._id)) {
        stored.set(updateOne.filter._id, updateOne.update.$setOnInsert)
        upsertedCount++
      }
    }
    return { upsertedCount }
  })
  const app = express()
  app.use(express.json())
  app.use('/analytics', routes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/analytics/demo`
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401)
    assert.equal(calls, 0)
    const options = { method: 'POST', headers: { Cookie: `token=${auth.signToken({ id: owner })}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ user: other, userId: other }) }
    const first = await fetch(url, options)
    assert.equal(first.status, 200)
    assert.equal((await first.json()).added, 50)
    const second = await fetch(url, options)
    assert.equal((await second.json()).added, 0)
    assert.equal(stored.size, 50)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
