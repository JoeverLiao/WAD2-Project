import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../app.js'
import { signToken } from '../middleware/auth.js'

async function startApp(t) {
  const server = createApp({ databaseHealth: async () => {} }).listen(0, '127.0.0.1')
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

const authHeaders = { Cookie: `token=${signToken({ id: 'test-user' })}` }

function receiptForm(bytes, type, name) {
  const form = new FormData()
  form.append('receipt', new Blob([bytes], { type }), name)
  return form
}

async function postReceipt(base, { headers = authHeaders, body } = {}) {
  return fetch(`${base}/api/scanning/receipts`, { method: 'POST', headers, body })
}

test('receipt scanning requires authentication', async (t) => {
  const base = await startApp(t)
  const response = await postReceipt(base, { headers: {} })
  assert.equal(response.status, 401)
})

test('receipt scanning rejects a request with no image', async (t) => {
  const base = await startApp(t)
  const response = await postReceipt(base, { body: new FormData() })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'No receipt image was uploaded.' })
})

test('receipt scanning rejects non-image files', async (t) => {
  const base = await startApp(t)
  const response = await postReceipt(base, {
    body: receiptForm('hello', 'text/plain', 'receipt.txt'),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Only JPG, PNG or WEBP images are allowed.' })
})

test('receipt scanning rejects images over 8 MB', async (t) => {
  const base = await startApp(t)
  const response = await postReceipt(base, {
    body: receiptForm(new Uint8Array(8 * 1024 * 1024 + 1), 'image/png', 'big.png'),
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /too large/)
})

test('receipt scanning rejects a file that is not really an image', async (t) => {
  const base = await startApp(t)
  const response = await postReceipt(base, {
    body: receiptForm('this is not a png', 'image/png', 'fake.png'),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'That file could not be read as an image.' })
})
