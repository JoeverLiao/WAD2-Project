import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../app.js'

async function startApp(t, databaseHealth) {
  const server = createApp({ databaseHealth }).listen(0, '127.0.0.1')
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

test('health is successful only when the database responds', async (t) => {
  let calls = 0
  const base = await startApp(t, async () => {
    calls++
  })
  const response = await fetch(`${base}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' })
  assert.equal(calls, 1)
})

test('database errors return 503 without exposing connection details', async (t) => {
  const base = await startApp(t, async () => {
    throw new Error('private connection details')
  })
  const response = await fetch(`${base}/api/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { status: 'unavailable', database: 'disconnected' })
})

test('feature endpoints explicitly remain unimplemented', async (t) => {
  const base = await startApp(t, async () => {})
  for (const [method, path] of [
    ['POST', '/auth/register'],
    ['POST', '/auth/login'],
    ['POST', '/auth/logout'],
    ['GET', '/auth/me'],
    ['PATCH', '/auth/me'],
    ['GET', '/dashboard'],
    ['POST', '/scanning/receipts'],
    ['POST', '/scanning/products'],
    ['POST', '/scanning/confirm'],
    ['GET', '/inventory'],
    ['POST', '/inventory'],
    ['GET', '/inventory/example'],
    ['PATCH', '/inventory/example'],
    ['DELETE', '/inventory/example'],
    ['GET', '/freshness'],
    ['GET', '/freshness/recipes'],
    ['GET', '/rescue'],
    ['POST', '/rescue'],
    ['GET', '/rescue/example'],
    ['PATCH', '/rescue/example'],
    ['DELETE', '/rescue/example'],
    ['POST', '/rescue/example/claim'],
    ['DELETE', '/rescue/example/claim'],
    ['GET', '/analytics'],
    ['GET', '/analytics/history'],
    ['POST', '/analytics/events'],
  ]) {
    const response = await fetch(`${base}/api${path}`, { method })
    assert.equal(response.status, 501, `${method} ${path}`)
    assert.equal((await response.json()).error, 'Not implemented')
  }
})

test('unknown routes return JSON 404', async (t) => {
  const base = await startApp(t, async () => {})
  const response = await fetch(`${base}/api/unknown`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Route not found' })
})

test('malformed and oversized JSON are rejected', async (t) => {
  const base = await startApp(t, async () => {})
  const malformed = await fetch(`${base}/api/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.deepEqual(await malformed.json(), { error: 'Invalid JSON body' })
  const oversized = await fetch(`${base}/api/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x'.repeat(1024 * 1024) }),
  })
  assert.equal(oversized.status, 413)
})
