// Tests for POST /api/scanning/receipts. The route is mounted on a small Express app, so no
// database is needed. Run from the server folder:  node --test tests/scanning.test.js
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import { test } from 'node:test'
import express from 'express'
import auth from '../middleware/auth.js'
import scanningRoutes from '../routes/scanningRoutes.js'
import { canRenderText, renderReceiptPhoto } from './helpers/receiptPhoto.js'

async function startApp(t) {
  const app = express()
  app.use('/api/scanning', scanningRoutes)
  const server = app.listen(0, '127.0.0.1')
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

const authHeaders = { Cookie: `token=${auth.signToken({ id: 'test-user' })}` }

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

// End to end: a faded, tilted, shadowed photo goes through preprocessing and real OCR.
// Needs the English language data to be downloaded already (server/.tesseract-cache), so it is
// skipped on a fresh checkout instead of failing without internet.
const languageData = new URL('../.tesseract-cache/eng.traineddata', import.meta.url)
const e2eSkip = !fs.existsSync(languageData)
  ? 'OCR language data not downloaded yet (run one scan first)'
  : !(await canRenderText())
    ? 'no usable font for drawing the test image'
    : false

test('receipt scanning reads a faded, tilted, shadowed photo', { skip: e2eSkip }, async (t) => {
  const base = await startApp(t)
  const photo = await renderReceiptPhoto({ tilt: 3, ink: '#8f8f8f', shadow: 0.35, blur: 1 })
  const response = await postReceipt(base, { body: receiptForm(photo, 'image/jpeg', 'photo.jpg') })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(typeof result.confidence, 'number')
  assert.equal(typeof result.lowConfidence, 'boolean')
  for (const expected of ['MILK', '6.40', 'EGGS', '3.20', 'TOTAL', '19.65']) {
    assert.ok(result.rawText.includes(expected), `"${expected}" missing from: ${result.rawText}`)
  }
  // The text is also parsed into items, ready for the review form.
  assert.equal(result.parsed.purchasedAt, '2026-10-12')
  assert.equal(result.parsed.total, 19.65)
  const names = result.parsed.items.map((item) => item.name.toLowerCase())
  assert.ok(names.some((n) => n.includes('milk')), `no milk in ${names}`)
  assert.ok(names.some((n) => n.includes('egg')), `no eggs in ${names}`)
})
